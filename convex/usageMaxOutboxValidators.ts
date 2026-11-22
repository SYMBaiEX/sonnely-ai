import { v } from "convex/values";

export const gatewayUsage = v.object({
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  cacheReadTokens: v.optional(v.number()),
  cacheWriteTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  reportedTotalTokens: v.optional(v.number()),
  unclassifiedTokens: v.optional(v.number()),
});

export const gatewayDetails = v.object({
  stream: v.optional(v.boolean()),
  resolvedModel: v.optional(v.string()),
  usage: v.optional(gatewayUsage),
  firstTokenAt: v.optional(v.number()),
});

export const gatewayReceipt = v.object({
  schemaVersion: v.literal(1),
  requestId: v.string(),
  traceId: v.optional(v.string()),
  revision: v.number(),
  model: v.string(),
  provider: v.string(),
  status: v.union(v.literal("ok"), v.literal("error"), v.literal("cancelled")),
  settledAt: v.number(),
  startedAt: v.optional(v.number()),
  firstTokenAt: v.optional(v.number()),
  stream: v.optional(v.boolean()),
  resolvedModel: v.optional(v.string()),
  currency: v.literal("USD"),
  customerChargeNanos: v.union(v.number(), v.null()),
  providerCostNanos: v.union(v.number(), v.null()),
  providerCostBasis: v.union(
    v.literal("provider_reported"),
    v.literal("invoice_confirmed"),
    v.literal("estimated"),
    v.literal("unknown"),
  ),
  usage: gatewayUsage,
});
