import { z } from "zod";
import { SHIELDED_POOL_PROGRAM_ID } from "@heliuslabs/spr/interface";
import { address } from "./payments";
import { SonnelyError } from "./sonnely-error";

const rpcMethods = new Set([
  "getAccountInfo",
  "getBalance",
  "getMultipleAccounts",
  "getLatestBlockhash",
  "getSlot",
  "getProgramAccounts",
]);
const indexerMethods = new Set([
  "getEncryptedUtxosByTags",
  "getShieldedTransactionsByTags",
  "getShieldedTransactionsByNullifiers",
  "getUserRecords",
]);
const proofPath =
  /^\/v1\/spr\/prove\/transfer_confidential_(?:1|2|3|4|5|6|8|12|16|24|32|40|48|49)_2\/(indexed|status)$/;
const policyPath = "/tee-policy/mainnet.json";
const maxResponse = 3 * 1024 * 1024;
const relayHeaders = z.strictObject({
  "content-type": z.enum(["application/json", "application/octet-stream"]).optional(),
  accept: z.enum(["application/json", "application/octet-stream"]).optional(),
  "x-sync": z
    .string()
    .regex(/^(?:true|1)$/)
    .optional(),
  "x-async": z
    .string()
    .regex(/^(?:true|1)$/)
    .optional(),
  "spr-tee": z.literal("v1").optional(),
  "spr-tee-enc": z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  "spr-tee-ciphertext": z
    .string()
    .regex(/^[0-9a-f]{32,4096}$/)
    .optional(),
});

export const confidentialRelayRequest = z.strictObject({
  reference: address,
  service: z.enum(["rpc", "indexer", "prover", "policy"]),
  method: z.enum(["POST", "GET"]),
  path: z.string().max(160),
  query: z.string().max(300),
  headers: relayHeaders,
  body: z
    .base64()
    .max(256 * 1024)
    .optional(),
});

function unsupported(): never {
  throw new SonnelyError("This request is unavailable in the Confidential USDC pilot.", 400);
}

function rpcRequest(body: Buffer | undefined) {
  if (!body) unsupported();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    unsupported();
  }
  return z
    .object({ jsonrpc: z.literal("2.0"), method: z.string(), params: z.unknown().optional() })
    .parse(parsed);
}

export function privacyRingsRpcUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    const key = url.searchParams.get("api-key");
    if (
      key &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.origin === "https://mainnet.helius-rpc.com" || url.origin === "https://rpc.helius.xyz")
    ) {
      const endpoint = new URL("https://mainnet.helius-rpc.com");
      endpoint.searchParams.set("api-key", key);
      return endpoint;
    }
  } catch {
    // The public Billing route can still operate with another Solana RPC.
  }
}

async function boundedBody(response: Response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return Buffer.concat(chunks, length);
    length += value.length;
    if (length > maxResponse) {
      void reader.cancel().catch(() => {});
      throw new SonnelyError("The Privacy Rings response was too large.", 502);
    }
    chunks.push(Buffer.from(value));
  }
}

export async function relayConfidentialPilot(
  provider: URL,
  { service, method, path, query, headers, body }: z.infer<typeof confidentialRelayRequest>,
) {
  const destination = new URL(provider);
  const bytes = body === undefined ? undefined : Buffer.from(body, "base64");
  if (service === "policy") {
    if (method !== "GET" || path !== policyPath || query || bytes) unsupported();
    destination.href = "https://d3gbdb0egjwcw9.cloudfront.net" + policyPath;
  } else if (service === "rpc" || service === "indexer") {
    if (method !== "POST" || query || headers["content-type"] !== "application/json") unsupported();
    const { method: rpc, params } = rpcRequest(bytes);
    if (
      service === "rpc"
        ? path !== "/" || !rpcMethods.has(rpc)
        : !indexerMethods.has(rpc) || path !== "/v1/spr/" + rpc
    )
      unsupported();
    if (service === "rpc" && params !== undefined && !Array.isArray(params)) unsupported();
    if (rpc === "getProgramAccounts" && (!Array.isArray(params) || params[0] !== SHIELDED_POOL_PROGRAM_ID))
      unsupported();
    destination.pathname = path;
  } else {
    const proof = proofPath.exec(path)?.[1];
    const encrypted = headers["spr-tee"] === "v1" && Boolean(headers["spr-tee-enc"]);
    if (path === "/v1/spr/attestation") {
      if (method !== "GET" || !/^\?nonce=[0-9a-f]{64}$/.test(query) || bytes) unsupported();
    } else if (proof === "indexed") {
      if (
        method !== "POST" ||
        query ||
        !encrypted ||
        headers["content-type"] !== "application/octet-stream" ||
        !bytes?.length
      )
        unsupported();
    } else if (proof === "status") {
      if (
        method !== "GET" ||
        !/^\?jobId=[A-Za-z0-9_-]{1,256}$/.test(query) ||
        bytes ||
        !encrypted ||
        !headers["spr-tee-ciphertext"]
      )
        unsupported();
    } else {
      unsupported();
    }
    destination.pathname = path;
    for (const [key, value] of new URLSearchParams(query)) destination.searchParams.set(key, value);
  }

  try {
    const upstream = await fetch(destination, {
      method,
      headers: Object.fromEntries(Object.entries(headers).filter((entry) => entry[1] !== undefined)),
      body: bytes,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const responseHeaders = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
    for (const name of ["content-type", "spr-tee", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(await boundedBody(upstream), { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof SonnelyError) throw error;
    throw new SonnelyError("The Privacy Rings service could not be reached.", 503);
  }
}
