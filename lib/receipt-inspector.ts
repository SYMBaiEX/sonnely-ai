import { createParser } from "eventsource-parser";
import { readReceiptEnvelope, type CompletionReceipt, type ReceiptEnvelope } from "./completion-receipt";

export const maxReceiptBytes = 4_000_000;
export const maxComparisonBytes = 8_000_000;

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
          // Only the receipt-bearing event is needed for this inspection.
        }
      },
    });
    parser.feed(input + "\n\n");
    if (count === 1 && receipt) return receipt;
    if (count > 1) throw new Error("This stream contains multiple receipts. Inspect one receipt at a time.");
  }
  throw new Error(
    "No supported Sonnely v1 receipt was found. Use a receipt, completion response, or stream receipt event.",
  );
}

export async function verifyReceiptEvidence(receipt: CompletionReceipt) {
  if (receipt.provider !== "near-ai" || receipt.evidence.status !== "signature_matched")
    return receipt.evidence.status;
  const [{ chatRoutes }, { verifyNearSignature }] = await Promise.all([
    import("./provider-models"),
    import("./near-signature"),
  ]);
  const upstreamModel = chatRoutes.find(
    ({ provider, id }) => provider === "near-ai" && id === receipt.requested_model,
  )?.upstreamModel;
  return verifyNearSignature(
    receipt.evidence,
    upstreamModel ?? receipt.requested_model,
    receipt.upstream_request_sha256,
    receipt.upstream_response_sha256,
  );
}

export async function compareReceiptBytes(file: Blob, expected: string) {
  if (file.size > maxComparisonBytes) throw new Error("Choose an upstream file smaller than 8 MB.");
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const actual = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return actual === expected;
}
