import { verifyMessage } from "ethers";
import type { z } from "zod";
import type { nearSignature } from "./completion-receipt";

export function verifyNearSignature(
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
    // Correct signed text can still carry an invalid signature.
  }
  return "invalid_signature";
}
