import { z } from "zod";

export const phalaOrigin = "https://inference.phala.com";

const idPattern = /^[a-zA-Z0-9_-]{1,200}$/;
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const receiptEvent = z.object({
  type: z.string(),
  body_hash: digest.optional(),
  target_route_id: z.string().max(300).optional(),
  session_id: z.string().regex(idPattern).optional(),
  required: z.boolean().optional(),
  result: z.string().max(50).optional(),
  model_id: z.string().max(200).optional(),
});
const receiptSchema = z.object({
  api_version: z.literal("aci/1"),
  receipt_id: z.string().regex(idPattern),
  chat_id: z.string(),
  model: z.string(),
  workload_keyset_digest: digest,
  event_log: z.array(receiptEvent).max(30),
});

export function phalaReceiptId(headers: Headers) {
  const id = headers.get("x-receipt-id");
  return id && idPattern.test(id) ? id : undefined;
}

export async function phalaResponseEvidence(
  apiKey: string,
  receiptId: string | undefined,
  completionId: string,
  upstreamModel: string,
  requestHash: string,
  responseHash: string,
) {
  if (!receiptId) return { status: "unavailable" } as const;
  const receiptUrl = phalaOrigin + "/v1/aci/receipts/" + receiptId;
  const response = await fetch(receiptUrl, {
    headers: { Authorization: "Bearer " + apiKey },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(2_500),
  }).catch(() => null);
  if (!response?.ok) return { status: "unavailable" } as const;
  const parsed = receiptSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { status: "unavailable" } as const;
  const receipt = parsed.data;
  const find = (type: string) => receipt.event_log.find((event) => event.type === type);
  if (
    receipt.receipt_id !== receiptId ||
    receipt.chat_id !== completionId ||
    receipt.model !== upstreamModel ||
    find("request.received")?.body_hash !== "sha256:" + requestHash ||
    find("response.returned")?.body_hash !== "sha256:" + responseHash
  )
    return { status: "payload_mismatch" } as const;
  const selected = find("route.selected")?.target_route_id;
  const upstream = find("upstream.verified");
  if (
    !selected ||
    !/^phala-\d+:/.test(selected) ||
    !selected.endsWith(":" + upstreamModel) ||
    !upstream?.required ||
    upstream.result !== "verified" ||
    !upstream.session_id ||
    upstream.model_id !== upstreamModel
  )
    return { status: "route_mismatch" } as const;
  return {
    status: "aci_payload_matched",
    aci_receipt_id: receiptId,
    aci_keyset_digest: receipt.workload_keyset_digest,
    operator_route: selected,
    upstream_session_id: upstream.session_id,
  } as const;
}
