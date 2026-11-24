import { createHmac } from "node:crypto";
import { blockhash, createSolanaRpc, signature, type Base64EncodedWireTransaction } from "@solana/kit";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import {
  confidentialRelayRequest,
  privacyRingsRpcUrl,
  relayConfidentialPilot,
} from "@/lib/confidential-pilot-relay";
import type { ConfidentialPilotOrder } from "@/lib/confidential-pilot-types";
import { publicInference } from "@/lib/managed-access";
import { address, billing, finalizedBlockHeight, verifyCluster } from "@/lib/payments";
import { termsVersion } from "@/lib/policy";
import {
  verifyPrivacyRingsPilotDraft,
  verifyPrivacyRingsPilotReceipt,
  verifyPrivacyRingsPilotSignedWire,
} from "@/lib/privacy-rings-receipt";
import {
  backend,
  ensureSameOrigin,
  errorResponse,
  json,
  readBody,
  seal,
  sessionHash,
  SonnelyError,
  unseal,
} from "@/lib/server";

export const maxDuration = 60;
type Context = { params: Promise<{ operation: string }> };
const relayLimit = 270 * 1024;
const approvalSchema = z.strictObject({
  reference: address,
  payer: address,
  treasury: address,
  messageHash: z.string().regex(/^[a-f0-9]{64}$/),
  lastValidBlockHeight: z.number().int().positive(),
});
const orderRequest = z.strictObject({ reference: address });
const transactionWire = z.base64().min(1).max(5_464);
const draftRequest = orderRequest.extend({
  transaction: transactionWire,
  transactionViewingKey: z.base64().length(44),
});
const submitRequest = orderRequest.extend({
  transaction: transactionWire,
  approval: z.string().min(1).max(1200),
});
const chainStatus = z
  .object({
    confirmationStatus: z.enum(["processed", "confirmed", "finalized"]).nullable(),
    err: z.union([z.null(), z.string().min(1), z.record(z.string(), z.unknown())]),
  })
  .nullable();

function pilotConfig() {
  const config = billing();
  const rpc =
    config.cluster === "mainnet" &&
    config.recipient &&
    privacyRingsRpcUrl(process.env.SOLANA_PRIVACY_RINGS_RPC_URL ?? config.rpc);
  return rpc && config.recipient ? { rpc, treasury: config.recipient } : null;
}

async function pilotSession(request: NextRequest) {
  const session = sessionHash(request);
  const { db, secret } = backend();
  const auth = { session, secret };
  const profile = await db.query(api.sonnely.profile, auth);
  if (profile?.role !== "admin") throw new SonnelyError("Administrator access required.", 403);
  return {
    db,
    auth,
    payer: profile.wallet,
    termsRequired: publicInference() && profile.acceptedTerms !== termsVersion,
  };
}

function approvalSecret(secret: string) {
  return createHmac("sha256", secret).update("confidential-pilot:approval:v1").digest("hex");
}

function readApproval(secret: string, approval: string, order: ConfidentialPilotOrder) {
  try {
    const ticket = approvalSchema.parse(JSON.parse(unseal(approvalSecret(secret), approval)));
    if (
      ticket.reference === order.reference &&
      ticket.payer === order.payer &&
      ticket.treasury === order.treasury
    )
      return ticket;
  } catch {
    // All malformed approval tokens use the same recovery path.
  }
  throw new SonnelyError("Prepare and review this test transfer again.", 409);
}

