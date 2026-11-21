import { createHash } from "node:crypto";
import { verifyMessage } from "ethers";
import { z } from "zod";

export const receiptHeader = "X-Sonnely-Receipt";
export const receiptVersion = "v1";

const nearSignature = z.object({
  signature_kind: z.enum(["provider_tee", "gateway"]),
  signing_algo: z.literal("ecdsa"),
  signing_address: z.string().regex(/^(0x)?[a-f0-9]{40}$/i),
  signature: z.string().regex(/^(0x)?[a-f0-9]{130}$/i),
  text: z.string().max(256),
});

export function sha256(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function nearResponseEvidence(
  apiKey: string,
  completionId: string,
  model: string,
  requestHash: string,
  responseHash: string,
) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(completionId)) return { status: "unavailable" } as const;

  const url = new URL("https://cloud-api.near.ai/v1/signature/" + completionId);
  url.searchParams.set("signing_algo", "ecdsa");

  let payload: unknown;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: "Bearer " + apiKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: "unavailable" } as const;
    }
    payload = await response.json();
  } catch {
    return { status: "unavailable" } as const;
  }
  const parsed = nearSignature.safeParse(payload);
  if (!parsed.success) return { status: "unavailable" } as const;

  const evidence = parsed.data;
  const hashes = requestHash + ":" + responseHash;
  const expected = evidence.signature_kind === "provider_tee" ? model + ":" + hashes : hashes;
  if (evidence.text !== expected) return { status: "payload_mismatch" } as const;

  try {
    const signature = "0x" + evidence.signature.replace(/^0x/i, "");
    const declaredSigner = evidence.signing_address.replace(/^0x/i, "").toLowerCase();
    const recovered = verifyMessage(evidence.text, signature).slice(2).toLowerCase();
    if (recovered === declaredSigner) return { status: "signature_matched", ...evidence } as const;
  } catch {
    // A payload can have the right hashes and still carry an invalid signature.
  }
  return { status: "invalid_signature" } as const;
}
