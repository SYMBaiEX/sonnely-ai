import { randomBytes } from "node:crypto";
import { createSignInMessageText, verifySignIn } from "@solana/wallet-standard-util";
import type { SolanaSignInInput } from "@solana/wallet-standard-features";
import bs58 from "bs58";
import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { address, billing, quote, verifyCluster, verifyPayment } from "@/lib/payments";
import { infer } from "@/lib/inference";
import {
  backend,
  cookie,
  ensureSameOrigin,
  errorResponse,
  hash,
  json,
  readBody,
  RelayError,
  seal,
  sessionHash,
  sessionToken,
  unseal,
} from "@/lib/server";

export const maxDuration = 60;
type Context = { params: Promise<{ task: string }> };
const duration = 300_000;
const field = (max: number) => z.string().trim().min(1).max(max);
const inviteCode = z.string().regex(/^[a-f0-9]{16}$/);
const signatureBytes = (length: number) => z.array(z.number().int().min(0).max(255)).length(length);
const priceCap = z.number().min(0.01).max(100_000).nullable();

export async function GET(request: NextRequest, context: Context) {
  try {
    const { task } = await context.params;
    if (task === "session") {
      const { billingEnabled, cluster } = billing();
      const enabled = Boolean(process.env.CONVEX_URL && process.env.RELAY_SERVICE_SECRET);
      const token = sessionToken(request);
      const connection = enabled && token ? backend() : null;
      const profile =
        connection && token
          ? await connection.db.query(api.relay.profile, { secret: connection.secret, session: hash(token) })
          : null;
      return json({
        profile,
        enabled,
        inferenceEnabled: enabled && Boolean(process.env.NEAR_AI_API_KEY),
        billingEnabled: enabled && billingEnabled,
        cluster,
      });
    }
    const session = sessionHash(request);
    const { db, secret } = backend();
    const auth = { secret, session };
    if (task === "keys") return json(await db.query(api.relay.listKeys, auth));
    if (task === "referrals") return json(await db.query(api.relay.referrals, auth));
    if (task === "history") return json(await db.query(api.relay.history, auth));
    if (task === "usage") {
      const days = z.coerce
        .number()
        .refine((value) => [7, 30, 90].includes(value))
        .parse(request.nextUrl.searchParams.get("days") ?? 30);
      const now = new Date();
      const since = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1);
      return json(await db.query(api.relay.usage, { ...auth, since }));
    }
    throw new RelayError("Unknown route.", 404);
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
        statement: "Sign in to Fathom Relay. This message does not move any funds.",
        version: "1",
        nonce: randomBytes(20).toString("hex"),
        issuedAt: new Date(now).toISOString(),
        expirationTime: new Date(now + duration).toISOString(),
      };
      const response = json({
        message: createSignInMessageText(input),
      });
      response.cookies.set("fathom_challenge", seal(secret, JSON.stringify(input)), {
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
        unseal(secret, request.cookies.get("fathom_challenge")?.value),
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
        throw new RelayError("Start a new sign-in challenge.", 401);
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
      if (!verified) throw new RelayError("Wallet signature could not be verified.", 401);
      const token = randomBytes(32).toString("base64url");
      await db.mutation(api.relay.signIn, {
        secret,
        session: hash(token),
        wallet,
        nonce: input.nonce,
        expires,
        invite,
        referral: randomBytes(8).toString("hex"),
      });
      const response = json({ wallet });
      response.cookies.set("fathom_session", token, { ...cookie, maxAge: 7 * 86400 });
      response.cookies.set("fathom_challenge", "", { ...cookie, maxAge: 0 });
      return response;
    }

    const session = sessionHash(request);
    const auth = { secret, session };
    if (task === "logout") {
      await db.mutation(api.relay.signOut, auth);
      const response = json({ ok: true });
      response.cookies.set("fathom_session", "", { ...cookie, maxAge: 0 });
      return response;
    }
    if (task === "chat") return json(await infer(raw, { session }));
    if (task === "profile") {
      const { name } = z.object({ name: z.string().trim().max(60) }).parse(raw);
      await db.mutation(api.relay.rename, { ...auth, name });
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
      const key = "fr_live_" + randomBytes(32).toString("base64url");
      await db.mutation(api.relay.createKey, {
        ...auth,
        ...fields,
        hash: hash(key),
        prefix: key.slice(0, 15),
        cap: fields.cap === null ? null : Math.round(fields.cap * 1_000_000),
        dailyCap: fields.dailyCap === null ? null : Math.round(fields.dailyCap * 1_000_000),
      });
      return json({ key }, 201);
    }
    if (task === "revoke") {
      const { id } = z.object({ id: field(64) }).parse(raw);
      await db.mutation(api.relay.revokeKey, { ...auth, id: id as Id<"keys"> });
      return json({ ok: true });
    }
    if (task === "contact") {
      const fields = z
        .object({ email: z.email().max(254), topic: field(60), message: field(3000) })
        .parse(raw);
      return json({ ticket: await db.mutation(api.relay.ticket, { ...auth, ...fields }) }, 201);
    }
    const profile = await db.query(api.relay.profile, auth);
    if (!profile) throw new RelayError("Sign in with a Solana wallet.", 401);
    if (task === "quote") {
      const { sol } = z.object({ sol: z.number().min(0.01).max(1000) }).parse(raw);
      await db.mutation(api.relay.throttleQuote, auth);
      return json(await quote(profile.wallet, sol));
    }
    if (task === "deposit" || task === "confirm") {
      const { billingEnabled, cluster, mint, recipient, rpc } = billing();
      if (!billingEnabled || !recipient || !rpc)
        throw new RelayError("USDC payments are awaiting treasury setup.", 503);
      if (task === "deposit") {
        const { dollars } = z.object({ dollars: z.number().int().min(5).max(1000) }).parse(raw);
        if (recipient === profile.wallet)
          throw new RelayError("Use a wallet other than the treasury wallet.");
        await verifyCluster(rpc, cluster);
        const reference = bs58.encode(randomBytes(32));
        const payment = new URLSearchParams({
          amount: String(dollars),
          "spl-token": mint,
          reference,
          label: "Fathom Relay",
          message: "Compute credit top-up",
        });
        const uri = "solana:" + recipient + "?" + payment.toString();
        await db.mutation(api.relay.createDeposit, {
          ...auth,
          reference,
          recipient,
          mint,
          cluster,
          amount: dollars * 1_000_000,
        });
        return json(
          { uri, reference, cluster, qr: await QRCode.toDataURL(uri, { margin: 2, width: 220 }) },
          201,
        );
      }
      const { reference, signature } = z
        .object({
          reference: address,
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
            }),
        })
        .parse(raw);
      const order = await db.query(api.relay.depositDetails, { ...auth, reference });
      if (order.signature === signature) return json({ ok: true, cluster: order.cluster });
      if (
        order.signature ||
        order.cluster !== cluster ||
        order.recipient !== recipient ||
        order.mint !== mint
      )
        throw new RelayError("This payment cannot be matched with the configured treasury.");
      await verifyPayment(rpc, signature, profile.wallet, order);
      await db.mutation(api.relay.confirmDeposit, { ...auth, reference, signature });
      return json({ ok: true, cluster: order.cluster });
    }
    throw new RelayError("Unknown route.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
