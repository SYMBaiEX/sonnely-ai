import { NextRequest } from "next/server";

export const maxDuration = 60;

const legacyOrigin = "https://app.sonnely.com";
const requestHeaders = [
  "accept",
  "authorization",
  "content-type",
  "origin",
  "access-control-request-method",
  "access-control-request-headers",
];
const responseHeaders = [
  "content-type",
  "retry-after",
  "www-authenticate",
  "x-request-id",
  "vary",
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-expose-headers",
  "access-control-max-age",
];

async function forward(request: NextRequest) {
  // The previous service owns /api/v1. Forward API credentials only, never browser cookies.
  const url = new URL(legacyOrigin);
  url.pathname = request.nextUrl.pathname;
  url.search = request.nextUrl.search;
  const headers = new Headers();
  for (const key of requestHeaders) {
    const value = request.headers.get(key);
    if (value !== null) headers.set(key, value);
  }
  try {
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
    };
    if (request.body) {
      init.body = request.body;
      init.duplex = "half";
    }
    const response = await fetch(url, init);
    if (response.status >= 300 && response.status < 400) throw new Error("Unexpected upstream redirect");
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const key of responseHeaders) {
      const value = response.headers.get(key);
      if (value !== null) outgoing.set(key, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json({ error: { message: "The original Sonnely API is unavailable." } }, { status: 502 });
  }
}

export { forward as GET, forward as HEAD, forward as POST, forward as OPTIONS };
