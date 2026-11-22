import { createHash } from "node:crypto";
import { z } from "zod";
import { SonnelyError } from "./server";

const uuid = z.uuid();
const dns = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");

export function providerRequestId(header: string | null, completion: string) {
  if (uuid.safeParse(header).success) return header!;
  const bytes = createHash("sha1").update(dns).update(completion).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export async function getProviderCosts(requestIds: string[]) {
  // Existing billable requests still reconcile when new inference is paused.
  const key = process.env.NEAR_AI_API_KEY?.trim();
  if (!key) throw new SonnelyError("Provider billing is unavailable.", 503);
  const response = await fetch("https://cloud-api.near.ai/v1/billing/costs", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ requestIds }),
  }).catch(() => null);
  const report = z
    .object({
      requests: z.array(z.object({ requestId: uuid, costNanoUsd: z.number().int().nonnegative() })),
    })
    .safeParse(response?.ok ? await response.json().catch(() => null) : null);
  if (!report.success) throw new SonnelyError("NEAR billing did not return a usable cost report.", 502);
  const requested = new Set(requestIds);
  // NEAR reports zero for unresolved request IDs. Leave them pending for a later reconciliation.
  const costs = new Map<string, number>();
  for (const row of report.data.requests) {
    if (!requested.has(row.requestId) || row.costNanoUsd === 0) continue;
    const previous = costs.get(row.requestId);
    if (previous !== undefined && previous !== row.costNanoUsd) {
      throw new SonnelyError("NEAR billing returned conflicting costs.", 502);
    }
    costs.set(row.requestId, row.costNanoUsd);
  }
  return [...costs].map(([requestId, costNanoUsd]) => ({ requestId, costNanoUsd }));
}
