import { adminAction, adminOverview } from "@/lib/admin-api";
import { randomBytes } from "node:crypto";
import { createSignInMessageText, verifySignIn } from "@solana/wallet-standard-util";
import type { SolanaSignInInput } from "@solana/wallet-standard-features";
import bs58 from "bs58";
import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { address, billing, findMatchingPayment, quote, verifyCluster, verifyPayment } from "@/lib/payments";
import { preparePayment } from "@/lib/payment-transaction";
import { creditDecimal, parseCreditAmount } from "@/lib/credit-amount";
import { usageSince } from "@/lib/usage";
import { allowedInPilot, managedProviderKey } from "@/lib/managed-access";
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
}) {
  const payment = new URLSearchParams({
    amount: creditDecimal(order.amount),
    "spl-token": order.mint,
    reference: order.reference,
    label: "Sonnely",
    message: "Compute credit top-up",
  });
  const uri = "solana:" + order.recipient + "?" + payment.toString();
  const qr = await QRCode.toDataURL(uri, { margin: 2, width: 220 });
  return { uri, reference: order.reference, cluster: order.cluster, amount: order.amount, qr };
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
      const eligible = allowedInPilot(profile?.wallet);
      return json({
        profile,
        enabled,
        inferenceEnabled: enabled && eligible && Boolean(managedProviderKey()),
        billingEnabled: enabled && eligible && billingEnabled,
        paymentVerificationEnabled: enabled && paymentVerificationEnabled,
        cluster,
      });
    }
    const session = sessionHash(request);
    const { db, secret } = backend();
    const auth = { secret, session };
    if (task === "keys") return json(await db.query(api.sonnely.listKeys, auth));
    if (task === "admin") return await adminOverview(auth, db, usageSince("30"));
    if (task === "referrals") return json(await db.query(api.sonnely.referrals, auth));
    if (task === "history") return json(await db.query(api.sonnely.history, auth));
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
    const raw = await readBody(request);
    const { db, secret } = backend();

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
      });
      response.cookies.set("sonnely_challenge", seal(secret, JSON.stringify(input)), {
        ...cookie,
        maxAge: duration / 1000,
      });
      return response;
    }

    if (task === "verify") {
      const { wallet, signature, invite } = z
        .object({ wallet: address, signature: signatureBytes(64), invite: inviteCode.optional() })
        .parse(raw);
      const input = JSON.parse(
        unseal(
          secret,
          request.cookies.get("sonnely_challenge")?.value ?? request.cookies.get("fathom_challenge")?.value,
        ),
      ) as SolanaSignInInput;
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
      const signedMessage = new TextEncoder().encode(
        createSignInMessageText({ ...input, address: wallet, domain: input.domain }),
      );
      const publicKey = bs58.decode(wallet);
      const verified = verifySignIn(input, {
        account: { address: wallet, publicKey, chains: [], features: [] },
        signedMessage,
        signature: Uint8Array.from(signature),
      });
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
      response.cookies.set("fathom_challenge", "", { ...cookie, maxAge: 0 });
      return response;
    }

    const session = sessionHash(request);
    const auth = { secret, session };
    if (task === "logout") {
      await db.mutation(api.sonnely.signOut, auth);
      const response = json({ ok: true });
      response.cookies.set("sonnely_session", "", { ...cookie, maxAge: 0 });
      response.cookies.set("fathom_session", "", { ...cookie, maxAge: 0 });
      return response;
    }
    if (task === "chat") return json(await infer(raw, { session }));
    if (task === "profile") {
      const { name } = z.object({ name: z.string().trim().max(60) }).parse(raw);
      await db.mutation(api.sonnely.rename, { ...auth, name });
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
    if (task === "contact") {
      const fields = z
        .object({ email: z.email().max(254), topic: field(60), message: field(3000) })
        .parse(raw);
      return json({ ticket: await db.mutation(api.sonnely.ticket, { ...auth, ...fields }) }, 201);
    }
    const profile = await db.query(api.sonnely.profile, auth);
    if (!profile) throw new SonnelyError("Sign in with a Solana wallet.", 401);
    if (task.startsWith("admin-")) {
      if (profile.role !== "admin") throw new SonnelyError("Administrator access required.", 403);
      return await adminAction(task, raw, auth, db);
    }
    if (task === "quote") {
      const { sol } = z.object({ sol: z.number().min(0.01).max(1000) }).parse(raw);
      await db.mutation(api.sonnely.throttleQuote, auth);
      return json(await quote(profile.wallet, sol));
    }
    if (task === "deposit" || task === "confirm" || task === "payment-transaction") {
      const { billingEnabled, paymentVerificationEnabled, cluster, mint, recipient, rpc } = billing();
      if (task === "deposit") {
        if (!allowedInPilot(profile.wallet)) throw new SonnelyError("USDC checkout is unavailable.", 503);
        if (!billingEnabled || !recipient || !rpc)
          throw new SonnelyError("USDC checkout is unavailable.", 503);
        const { dollars } = z.object({ dollars: z.union([z.string().max(32), z.number()]) }).parse(raw);
        const amount = parseCreditAmount(dollars);
        if (amount === null)
          throw new SonnelyError("Enter a positive USDC amount with up to six decimal places.");
        if (!Number.isSafeInteger(profile.balance + amount))
          throw new SonnelyError("This payment would exceed the credit balance limit.");
        if (recipient === profile.wallet)
          throw new SonnelyError("Use a wallet other than the treasury wallet.");
        await verifyCluster(rpc, cluster);
        const reference = bs58.encode(randomBytes(32));
        const order = { reference, recipient, mint, cluster, amount };
        const draft = await paymentDraft(order);
        await db.mutation(api.sonnely.createDeposit, { ...auth, ...order });
        return json(draft, 201);
      }
      const { reference, signature, version } = z
        .object({
          reference: address,
          version: z.union([z.literal("legacy"), z.literal(0)]).optional(),
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
        throw new SonnelyError(
          "USDC payment verification is unavailable. Retry with the same signature.",
          503,
        );
      if (
        order.signature ||
        order.cluster !== cluster ||
        order.recipient !== recipient ||
        order.mint !== mint
      )
        throw new SonnelyError("This payment cannot be matched with the configured treasury.");
      await verifyCluster(rpc, cluster);
      if (task === "payment-transaction") {
        if (!billingEnabled || !allowedInPilot(profile.wallet))
          throw new SonnelyError("USDC checkout is unavailable.", 503);
        if (version === undefined) throw new SonnelyError("Choose a supported wallet transaction version.");
        if (await findMatchingPayment(rpc, profile.wallet, order, "confirmed"))
          throw new SonnelyError("This payment is on chain. Wait for finality before trying again.", 409);
        return json({ transaction: await preparePayment(rpc, profile.wallet, order, version) });
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
