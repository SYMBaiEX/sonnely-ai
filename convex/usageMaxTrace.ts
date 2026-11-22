import { v } from "convex/values";

export const gatewaySpan = v.object({
  spanId: v.string(),
  parentSpanId: v.optional(v.string()),
  kind: v.union(
    v.literal("request"),
    v.literal("reservation"),
    v.literal("provider"),
    v.literal("verification"),
    v.literal("settlement"),
    v.literal("recovery"),
  ),
  startedAt: v.number(),
  endedAt: v.number(),
  status: v.union(v.literal("ok"), v.literal("error")),
  httpStatus: v.optional(v.number()),
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  outcome: v.optional(
    v.union(
      v.literal("success"),
      v.literal("http_error"),
      v.literal("transport_error"),
      v.literal("invalid_response"),
      v.literal("verification_failed"),
      v.literal("incomplete_stream"),
    ),
  ),
});

export const gatewayTrace = v.object({
  billingStatus: v.union(v.literal("final"), v.literal("pending")),
  spans: v.array(gatewaySpan),
});

export type GatewayTrace = typeof gatewayTrace.type;

export const traceTiming = v.object({
  requestAt: v.number(),
  reservationAt: v.number(),
  providerAt: v.number(),
  providerDoneAt: v.number(),
  verificationAt: v.optional(v.number()),
  settlementAt: v.number(),
});

type Timing = typeof traceTiming.type;

function spanOutcome(outcome: string | undefined) {
  switch (outcome) {
    case "complete":
      return "success";
    case "upstream_http":
      return "http_error";
    case "upstream_transport":
      return "transport_error";
    case "stream_incomplete":
      return "incomplete_stream";
    default:
      return outcome?.startsWith("phala_") ? "verification_failed" : "invalid_response";
  }
}

export function traceFromSettlement(
  traceId: string,
  timing: Timing,
  recordedAt: number,
  status: string,
  provider: string,
  model: string,
  outcome?: string,
  httpStatus?: number,
): GatewayTrace | undefined {
  if (!Object.values(timing).every((stamp) => Number.isSafeInteger(stamp) && stamp >= 1_577_836_800_000))
    return;
  const startedAt = Math.min(timing.requestAt, recordedAt);
  const within = (stamp: number, minimum: number) => Math.min(recordedAt, Math.max(stamp, minimum));
  const reservationAt = within(timing.reservationAt, startedAt);
  const providerAt = within(timing.providerAt, reservationAt);
  const providerDoneAt = within(timing.providerDoneAt, providerAt);
  const settlementAt = within(timing.settlementAt, providerDoneAt);
  const success = status === "complete";
  const rootId = traceId.slice(0, 14) + "01";
  const span = (
    ordinal: string,
    kind: GatewayTrace["spans"][number]["kind"],
    from: number,
    through: number,
    ok = true,
  ): GatewayTrace["spans"][number] => ({
    spanId: traceId.slice(0, 14) + ordinal,
    ...(kind === "request" ? {} : { parentSpanId: rootId }),
    kind,
    startedAt: from,
    endedAt: through,
    status: ok ? "ok" : "error",
  });
  const providerOutcome = success ? "success" : spanOutcome(outcome);
  return {
    billingStatus: status === "unreported" ? "pending" : "final",
    spans: [
      span("01", "request", startedAt, recordedAt, success),
      span("02", "reservation", reservationAt, providerAt),
      {
        ...span(
          "03",
          "provider",
          providerAt,
          providerDoneAt,
          success || providerOutcome === "verification_failed",
        ),
        outcome: providerOutcome,
        provider,
        model,
        ...(httpStatus !== undefined && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599
          ? { httpStatus }
          : {}),
      },
      ...(timing.verificationAt === undefined
        ? []
        : [span("04", "verification", within(timing.verificationAt, providerDoneAt), settlementAt, success)]),
      span("05", "settlement", settlementAt, recordedAt, status !== "unreported"),
    ],
  };
}
