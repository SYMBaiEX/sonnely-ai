// spec/app/site/index.md, "Story: Check the service status"
import { createParser } from "eventsource-parser";
import { verifyMessage } from "ethers";
import { z } from "zod";
import { catalog } from "../../../../gen/app__models.ts";

export const receiptHeader = "X-Sonnely-Receipt";
export const receiptVersion = "v1";
export const maxReceiptBytes = 4_000_000;
export const maxComparisonBytes = 8_000_000;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[^\p{C}]+$/u);
const requestReference = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);

export const nearSignature = z.object({
  signature_kind: z.enum(["provider_tee", "gateway"]),
  signing_algo: z.literal("ecdsa"),
  signing_address: z.string().regex(/^(0x)?[a-f0-9]{40}$/i),
  signature: z.string().regex(/^(0x)?[a-f0-9]{130}$/i),
  text: z.string().max(256),
});

const receipt = {
  version: z.literal(receiptVersion),
  requested_model: identifier,
  reported_model: identifier.optional(),
  provider_completion_id: identifier,
  billing_reference: identifier.optional(),
  charged_microusd: z.int().nonnegative(),
  cached_input_tokens: z.int().nonnegative(),
  upstream_request_sha256: sha256,
  upstream_response_sha256: sha256,
};

export const completionReceipt = z.discriminatedUnion("provider", [
  z.object({
    ...receipt,
    provider: z.literal("near-ai"),
    evidence: z.union([
      nearSignature.extend({ status: z.literal("signature_matched") }),
      z.object({ status: z.enum(["unavailable", "payload_mismatch", "invalid_signature"]) }),
    ]),
  }),
  z.object({
    ...receipt,
    provider: z.literal("phala"),
    evidence: z.object({
      status: z.literal("aci_payload_matched"),
      aci_receipt_id: requestReference,
      aci_keyset_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      operator_route: requestReference,
      upstream_session_id: requestReference,
    }),
  }),
  z.object({
    ...receipt,
    provider: z.literal("tinfoil"),
    evidence: z.object({
      status: z.literal("attested_router"),
      config_repo: z
        .string()
        .max(300)
        .regex(/^[\w.-]+\/[\w.-]+$/),
      release_digest: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/),
    }),
  }),
]);

export type CompletionReceipt = z.infer<typeof completionReceipt>;
export type ReceiptEnvelope = { receipt: CompletionReceipt; requestId?: string };

export function readReceiptEnvelope(input: unknown): ReceiptEnvelope | undefined {
  if (!input || typeof input !== "object") return;
  if (Object.hasOwn(input, "sonnely_receipt")) {
    const wrapped = input as { sonnely_receipt: unknown; sonnely_request_id?: unknown };
    const receipt = completionReceipt.safeParse(wrapped.sonnely_receipt);
    if (!receipt.success) return;
    const id = requestReference.safeParse(wrapped.sonnely_request_id);
    return { receipt: receipt.data, requestId: id.success ? id.data : undefined };
  }
  const receipt = completionReceipt.safeParse(input);
  if (receipt.success) return { receipt: receipt.data };
}

export function parseReceiptInput(source: string): ReceiptEnvelope {
  if (source.length > maxReceiptBytes || new TextEncoder().encode(source).byteLength > maxReceiptBytes)
    throw new Error("Choose a receipt or response smaller than 4 MB.");

  const input = source.trimStart();
  if (!input.trim()) throw new Error("Paste a receipt or choose a receipt file.");
  if (input.startsWith("{")) {
    try {
      const receipt = readReceiptEnvelope(JSON.parse(input));
      if (receipt) return receipt;
    } catch {
      throw new Error("The receipt file contains invalid JSON.");
    }
  } else {
    let receipt: ReceiptEnvelope | undefined;
    let count = 0;
    const parser = createParser({
      onEvent(event) {
        if (event.data === "[DONE]") return;
        try {
          const chunk: unknown = JSON.parse(event.data);
          const candidate = readReceiptEnvelope(chunk);
          if (candidate) {
            receipt = candidate;
            count++;
          }
        } catch {
          return;
        }
      },
    });
    parser.feed(input + "\n\n");
    if (count === 1 && receipt) return receipt;
    if (count > 1)
      throw new Error("This stream contains multiple receipts. Inspect one receipt at a time.");
  }
  throw new Error(
    "No supported Sonnely v1 receipt was found. Use a receipt, completion response, or stream receipt event.",
  );
}

function verifyNearSignature(
  evidence: z.infer<typeof nearSignature>,
  model: string,
  requestHash: string,
  responseHash: string,
) {
  const hashes = requestHash + ":" + responseHash;
  const expected = evidence.signature_kind === "provider_tee" ? model + ":" + hashes : hashes;
  if (evidence.text !== expected) return "payload_mismatch";
  try {
    const signature = "0x" + evidence.signature.replace(/^0x/i, "");
    const declaredSigner = evidence.signing_address.replace(/^0x/i, "").toLowerCase();
    const recovered = verifyMessage(evidence.text, signature).slice(2).toLowerCase();
    if (recovered === declaredSigner) return "signature_matched";
  } catch {
    return "invalid_signature";
  }
  return "invalid_signature";
}

export function verifyReceiptEvidence(receipt: CompletionReceipt) {
  if (receipt.provider !== "near-ai" || receipt.evidence.status !== "signature_matched")
    return Promise.resolve(receipt.evidence.status);
  const upstreamModel = catalog.find(
    (entry) =>
      entry.provider === "NearAI" &&
      entry.routes.some((route) => route.modelId === receipt.requested_model),
  )?.upstreamId;
  return Promise.resolve(
    verifyNearSignature(
      receipt.evidence,
      upstreamModel ?? receipt.requested_model,
      receipt.upstream_request_sha256,
      receipt.upstream_response_sha256,
    ),
  );
}

export async function compareReceiptBytes(file: Blob, expected: string) {
  if (file.size > maxComparisonBytes) throw new Error("Choose an upstream file smaller than 8 MB.");
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const actual = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return actual === expected;
}
