import { v } from "convex/values";

export const providerCheck = v.object({
  provider: v.union(v.literal("near-ai"), v.literal("phala"), v.literal("tinfoil")),
  state: v.union(v.literal("ok"), v.literal("unavailable"), v.literal("disabled")),
});
export const operationKind = v.union(
  v.literal("near_costs"),
  v.literal("gateway_alerts"),
  v.literal("provider_health"),
  v.literal("provider_invoices"),
);
export const operationState = v.object({
  kind: operationKind,
  checkedAt: v.number(),
  successAt: v.optional(v.number()),
  watermark: v.optional(v.number()),
  providers: v.optional(v.array(providerCheck)),
  status: v.union(v.literal("ok"), v.literal("unavailable"), v.literal("partial")),
  matched: v.number(),
  checked: v.number(),
});

export const alertDeliveryState = v.union(
  v.literal("queued"),
  v.literal("sending"),
  v.literal("delivered"),
  v.literal("accepted"),
  v.literal("failed"),
  v.literal("unconfirmed"),
);
export const alertDelivery = v.object({
  key: v.string(),
  subject: v.string(),
  text: v.string(),
  state: alertDeliveryState,
  nextAt: v.number(),
  purgeAt: v.number(),
  attempts: v.number(),
  providerId: v.optional(v.string()),
  errorCode: v.optional(v.string()),
});
export const gatewayIncident = v.object({
  rule: v.union(v.literal("provider_errors"), v.literal("slow_provider"), v.literal("billing_pending")),
  provider: v.string(),
  observed: v.number(),
  samples: v.number(),
  openedAt: v.number(),
  resolvedAt: v.optional(v.number()),
});
