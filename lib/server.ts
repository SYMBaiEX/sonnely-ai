import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { limits } from "./api-contract";
import { SonnelyError } from "./sonnely-error";
export { SonnelyError } from "./sonnely-error";

export function serviceSecret() {
  return process.env.SONNELY_SERVICE_SECRET ?? process.env.RELAY_SERVICE_SECRET;
}

export function backendConfig() {
  const secret = serviceSecret();
  const url = process.env.CONVEX_URL;
  if (!url || !secret || secret.length < 32)
    throw new SonnelyError("The account service is unavailable.", 503);
  return { url, secret };
}

export function backend() {
  const { url, secret } = backendConfig();
  return { db: new ConvexHttpClient(url, { logger: false }), secret };
}

export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(error: unknown, openai = false) {
  let status = 500;
  let message = "The request could not be completed.";
  if (error instanceof SonnelyError) ({ message, status } = error);
  else if (error instanceof ZodError) {
    status = 400;
    message = "Check the fields and try again.";
  } else if (error instanceof ConvexError && typeof error.data === "string") {
    message = error.data;
    status = /Invalid|Sign in|Unauthorized/.test(message)
      ? 401
      : /Administrator access required|Only the treasury wallet|Accept the current Sonnely terms/.test(
            message,
          )
        ? 403
        : /limit|Wait a minute/.test(message)
          ? 429
          : /budget|credits/.test(message)
            ? 402
            : 400;
  }
  return json({ error: openai ? { message, type: "sonnely_error", code: status } : message }, status);
}

export async function readBody(request: NextRequest, limit: number = limits.bodyBytes): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new SonnelyError("Send JSON with Content-Type application/json.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new SonnelyError("Missing request body.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new SonnelyError("The request is too large.", 413);
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof SonnelyError) throw error;
    throw new SonnelyError("Invalid JSON.");
  }
}

export const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const sessionToken = (request: NextRequest) =>
  request.cookies.get("sonnely_session")?.value ?? request.cookies.get("fathom_session")?.value;
export function sessionHash(request: NextRequest) {
  const token = sessionToken(request);
  if (!token) throw new SonnelyError("Sign in with a Solana wallet.", 401);
  return hash(token);
}

export const cookie = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;
export function ensureSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const scheme = process.env.VERCEL ? "https:" : request.nextUrl.protocol;
  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host) || origin !== scheme + "//" + host) {
    throw new SonnelyError("Invalid request origin.", 403);
  }
  return new URL(origin);
}

export function seal(secret: string, value: string) {
  const encoded = Buffer.from(value).toString("base64url");
  return (
    encoded +
    "." +
    createHmac("sha256", secret)
      .update("wallet:" + encoded)
      .digest("base64url")
  );
}

export function unseal(secret: string, token: string | undefined) {
  if (!token || token.length > 2000) throw new SonnelyError("Start a new wallet sign-in.", 401);
  const [encoded] = token.split(".");
  const value = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = seal(secret, value);
  if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    throw new SonnelyError("Start a new wallet sign-in.", 401);
  }
  return value;
}
