import { adminAction, adminCrm, adminGateway, adminOverview } from "@/lib/admin-api";
import { createHmac, randomBytes } from "node:crypto";
import { createSignInMessageText } from "@solana/wallet-standard-util";
import type { SolanaSignInInput } from "@solana/wallet-standard-features";
import bs58 from "bs58";
import QRCode from "qrcode";
import { after, NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { address, billing, findMatchingPayment, finalizedBlockHeight, quote, verifyCluster, verifyPayment } from "@/lib/payments";
import { intentFunds } from "@/lib/intent-funding";
import { quoteSolPayment, solDecimal, type SolPayment } from "@/lib/sol-quote";
import { paymentEnvelopeResponse, paymentTransactionVersion, preparePaymentEnvelope } from "@/lib/payment-transaction";
import { offchainSignInFormat, verifyWalletSignIn } from "@/lib/solana-sign-in";
import { creditDecimal, parseCreditAmount } from "@/lib/credit-amount";
import { usageSince } from "@/lib/usage";
import {
  configuredProviders,
  nearIntentsFundingEnabled,
  publicInference,
  solFundingEnabled,
} from "@/lib/managed-access";
import { termsVersion } from "@/lib/policy";
import { infer } from "@/lib/inference";
import {
  backend,
  cookie,
  ensureSameOrigin,
  errorResponse,
  hash,
  json,
  readBody,
  SonnelyError,
  seal,
  sessionHash,
  sessionToken,
  serviceSecret,
  unseal,
} from "@/lib/server";

export const maxDuration = 60;
type Context = { params: Promise<{ task: string }> };
const duration = 300_000;
const field = (max: number) => z.string().trim().min(1).max(max);
const inviteCode = z.string().regex(/^[a-f0-9]{16}$/);
const signatureBytes = (length: number) => z.array(z.number().int().min(0).max(255)).length(length);
const priceCap = z.number().min(0.01).max(100_000).nullable();

async function paymentDraft(order: {
  reference: string;
  recipient: string;
  mint: string;
  amount: number;
  cluster: string;
  sol?: SolPayment;
  archivedAt?: number;
}) {
  const { reference, cluster, amount, sol, archivedAt } = order;
  if (archivedAt !== undefined) return { reference, cluster, amount, sol, archivedAt, uri: "", qr: "" };
  const payment = new URLSearchParams({
    amount: order.sol ? solDecimal(order.sol.lamports) : creditDecimal(order.amount),
    ...(order.sol ? {} : { "spl-token": order.mint }),
    reference: order.reference,
    label: "Sonnely",
    message: "Compute credit top-up",
  });
  const uri = "solana:" + order.recipient + "?" + payment.toString();
  const qr = await QRCode.toDataURL(uri, { margin: 2, width: 220 });
  return {
    uri,
    reference: order.reference,
    cluster: order.cluster,
    amount: order.amount,
    sol: order.sol,
    qr,
  };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { task } = await context.params;
    if (task === "session") {
      const { billingEnabled, paymentVerificationEnabled, cluster } = billing();
      const enabled = Boolean(process.env.CONVEX_URL && serviceSecret());
      const token = sessionToken(request);
      const connection = enabled && token ? backend() : null;
      const profile =
        connection && token
          ? await connection.db.query(api.sonnely.profile, {
              secret: connection.secret,
              session: hash(token),
            })
          : null;
      const termsRequired = publicInference() && profile !== null && profile.acceptedTerms !== termsVersion;
      return json({
        profile,
        termsRequired,
        enabled,
        inferenceEnabled: enabled && !termsRequired && configuredProviders().length > 0,
        billingEnabled: enabled && !termsRequired && billingEnabled,
        paymentVerificationEnabled: enabled && paymentVerificationEnabled,
        cluster,
      });
    }
    const session = sessionHash(request);
    const { db, secret } = backend();
    const auth = { secret, session };
    if (task === "keys") return json(await db.query(api.sonnely.listKeys, auth));
    if (task === "admin") return await adminOverview(auth, db, usageSince("30"));
    if (task === "admin-invoices") return json(await db.query(api.providerInvoices.history, auth));
    if (task === "admin-privacy-rings" || task === "billing-privacy-rings") {
      const profile = await db.query(api.sonnely.profile, auth);
      if (profile?.role !== "admin") throw new SonnelyError("Administrator access required.", 403);
      const { billingPrivacyRingsStatus, treasuryPrivacyRingsStatus } = await import("@/lib/privacy-rings");
      return json(
        task === "billing-privacy-rings"
          ? await billingPrivacyRingsStatus(profile.wallet)
          : await treasuryPrivacyRingsStatus(),
      );
    }
    if (task === "admin-gateway") return await adminGateway(request.nextUrl.searchParams, auth, db);
    if (task === "admin-crm") return await adminCrm(request.nextUrl.searchParams, auth, db);
    if (task === "referrals") return json(await db.query(api.sonnely.referrals, auth));
    if (task === "referral-pipeline") {
      const cursor = z.string().max(4000).nullable().parse(request.nextUrl.searchParams.get("cursor"));
      return json(
        await db.query(api.referralPipeline.list, { ...auth, paginationOpts: { cursor, numItems: 30 } }),
      );
    }
    if (task === "history") return json(await db.query(api.sonnely.history, auth));
    if (task === "sessions") return json(await db.query(api.sonnely.listSessions, auth));
    if (task === "support-tickets") {
      const cursor = z.string().max(4000).nullable().parse(request.nextUrl.searchParams.get("cursor"));
      return json(await db.query(api.support.myTickets, { ...auth, page: { cursor, numItems: 20 } }));
    }
    if (task === "support-thread") {
      const id = z.string().min(1).max(64).parse(request.nextUrl.searchParams.get("id")) as Id<"tickets">;
      return json(await db.query(api.support.myThread, { ...auth, id }));
    }
    if (task === "payment") {
      const reference = address.parse(request.nextUrl.searchParams.get("reference"));
      const order = await db.query(api.sonnely.depositDetails, { ...auth, reference });
      if (order.signature) throw new SonnelyError("This payment is already finalized.", 409);
      return json(await paymentDraft(order));
    }
    if (task === "usage") {
      const since = usageSince(request.nextUrl.searchParams.get("days") ?? "30");
      return json(await db.query(api.sonnely.usage, { ...auth, since }));
    }
    throw new SonnelyError("Unknown route.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const site = ensureSameOrigin(request);
    const { task } = await context.params;
    if (task === "quote" && !nearIntentsFundingEnabled()) throw new SonnelyError("Unknown route.", 404);
    const raw = await readBody(request);
    const { db, secret } = backend();

    if (task === "challenge" || task === "verify") {
      const client =
        process.env.VERCEL === "1"
          ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown"
          : "local";
      const bucket = createHmac("sha256", secret)
        .update("signin:" + client)
        .digest("hex");
      await db.mutation(api.launchGuard.throttleSignIn, { secret, bucket });
    }

    if (task === "challenge") {
      const { wallet } = z.object({ wallet: address }).parse(raw);
      const now = Date.now();
      const input = {
        address: wallet,
        domain: site.host,
        uri: site.origin,
        statement: "Sign in to Sonnely. This message does not move any funds.",
        version: "1",
        nonce: randomBytes(20).toString("hex"),
        issuedAt: new Date(now).toISOString(),
        expirationTime: new Date(now + duration).toISOString(),
      };
      const response = json({
        message: createSignInMessageText(input),
        input,
      });
      response.cookies.set("sonnely_challenge", seal(secret, JSON.stringify(input)), {
        ...cookie,
        maxAge: duration / 1000,
      });
      return response;
    }

    if (task === "verify") {
      const { wallet, signature, signedMessage, signedMessageFormat, invite } = z
        .object({
          wallet: address,
          signature: signatureBytes(64),
          signedMessage: z.array(z.int().min(0).max(255)).min(1).max(2048).optional(),
          signedMessageFormat: offchainSignInFormat.optional(),
          invite: inviteCode.optional(),
        })
        .parse(raw);
      const input = JSON.parse(unseal(secret, request.cookies.get("sonnely_challenge")?.value)) as SolanaSignInInput;
      const expires = Date.parse(input.expirationTime ?? "");
      if (
        !Number.isFinite(expires) ||
        expires < Date.now() ||
        wallet !== input.address ||
        input.uri !== site.origin ||
        input.domain !== site.host ||
        !input.nonce
      ) {
        throw new SonnelyError("Start a new sign-in challenge.", 401);
      }
      const verified = await verifyWalletSignIn(
        { ...input, address: wallet, domain: input.domain },
        Uint8Array.from(signature),
        signedMessage && Uint8Array.from(signedMessage),
        signedMessageFormat,
      );
      if (!verified) throw new SonnelyError("Wallet signature could not be verified.", 401);
      const token = randomBytes(32).toString("base64url");
      await db.mutation(api.sonnely.signIn, {
        secret,
        session: hash(token),
        wallet,
        nonce: input.nonce,
        expires,
        invite,
        referral: randomBytes(8).toString("hex"),
      });
      const response = json({ wallet });
      response.cookies.set("sonnely_session", token, { ...cookie, maxAge: 7 * 86400 });
      response.cookies.set("sonnely_challenge", "", { ...cookie, maxAge: 0 });
      return response;
    }

    const session = sessionHash(request);
    const auth = { secret, session };
    if (task === "logout") {
      await db.mutation(api.sonnely.signOut, auth);
      const response = json({ ok: true });
      response.cookies.set("sonnely_session", "", { ...cookie, maxAge: 0 });
      return response;
    }
    if (task === "accept-terms") {
      const { version, accepted } = z
        .object({ version: z.string().max(32), accepted: z.literal(true) })
        .parse(raw);
      await db.mutation(api.sonnely.acceptTerms, { ...auth, version });
      return json({ ok: accepted });
    }
    if (task === "chat") {
      const result = await infer(raw, { session }, false, (finished) => after(() => finished));
      return result instanceof Response ? result : json(result);
    }
    if (task === "finish-onboarding") {
      const { funding } = z.object({ funding: z.enum(["fund", "later"]) }).parse(raw);
      await db.mutation(api.sonnely.finishOnboarding, { ...auth, funding });
      return json({ ok: true });
    }
    if (task === "profile") {
      const profile = z
        .object({ name: z.string().trim().max(60), username: z.string().trim().max(24).optional() })
        .parse(raw);
      await db.mutation(api.sonnely.rename, { ...auth, ...profile });
      return json({ ok: true });
    }
    if (task === "keys") {
      const fields = z
        .object({
          name: field(60),
          cap: priceCap,
          dailyCap: priceCap,
          expires: z.number().int().gt(Date.now()).nullable(),
        })
        .parse(raw);
      const key = "sonnely_live_" + randomBytes(32).toString("base64url");
      await db.mutation(api.sonnely.createKey, {
        ...auth,
        ...fields,
        hash: hash(key),
        prefix: key.slice(0, 20),
        cap: fields.cap === null ? null : Math.round(fields.cap * 1_000_000),
        dailyCap: fields.dailyCap === null ? null : Math.round(fields.dailyCap * 1_000_000),
      });
      return json({ key }, 201);
    }
    if (task === "revoke") {
      const { id } = z.object({ id: field(64) }).parse(raw);
      await db.mutation(api.sonnely.revokeKey, { ...auth, id: id as Id<"keys"> });
      return json({ ok: true });
    }
    if (task === "update-key") {
      const fields = z
        .object({
          id: field(64),
          name: field(60),
          cap: priceCap,
          dailyCap: priceCap,
          expires: z.number().int().gt(Date.now()).nullable(),
        })
        .parse(raw);
      await db.mutation(api.sonnely.updateKey, {
        ...auth,
        id: fields.id as Id<"keys">,
        name: fields.name,
        cap: fields.cap === null ? null : Math.round(fields.cap * 1_000_000),
        dailyCap: fields.dailyCap === null ? null : Math.round(fields.dailyCap * 1_000_000),
        expires: fields.expires,
      });
      return json({ ok: true });
    }
    if (task === "signout-others") {
      return json({ removed: await db.mutation(api.sonnely.signOutOthers, auth) });
    }
    if (task === "cancel-deposit") {
      const { reference } = z.object({ reference: address }).parse(raw);
      await db.mutation(api.sonnely.cancelDeposit, { ...auth, reference });
      return json({ ok: true });
    }
    if (task === "contact") {
      const fields = z
        .object({ email: z.email().max(254), topic: field(60), message: field(3000) })
        .parse(raw);
      return json({ ticket: await db.mutation(api.sonnely.ticket, { ...auth, ...fields }) }, 201);
    }
    const profile = await db.query(api.sonnely.profile, auth);
    if (!profile) throw new SonnelyError("Sign in with a Solana wallet.", 401);
    if (task === "support-open") {
      const fields = z
        .object({ email: z.email().max(254), topic: field(60), message: field(3000) })
        .parse(raw);
      return json({ ticket: await db.mutation(api.support.openTicket, { ...auth, ...fields }) }, 201);
    }
    if (task === "support-reply") {
      const { id, body } = z.object({ id: field(64), body: field(4000) }).parse(raw);
      await db.mutation(api.support.customerReply, { ...auth, id: id as Id<"tickets">, body });
      return json({ ok: true }, 201);
    }
    if (task.startsWith("admin-")) {
      const delegated =
        (profile.role === "support" &&
          (task === "admin-ticket" ||
            task === "admin-ticket-bulk" ||
            task === "admin-reply" ||
            task.startsWith("admin-task-"))) ||
        (profile.role === "finance" && (task === "admin-invoice-preview" || task === "admin-invoice-record"));
      if (profile.role !== "admin" && !delegated)
        throw new SonnelyError("Administrator access required.", 403);
      if (task === "admin-privacy-rings") {
        const { prepareTreasuryPrivacyRingsRegistration } = await import("@/lib/privacy-rings");
        return json(await prepareTreasuryPrivacyRingsRegistration(raw));
      }
      return await adminAction(task, raw, auth, db);
    }
    if (task === "quote") {
      const input = z
        .union([
          z.object({
            asset: z.enum(
              Object.keys(intentFunds) as [keyof typeof intentFunds, ...(keyof typeof intentFunds)[]],
            ),
            amount: z.string().max(37),
            refundTo: z.string().max(42).optional(),
            prepare: z.boolean().optional(),
          }),
          z.object({ sol: z.number().min(0.01).max(1000) }).transform(({ sol }) => ({
            asset: "sol" as const,
            amount: String(sol),
            prepare: false,
          })),
        ])
        .parse(raw);
      if (input.prepare && !billing().billingEnabled) throw new SonnelyError("Checkout is unavailable.", 503);
      if (input.prepare && publicInference() && profile.acceptedTerms !== termsVersion)
        throw new SonnelyError("Accept the current Sonnely terms in the console.", 403);
      await db.mutation(api.sonnely.throttleQuote, auth);
      return json(await quote(profile.wallet, input));
    }
    if (task === "deposit" || task === "confirm" || task === "payment-transaction") {
      const { billingEnabled, paymentVerificationEnabled, cluster, mint, recipient, rpc } = billing();
      if (task !== "confirm" && publicInference() && profile.acceptedTerms !== termsVersion)
        throw new SonnelyError("Accept the current Sonnely terms in the console.", 403);
      if (task === "deposit") {
        if (!billingEnabled || !recipient || !rpc) throw new SonnelyError("Checkout is unavailable.", 503);
        const { dollars, asset } = z
          .object({
            dollars: z.union([z.string().max(32), z.number()]),
            asset: z.enum(["usdc", "sol"]).default("usdc"),
          })
          .parse(raw);
        if (asset === "sol" && (!solFundingEnabled() || cluster !== "mainnet"))
          throw new SonnelyError("SOL checkout is unavailable.", 503);
        const amount = parseCreditAmount(dollars);
        if (amount === null)
          throw new SonnelyError("Enter a positive dollar amount with up to six decimal places.");
        if (!Number.isSafeInteger(profile.balance + amount))
          throw new SonnelyError("This payment would exceed the credit balance limit.");
        if (recipient === profile.wallet)
          throw new SonnelyError("Use a wallet other than the treasury wallet.");
        await verifyCluster(rpc, cluster);
        const reference = bs58.encode(randomBytes(32));
        const sol = asset === "sol" ? await quoteSolPayment(amount) : undefined;
        const order = { reference, recipient, mint, cluster, amount, ...(sol ? { sol } : {}) };
        const draft = await paymentDraft(order);
        await db.mutation(api.sonnely.createDeposit, { ...auth, ...order });
        return json(draft, 201);
      }
      const { reference, signature, version } = z
        .object({
          reference: address,
          version: paymentTransactionVersion.optional(),
          signature: z
            .string()
            .min(64)
            .max(88)
            .refine((value) => {
              try {
                return bs58.decode(value).length === 64;
              } catch {
                return false;
              }
            })
            .optional(),
        })
        .parse(raw);
      const order = await db.query(api.sonnely.depositDetails, { ...auth, reference });
      if (order.signature && task === "confirm" && (!signature || order.signature === signature))
        return json({ ok: true, cluster: order.cluster });
      if (!paymentVerificationEnabled || !rpc)
        throw new SonnelyError("Payment verification is unavailable. Retry with the same signature.", 503);
      if (
        order.signature ||
        order.cluster !== cluster ||
        order.recipient !== recipient ||
        order.mint !== mint
      )
        throw new SonnelyError("This payment cannot be matched with the configured treasury.");
      await verifyCluster(rpc, cluster);
      if (task === "payment-transaction") {
        if (!billingEnabled) throw new SonnelyError("Checkout is unavailable.", 503);
        if (order.archivedAt !== undefined) throw new SonnelyError("This payment request is archived.", 409);
        if (version === undefined) throw new SonnelyError("Choose a supported wallet transaction version.");
        if (order.sol && order.sol.expiresAt <= Date.now())
          throw new SonnelyError("This SOL quote expired. Start a new payment.", 409);
        const [height, submitted] = await Promise.all([
          finalizedBlockHeight(rpc),
          findMatchingPayment(rpc, profile.wallet, order, "confirmed"),
        ]);
        if (submitted)
          throw new SonnelyError("This payment is on chain. Wait for finality before trying again.", 409);
        const active = order.checkoutTransaction;
        if (active && active.lastValidBlockHeight >= height)
          return json(paymentEnvelopeResponse(active.transaction, version));
        const draft = await preparePaymentEnvelope(rpc, profile.wallet, order, version);
        const transaction = await db.mutation(api.sonnely.saveDepositTransaction, {
          ...auth,
          reference,
          ...draft,
          observedHeight: height,
        });
        return json(paymentEnvelopeResponse(transaction, version));
      }
      if (signature) await verifyPayment(rpc, signature, profile.wallet, order, "finalized", false);
      const finalized = signature ?? (await findMatchingPayment(rpc, profile.wallet, order, "finalized"));
      if (!finalized) return json({ ok: false, cluster: order.cluster });
      await db.mutation(api.sonnely.confirmDeposit, { ...auth, reference, signature: finalized });
      return json({ ok: true, cluster: order.cluster });
    }
    throw new SonnelyError("Unknown route.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
