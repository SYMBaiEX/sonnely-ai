import { createHash } from "node:crypto";
import { nearSignature } from "./completion-receipt";
import { verifyNearSignature } from "./near-signature";

export { receiptHeader, receiptVersion } from "./completion-receipt";

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
  const status = verifyNearSignature(evidence, model, requestHash, responseHash);
  return status === "signature_matched" ? { status, ...evidence } : { status };
}