export async function GET(request: NextRequest, { params }: Context) {
  try {
    if ((await params).operation !== "order") throw new SonnelyError("Unknown route.", 404);
    const { db, auth, payer, termsRequired } = await pilotSession(request);
    const config = pilotConfig();
    return json({
      available: Boolean(config && config.treasury !== payer && !termsRequired),
      order: await db.query(api.confidentialPilot.active, auth),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    ensureSameOrigin(request);
    const { operation } = await params;
    const { db, auth, payer, termsRequired } = await pilotSession(request);
    if (termsRequired && operation !== "status")
      throw new SonnelyError("Accept the current Sonnely terms before starting a pilot payment.", 403);
    const config = pilotConfig();
    const raw = await readBody(request, operation === "relay" ? relayLimit : 12_000);

    if (operation === "order") {
      throw new SonnelyError("Start a new Confidential USDC payment in Billing.", 410);
    }

    if (!["relay", "simulate", "submit", "status"].includes(operation))
      throw new SonnelyError("Unknown route.", 404);
    const { reference } = orderRequest.passthrough().parse(raw);
    const order = await db.query(api.confidentialPilot.details, { ...auth, reference });

    if (operation === "status") {
      orderRequest.parse(raw);
      if (order.status === "finalized" || !order.submission) return json(order);
      const rpc = config?.rpc.toString() ?? billing().rpc;
      if (!rpc) throw new SonnelyError("Solana settlement verification is unavailable.", 503);
      await verifyCluster(rpc, "mainnet");
      const staged = order.submission;
      const client = createSolanaRpc(rpc);
      async function readStatus(minimumSlot?: bigint) {
        try {
          const result = await client
            .getSignatureStatuses([signature(staged.signature)], { searchTransactionHistory: true })
            .send({ abortSignal: AbortSignal.timeout(10_000) });
          if (minimumSlot !== undefined && result.context.slot < minimumSlot)
            throw new Error("Stale status.");
          return chainStatus.parse(result.value[0]);
        } catch {
          throw new SonnelyError("Solana could not check the pilot transfer.", 503);
        }
      }
      let networkStatus = await readStatus();
      let expired = false;
      if (networkStatus === null && (await finalizedBlockHeight(rpc)) > staged.lastValidBlockHeight) {
        const slot = await client
          .getSlot({ commitment: "finalized" })
          .send({ abortSignal: AbortSignal.timeout(10_000) });
        networkStatus = await readStatus(slot);
        expired = networkStatus === null;
      }
      if (networkStatus?.confirmationStatus === "finalized" && networkStatus.err === null) {
        await verifyPrivacyRingsPilotReceipt({
          rpc,
          signature: staged.signature,
          sender: payer,
          treasury: order.treasury,
          reference,
          createdAt: order.createdAt,
          messageHash: staged.messageHash,
        });
        return json(
          await db.mutation(api.confidentialPilot.finalize, {
            ...auth,
            reference,
            payer,
            treasury: order.treasury,
            signature: staged.signature,
          }),
        );
      }
      if ((networkStatus?.confirmationStatus === "finalized" && networkStatus.err !== null) || expired) {
        return json(
          await db.mutation(api.confidentialPilot.release, {
            ...auth,
            reference,
            signature: staged.signature,
          }),
        );
      }
      return json(order);
    }

    if (!config) throw new SonnelyError("Confidential USDC is unavailable on this deployment.", 503);
    const rpc = config.rpc.toString();
    if (order.status !== "pending" || order.treasury !== config.treasury)
      throw new SonnelyError("Refresh Billing to start a new pilot order.", 409);
    if (order.submission && operation !== "submit")
      throw new SonnelyError("Check the previously submitted pilot payment first.", 409);

    if (operation === "relay")
      return await relayConfidentialPilot(config.rpc, confidentialRelayRequest.parse(raw));
    if (operation === "simulate") {
      const draft = draftRequest.parse(raw);
      const result = await verifyPrivacyRingsPilotDraft({
        rpc,
        transaction: draft.transaction,
        sender: payer,
        treasury: order.treasury,
        reference,
        transactionViewingKey: draft.transactionViewingKey,
      });
      const ticket = approvalSchema.parse({
        reference,
        payer,
        treasury: order.treasury,
        messageHash: result.messageHash,
        lastValidBlockHeight: Number(result.lastValidBlockHeight),
      });
      return json({
        feeLamports: result.feeLamports,
        payerDebitLamports: result.payerDebitLamports,
        approval: seal(approvalSecret(auth.secret), JSON.stringify(ticket)),
      });
    }

    const { transaction, approval } = submitRequest.parse(raw);
    const ticket = readApproval(auth.secret, approval, order);
    const signed = await verifyPrivacyRingsPilotSignedWire({
      transaction,
      sender: payer,
      reference,
      messageHash: ticket.messageHash,
    });
    const client = createSolanaRpc(rpc);
    await verifyCluster(rpc, "mainnet");
    const validity = await client
      .isBlockhashValid(blockhash(signed.blockhash), { commitment: "confirmed" })
      .send({ abortSignal: AbortSignal.timeout(10_000) });
    if (!validity.value)
      throw new SonnelyError(
        "The signed transaction has expired. Check its status before trying again.",
        409,
      );
    const staged = await db.mutation(api.confidentialPilot.stage, {
      ...auth,
      reference,
      payer,
      treasury: order.treasury,
      signature: signed.signature,
      messageHash: ticket.messageHash,
      lastValidBlockHeight: ticket.lastValidBlockHeight,
    });
    try {
      const result = await client
        .sendTransaction(transaction as Base64EncodedWireTransaction, {
          encoding: "base64",
          preflightCommitment: "confirmed",
          skipPreflight: false,
          maxRetries: 2n,
        })
        .send({ abortSignal: AbortSignal.timeout(12_000) });
      if (result !== signed.signature) throw new Error("Unexpected signature.");
    } catch {
      throw new SonnelyError(
        "Solana has not confirmed submission. Check the payment or retry the same signed transfer.",
        503,
      );
    }
    return json(staged);
  } catch (error) {
    return errorResponse(error);
  }
}
