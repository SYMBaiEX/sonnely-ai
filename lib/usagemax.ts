import { createHash } from "node:crypto";

type SettledUsage = {
  id: string;
  time: number;
  model: string;
  provider: string;
  input: number;
  output: number;
  cost: number;
};

export const usageMaxEndpoint = "https://usagemax.com/api/v1/telemetry/llm";
const digest = (input: string) => createHash("sha256").update(input).digest("hex");

export function usageMaxBatch(rows: SettledUsage[]) {
  return {
    events: rows.map((row) => ({
      eventKey: "sonnely:" + digest("inference:v1:" + row.id),
      occurredAt: row.time,
      model: row.model,
      provider: row.provider,
      source: "sonnely",
      inputTokens: row.input,
      outputTokens: row.output,
      totalTokens: row.input + row.output,
      costMicros: row.cost,
      costBasis: "reported",
      pricingSource: "sonnely_credit_ledger",
      currency: "USD",
      status: "ok",
      schemaVersion: 2,
    })),
  };
}

export async function sendToUsageMax(batch: ReturnType<typeof usageMaxBatch>, token: string, device: string) {
  const body = JSON.stringify(batch);
  return fetch(usageMaxEndpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "X-UsageMax-Device-ID": device,
      "Idempotency-Key": "sonnely:" + digest(body),
    },
    body,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
}
