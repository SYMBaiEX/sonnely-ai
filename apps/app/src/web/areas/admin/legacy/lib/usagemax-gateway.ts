// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { z } from "zod";

const receiptPath = "/api/v1/gateway/receipts";
export const gatewayReceiptsUrl = "https://usagemax.com" + receiptPath;

export function gatewayEndpoint(deploymentUrl: string | undefined, localPort: string | undefined) {
  if (!deploymentUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(deploymentUrl)) return gatewayReceiptsUrl;
  if (!localPort || !/^\d{1,5}$/.test(localPort) || Number(localPort) < 1 || Number(localPort) > 65_535)
    return null;
  return "http://127.0.0.1:" + localPort + receiptPath;
}
export const gatewayBatchSize = 50;
export const gatewayReportLimit = 100;

const integer = z.int().nonnegative();
export const gatewaySlug = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,119}$/);
const requestId = z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}$/);
const usage = z.strictObject({
  inputTokens: integer.optional(),
  outputTokens: integer.optional(),
  cacheReadTokens: integer.optional(),
  cacheWriteTokens: integer.optional(),
  reasoningTokens: integer.optional(),
  reportedTotalTokens: integer.optional(),
  unclassifiedTokens: integer.optional(),
});
const spanId = z.string().regex(/^[a-f0-9]{16}$/);
const span = z.object({
  spanId,
  parentSpanId: spanId.optional(),
  kind: z.enum(["request", "reservation", "provider", "verification", "settlement", "recovery"]),
  startedAt: integer,
  endedAt: integer,
  status: z.enum(["ok", "error"]),
  httpStatus: z.int().min(100).max(599).optional(),
  provider: gatewaySlug.optional(),
  model: gatewaySlug.optional(),
  outcome: z
    .enum([
      "success",
      "http_error",
      "transport_error",
      "invalid_response",
      "verification_failed",
      "incomplete_stream",
    ])
    .optional(),
});
export const receipt = z.strictObject({
  schemaVersion: z.literal(1),
  requestId,
  revision: z.int().positive(),
  model: gatewaySlug,
  provider: gatewaySlug,
  status: z.enum(["ok", "error", "cancelled"]),
  settledAt: integer,
  startedAt: integer.optional(),
  firstTokenAt: integer.optional(),
  stream: z.boolean().optional(),
  resolvedModel: gatewaySlug.optional(),
  traceId: requestId.optional(),
  trace: z.object({ billingStatus: z.enum(["final", "pending"]), spans: z.array(span).max(12) }).optional(),
  currency: z.literal("USD"),
  customerChargeNanos: integer.nullable(),
  providerCostNanos: integer.nullable(),
  providerCostBasis: z.enum(["provider_reported", "invoice_confirmed", "estimated", "unknown"]),
  usage,
});
export type GatewayReceipt = z.infer<typeof receipt>;

export function gatewayToken(value: string | undefined) {
  return value && /^umxg_[0-9a-f]{64}$/.test(value) ? value : undefined;
}

export async function readGatewayJson(response: Response, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(body + decoder.decode()) as unknown;
      bytes += chunk.value.byteLength;
      if (bytes > limit) return null;
      body += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

const deliveryResult = z.object({
  requestId,
  revision: z.int().positive(),
  status: z.enum(["accepted", "replay", "stale", "conflict"]),
});
type DeliveryResult = z.infer<typeof deliveryResult>;
const deliveryResponse = z.object({ results: z.array(deliveryResult).max(gatewayBatchSize) });

export async function deliverGatewayReceipts(
  receipts: GatewayReceipt[],
  token: string,
  send = fetch,
  endpoint = gatewayReceiptsUrl,
) {
  let response: Response;
  try {
    response = await send(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ receipts }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { retryDelay: 0 };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403) return { retryDelay: 15 * 60_000 };
    if ([400, 413, 422].includes(response.status)) return { rejected: true };
    if (response.status === 429) {
      const delay = Number(response.headers.get("retry-after"));
      return { retryDelay: Number.isFinite(delay) ? Math.min(60 * 60_000, Math.max(0, delay * 1000)) : 0 };
    }
    return { retryDelay: 0 };
  }
  const parsed = deliveryResponse.safeParse(await readGatewayJson(response, 16_384));
  if (!parsed.success) return { retryDelay: 0 };
  const results = new Map<string, DeliveryResult>();
  for (const item of parsed.data.results) {
    const key = item.requestId + ":" + item.revision;
    if (results.has(key)) return { retryDelay: 0 };
    results.set(key, item);
  }
  return { results };
}

const report = z.object({ receipts: z.array(receipt).max(gatewayReportLimit), truncated: z.boolean() });
type ReportDetails = {
  count: number;
  completed: number;
  errors: number;
  cancelled: number;
  latestSettledAt: number | null;
  latestReceiptUrl: string | null;
  from: string;
  through: string;
  fetchedAt: number;
  truncated: boolean;
};
export type GatewayReport =
  { state: "disabled" } | { state: "unavailable" } | ({ state: "available" } & ReportDetails);

export async function readGatewayReport(since: number, send = fetch): Promise<GatewayReport> {
  const token = gatewayToken(process.env.USAGEMAX_GATEWAY_REPORT_TOKEN);
  const endpoint = gatewayEndpoint(process.env.CONVEX_URL, process.env.USAGEMAX_GATEWAY_LOCAL_PORT);
  if (!token || !endpoint) return { state: "disabled" };
  const now = Date.now();
  const from = new Date(since).toISOString().slice(0, 10);
  const through = new Date(now).toISOString().slice(0, 10);
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ from, through, limit: String(gatewayReportLimit) }).toString();
  try {
    const response = await send(url, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    const raw = response.ok ? await readGatewayJson(response, 384_000) : null;
    if (!response.ok) await response.body?.cancel().catch(() => {});
    const parsed = report.safeParse(raw);
    if (!parsed.success) return { state: "unavailable" };
    const rows = parsed.data.receipts;
    const latest = rows.reduce<GatewayReceipt | null>(
      (current, item) => (!current || item.settledAt > current.settledAt ? item : current),
      null,
    );
    const projectId = process.env.USAGEMAX_GATEWAY_PROJECT_ID;
    const latestReceiptUrl =
      latest && projectId && /^[a-zA-Z0-9_-]{10,64}$/.test(projectId)
        ? "https://usagemax.com/workspace/gateway?" +
          new URLSearchParams({ projectId, requestId: latest.requestId })
        : null;
    return {
      state: "available",
      count: rows.length,
      completed: rows.filter((item) => item.status === "ok").length,
      errors: rows.filter((item) => item.status === "error").length,
      cancelled: rows.filter((item) => item.status === "cancelled").length,
      latestSettledAt: latest?.settledAt ?? null,
      latestReceiptUrl,
      from,
      through,
      fetchedAt: Date.now(),
      truncated: parsed.data.truncated,
    };
  } catch {
    return { state: "unavailable" };
  }
}
