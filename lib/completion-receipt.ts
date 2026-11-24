import { z } from "zod";

export const receiptHeader = "X-Sonnely-Receipt";
export const receiptVersion = "v1";

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
      operator_route: z
        .string()
        .max(300)
        .regex(/^phala-\d+:[^\p{C}]+$/u),
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
