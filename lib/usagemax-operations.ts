import { z } from "zod";
import { SonnelyError } from "./sonnely-error";
import { gatewayEndpoint, gatewaySlug, gatewayToken, readGatewayJson, receipt } from "./usagemax-gateway";

const percentile = z
  .object({
    samples: z.int().nonnegative(),
    p50: z.int().nonnegative(),
    p95: z.int().nonnegative(),
    p99: z.int().nonnegative(),
  })
  .nullable();
const count = z.int().nonnegative();
const nanos = z.string().regex(/^-?\d{1,25}$/);
const metrics = z.object({
  key: z.string(),
  requests: count,
  errors: count,
  cancelled: count,
  pendingBilling: count,
  providerAttempts: count,
  providerErrors: count,
  traces: count,
  inputTokens: count,
  outputTokens: count,
  cachedTokens: count,
  reasoningTokens: count,
  customerChargeNanos: nanos,
  knownProviderCostNanos: nanos,
  coveredMarginNanos: nanos,
  costCovered: count,
  marginCovered: count,
  invoiceConfirmed: count,
  latency: percentile,
  firstToken: percentile,
  providerLatency: percentile,
});

export const reportDay = z.iso.date();
export const gatewayRequestKey = z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}$/);
const report = z.object({
  from: reportDay,
  through: reportDay,
  retainedFromAt: count,
  generatedAt: count,
  latestReceiptAt: count.nullable(),
  latestRequestId: gatewayRequestKey.nullable(),
  truncated: z.boolean(),
  groupsTruncated: z.boolean(),
  limit: count,
  overall: metrics,
  daily: z.array(metrics).max(31),
  providers: z.array(metrics).max(100),
  models: z.array(metrics).max(100),
  recent: z
    .array(
      z.object({
        requestId: gatewayRequestKey,
        provider: gatewaySlug,
        model: gatewaySlug,
        settledAt: count,
        status: z.enum(["ok", "error", "cancelled"]),
        hasTrace: z.boolean(),
      }),
    )
    .max(20),
  alerts: z.object({
    evaluatedAt: count.nullable(),
    truncated: z.boolean(),
    items: z
      .array(
        z.object({
          key: z.string(),
          provider: gatewaySlug,
          rule: z.enum(["provider_errors", "slow_provider", "billing_pending"]),
          samples: count,
          observed: count,
          openedAt: count,
          updatedAt: count,
          resolvedAt: count.optional(),
        }),
      )
      .max(50),
  }),
});
export type GatewayOperations = z.infer<typeof report>;
export type GatewayMetrics = z.infer<typeof metrics>;

async function queryUsageMax(path: string, params?: URLSearchParams) {
  const token = gatewayToken(process.env.USAGEMAX_GATEWAY_REPORT_TOKEN);
  const endpoint = gatewayEndpoint(process.env.CONVEX_URL, process.env.USAGEMAX_GATEWAY_LOCAL_PORT);
  if (!token || !endpoint) throw new SonnelyError("UsageMax reporting is not configured.", 503);
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/receipts$/, path);
  if (params) url.search = params.toString();
  try {
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
    });
    if (response.ok) return await readGatewayJson(response, 256 * 1024);
    await response.body?.cancel().catch(() => {});
    if (response.status === 404)
      throw new SonnelyError("The UsageMax report or trace could not be found.", 404);
  } catch (error) {
    if (error instanceof SonnelyError) throw error;
  }
  throw new SonnelyError("UsageMax reporting is temporarily unavailable.", 503);
}

export async function readGatewayOperations(from: string, through: string) {
  const parsed = report.safeParse(await queryUsageMax("/operations", new URLSearchParams({ from, through })));
  if (!parsed.success) throw new SonnelyError("UsageMax returned an invalid report.", 503);
  return parsed.data;
}

export async function readGatewayTrace(requestId: string) {
  const parsed = z
    .object({ receipt })
    .safeParse(await queryUsageMax("/receipts/" + encodeURIComponent(requestId)));
  if (!parsed.success) throw new SonnelyError("UsageMax returned an invalid trace.", 503);
  return parsed.data.receipt;
}
