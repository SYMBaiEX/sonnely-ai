import { randomBytes } from "node:crypto";
import { isSignature } from "@solana/kit";
import bs58 from "bs58";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { parseCreditAmount } from "@/lib/credit-amount";
import { publicInference } from "@/lib/managed-access";
import { address, billing } from "@/lib/payments";
import { termsVersion } from "@/lib/policy";
import { treasuryPrivacyRingsStatus } from "@/lib/privacy-rings";
import { verifyPrivacyRingsNativeReceipt } from "@/lib/privacy-rings-native";
import {
  backend,
  ensureSameOrigin,
  errorResponse,
  json,
  readBody,
  sessionHash,
  SonnelyError,
} from "@/lib/server";

export const maxDuration = 30;
type Context = { params: Promise<{ operation: string }> };
const orderReference = z.strictObject({ reference: address });
const createOrder = z.strictObject({ amount: z.string().trim().min(1).max(24) });
const submitOrder = orderReference.extend({ signature: z.string().trim().refine(isSignature) });
const reviewOrder = z.discriminatedUnion("action", [
  orderReference.extend({ action: z.literal("approve"), confirmedReceipt: z.literal(true) }),
  orderReference.extend({ action: z.literal("reject"), reason: z.string().trim().min(1).max(500) }),
]);

function confidentialBilling() {
  const config = billing();
  return { ...config, rpc: process.env.SOLANA_PRIVACY_RINGS_RPC_URL || config.rpc };
}

async function invoiceSession(request: NextRequest) {
  const session = sessionHash(request);
  const { db, secret } = backend();
  const auth = { session, secret };
  const profile = await db.query(api.sonnely.profile, auth);
  if (!profile) throw new SonnelyError("Sign in with a Solana wallet.", 401);
  return { db, auth, profile };
}

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { operation } = await params;
    const { db, auth, profile } = await invoiceSession(request);
    if (operation === "review") {
      if (profile.role !== "admin") throw new SonnelyError("Administrator access required.", 403);
      const cursor = z.string().max(4000).optional().parse(request.nextUrl.searchParams.get("cursor") ?? undefined);
      return json(await db.query(api.confidentialPayments.queue, { ...auth, cursor }));
    }
    if (operation === "order") {
      const reference = address.parse(request.nextUrl.searchParams.get("reference"));
      return json(await db.query(api.confidentialPayments.details, { ...auth, reference }));
    }
    if (operation !== "orders") throw new SonnelyError("Unknown route.", 404);
    const config = confidentialBilling();
    const [order, history] = await Promise.all([
      db.query(api.confidentialPayments.active, auth),
      db.query(api.confidentialPayments.history, auth),
    ]);
    return json({
      available: Boolean(
        config.cluster === "mainnet" && config.billingEnabled && config.rpc && config.recipient &&
        config.recipient !== profile.wallet,
      ),
      order,
      history,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    ensureSameOrigin(request);
    const { operation } = await params;
    const { db, auth, profile } = await invoiceSession(request);
    const raw = await readBody(request, 4096);
    const config = confidentialBilling();

    if (operation === "orders") {
      if (publicInference() && profile.acceptedTerms !== termsVersion)
        throw new SonnelyError("Accept the current Sonnely terms before buying credits.", 403);
      if (config.cluster !== "mainnet" || !config.billingEnabled || !config.rpc || !config.recipient)
        throw new SonnelyError("Confidential USDC checkout is temporarily unavailable.", 503);
      if (config.recipient === profile.wallet)
        throw new SonnelyError("Use a different wallet to pay the Sonnely treasury.", 409);
      const amount = parseCreditAmount(createOrder.parse(raw).amount);
      if (amount === null) throw new SonnelyError("Enter a positive USDC amount with up to six decimal places.");
      if (!(await treasuryPrivacyRingsStatus()).registered)
        throw new SonnelyError("The Sonnely treasury is initializing Privacy Rings. Try again later.", 503);
      return json(await db.mutation(api.confidentialPayments.open, {
        ...auth, amount, treasury: config.recipient, reference: bs58.encode(randomBytes(32)),
      }));
    }

    if (operation === "cancel") {
      const { reference } = orderReference.parse(raw);
      return json(await db.mutation(api.confidentialPayments.cancel, { ...auth, reference }));
    }

    if (operation === "submit") {
      const { reference, signature } = submitOrder.parse(raw);
      const order = await db.query(api.confidentialPayments.details, { ...auth, reference });
      const treasuryViewingKey = process.env.SOLANA_PRIVACY_RINGS_TREASURY_VIEW_KEY?.trim();
      if (order.signature && order.signature !== signature)
        throw new SonnelyError("A transaction has already been recorded for this request.", 409);
      if (
        order.signature === signature &&
        !(treasuryViewingKey && order.status === "under_review" && order.reviewReason === "details-encrypted")
      )
        return json(order);
      if (!config.rpc) throw new SonnelyError("Solana confirmation is temporarily unavailable.", 503);
      const receipt = await verifyPrivacyRingsNativeReceipt({
        rpc: config.rpc,
        signature,
        sender: order.payer,
        treasury: order.treasury,
        amount: order.amount,
        createdAt: order.createdAt,
        expiresAt: Math.min(order.expiresAt, order.cancelledAt ?? order.expiresAt),
        treasuryViewingKey,
      });
      return json(await db.mutation(api.confidentialPayments.record, {
        ...auth,
        reference,
        signature: receipt.signature,
        slot: Number(receipt.slot),
        blockTime: receipt.blockTime,
        verified: receipt.status === "verified",
        reviewReason: receipt.status === "treasury-review" ? receipt.reviewReason : undefined,
      }));
    }

    if (operation === "review") {
      if (profile.role !== "admin") throw new SonnelyError("Administrator access required.", 403);
      const review = reviewOrder.parse(raw);
      const order = await db.query(api.confidentialPayments.reviewDetails, { ...auth, reference: review.reference });
      if (!order.signature) throw new SonnelyError("This payment has no finalized transaction to review.", 409);
      return json(await db.mutation(api.confidentialPayments.resolve, {
        ...auth,
        reference: review.reference,
        signature: order.signature,
        action: review.action,
        reason: review.action === "reject" ? review.reason : undefined,
      }));
    }

    throw new SonnelyError("Unknown route.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
