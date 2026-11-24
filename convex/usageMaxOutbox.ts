import { v } from "convex/values";
import {
  deliverGatewayReceipts,
  gatewayBatchSize,
  gatewayEndpoint,
  gatewaySlug,
  gatewayToken,
} from "../lib/usagemax-gateway";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, query, type MutationCtx } from "./_generated/server";
import { auth, requireAdmin } from "./access";
import { traceFromSettlement } from "./usageMaxTrace";
import { gatewayReceipt } from "./usageMaxOutboxValidators";

const maxAttempts = 10;
const leaseMs = 60_000;
const retentionMs = 30 * 86_400_000;
const retryBaseMs = 60_000;
const retryMaxMs = 60 * 60_000;

function ingestToken() {
  return gatewayToken(process.env.USAGEMAX_GATEWAY_INGEST_TOKEN);
}

export async function gatewayRequestId(id: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("sonnely:usage:v1:" + id));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeCount(value: number | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

type Receipt = typeof gatewayReceipt.type;
type Job = { id: Id<"usageMaxOutbox">; receipt: Receipt; attempt: number };
type Settlement = Pick<
  Doc<"usage">,
  | "status"
  | "cost"
  | "settledAt"
  | "providerReportedCostNano"
  | "usageMaxDetails"
  | "outcome"
  | "providerStatus"
>;

export function settlementReceipt(
  row: Pick<Doc<"usage">, "_creationTime" | "model" | "provider" | "providerRejections">,
  settlement: Settlement,
  requestId: string,
  previous?: Receipt,
): Receipt | null {
  if (!settlement.settledAt || settlement.status === "pending") return null;
  const traceId = requestId.slice(0, 32);
  const timing = settlement.usageMaxDetails?.timing;
  const prior = previous?.trace;
  const attemptModel = gatewaySlug.safeParse(settlement.usageMaxDetails?.attemptModel);
  const trace = prior
    ? {
        billingStatus: "final" as const,
        spans: [
          { ...prior.spans[0], endedAt: settlement.settledAt },
          ...prior.spans.slice(1),
          {
            spanId: traceId.slice(0, 14) + "06",
            parentSpanId: prior.spans[0].spanId,
            kind: "recovery" as const,
            status: "ok" as const,
            startedAt: settlement.settledAt,
            endedAt: settlement.settledAt,
          },
        ],
      }
    : timing &&
      traceFromSettlement(
        traceId,
        timing,
        settlement.settledAt,
        settlement.status,
        row.provider ?? "near-ai",
        attemptModel.success ? attemptModel.data : row.model,
        settlement.outcome,
        settlement.providerStatus,
        row.providerRejections,
      );
  if (settlement.status === "unreported" && !trace) return null;
  const historyAt = previous?.settledAt ?? settlement.settledAt;
  const model = gatewaySlug.safeParse(row.model);
  if (!model.success) return null;
  const startedAt = trace?.spans[0].startedAt ?? Math.min(Math.floor(row._creationTime), historyAt);
  const firstTokenAt = safeCount(settlement.usageMaxDetails?.firstTokenAt);
  const hasFirstToken =
    settlement.usageMaxDetails?.stream === true &&
    firstTokenAt !== undefined &&
    firstTokenAt >= startedAt &&
    firstTokenAt <= historyAt;
  const reportedCost = safeCount(settlement.providerReportedCostNano);
  const rawUsage = settlement.usageMaxDetails?.usage;
  const resolvedModel = gatewaySlug.safeParse(settlement.usageMaxDetails?.resolvedModel);
  const usage = {
    inputTokens: safeCount(rawUsage?.inputTokens),
    outputTokens: safeCount(rawUsage?.outputTokens),
    cacheReadTokens: safeCount(rawUsage?.cacheReadTokens),
    cacheWriteTokens: safeCount(rawUsage?.cacheWriteTokens),
    reasoningTokens: safeCount(rawUsage?.reasoningTokens),
    reportedTotalTokens: safeCount(rawUsage?.reportedTotalTokens),
    unclassifiedTokens: safeCount(rawUsage?.unclassifiedTokens),
  };
  return {
    schemaVersion: 1,
    requestId,
    traceId,
    ...(trace ? { trace } : {}),
    revision: (previous?.revision ?? 0) + 1,
    model: model.data,
    provider: row.provider ?? "near-ai",
    status: settlement.status === "complete" ? "ok" : "error",
    settledAt: historyAt,
    startedAt,
    ...(hasFirstToken ? { firstTokenAt } : {}),
    ...(settlement.usageMaxDetails?.stream === undefined
      ? {}
      : { stream: settlement.usageMaxDetails.stream }),
    ...(resolvedModel.success ? { resolvedModel: resolvedModel.data } : {}),
    currency: "USD",
    customerChargeNanos:
      settlement.status === "unreported" ? null : (safeCount(settlement.cost * 1_000) ?? null),
    providerCostNanos: reportedCost ?? null,
    providerCostBasis: reportedCost === undefined ? "unknown" : "provider_reported",
    usage,
  };
}

async function queued(ctx: MutationCtx, requestId: string) {
  return ctx.db
    .query("usageMaxOutbox")
    .withIndex("by_request", (q) => q.eq("receipt.requestId", requestId))
    .unique();
}

export async function enqueueGatewaySettlement(ctx: MutationCtx, row: Doc<"usage">, settlement: Settlement) {
  if (!ingestToken()) return;
  const requestId = await gatewayRequestId(row._id);
  const existing = await queued(ctx, requestId);
  if (existing && (existing.receipt.trace?.billingStatus !== "pending" || existing.purgeAt <= Date.now()))
    return;
  const receipt = settlementReceipt(row, settlement, requestId, existing?.receipt);
  if (!receipt) return;
  if (existing) {
    await ctx.db.patch(existing._id, {
      receipt,
      state: "queued",
      nextAt: Date.now(),
      queuedAt: Date.now(),
      attempts: 0,
    });
    return;
  }
  await ctx.db.insert("usageMaxOutbox", {
    receipt,
    state: "queued",
    nextAt: Date.now(),
    queuedAt: Date.now(),
    attempts: 0,
    purgeAt: Date.now() + retentionMs,
  });
}

export async function amendGatewayCost(
  ctx: MutationCtx,
  id: Id<"usage">,
  providerCostNanos: number,
  basis: "provider_reported" | "invoice_confirmed" = "provider_reported",
) {
  const row = await queued(ctx, await gatewayRequestId(id));
  if (!row || row.purgeAt <= Date.now() || row.receipt.trace?.billingStatus === "pending") return false;
  if (row.receipt.providerCostBasis === "invoice_confirmed") {
    return row.receipt.providerCostNanos === providerCostNanos && basis === "invoice_confirmed";
  }
  if (row.receipt.providerCostNanos === providerCostNanos && row.receipt.providerCostBasis === basis)
    return true;
  await ctx.db.patch(row._id, {
    receipt: {
      ...row.receipt,
      revision: row.receipt.revision + 1,
      providerCostNanos,
      providerCostBasis: basis,
    },
    state: "queued",
    nextAt: Date.now(),
    queuedAt: Date.now(),
    attempts: 0,
  });
  return true;
}

const job = v.object({ id: v.id("usageMaxOutbox"), receipt: gatewayReceipt, attempt: v.number() });

export const claim = internalMutation({
  args: {},
  returns: v.array(job),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("usageMaxOutbox")
      .withIndex("by_state_next", (q) => q.eq("state", "queued").lte("nextAt", now))
      .take(gatewayBatchSize);
    const jobs: Job[] = [];
    for (const row of rows) {
      if (row.purgeAt <= now) {
        await ctx.db.delete(row._id);
      } else if (row.attempts >= maxAttempts) {
        await ctx.db.patch(row._id, { state: "failed", nextAt: undefined });
      } else {
        const attempt = row.attempts + 1;
        await ctx.db.patch(row._id, { nextAt: now + leaseMs, attempts: attempt });
        jobs.push({ id: row._id, receipt: row.receipt, attempt });
      }
    }
    return jobs;
  },
});

export const finish = internalMutation({
  args: {
    outcomes: v.array(
      v.object({
        id: v.id("usageMaxOutbox"),
        revision: v.number(),
        attempt: v.number(),
        state: v.union(v.literal("delivered"), v.literal("failed"), v.literal("retry")),
      }),
    ),
    retryDelay: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { outcomes, retryDelay }) => {
    const now = Date.now();
    for (const item of outcomes.slice(0, gatewayBatchSize)) {
      const row = await ctx.db.get(item.id);
      if (row?.state !== "queued" || row.receipt.revision !== item.revision || row.attempts !== item.attempt)
        continue;
      if (item.state === "retry" && item.attempt < maxAttempts) {
        const backoff = Math.min(retryMaxMs, retryBaseMs * 2 ** (item.attempt - 1));
        await ctx.db.patch(row._id, { nextAt: now + Math.max(backoff, retryDelay) });
      } else {
        await ctx.db.patch(row._id, {
          state: item.state === "retry" ? "failed" : item.state,
          nextAt: undefined,
        });
      }
    }
    return null;
  },
});

export const purge = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("usageMaxOutbox")
      .withIndex("by_purge", (q) => q.lte("purgeAt", Date.now()))
      .take(150);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 150) await ctx.scheduler.runAfter(1_000, internal.usageMaxOutbox.purge, {});
    return null;
  },
});

export const dispatch = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const token = ingestToken();
    const endpoint = gatewayEndpoint(process.env.CONVEX_CLOUD_URL, process.env.USAGEMAX_GATEWAY_LOCAL_PORT);
    if (!token || !endpoint) return null;
    const jobs: Job[] = await ctx.runMutation(internal.usageMaxOutbox.claim, {});
    if (!jobs.length) return null;
    const batches: Job[][] = [];
    let bytes = 15;
    const encode = new TextEncoder();
    for (const job of jobs) {
      const size = encode.encode(JSON.stringify(job.receipt)).byteLength + 1;
      if (!batches.length || bytes + size > 64 * 1024) {
        batches.push([]);
        bytes = 15;
      }
      batches.at(-1)!.push(job);
      bytes += size;
    }
    for (const batch of batches) {
      const delivery = await deliverGatewayReceipts(
        batch.map(({ receipt }) => receipt),
        token,
        fetch,
        endpoint,
      );
      await ctx.runMutation(internal.usageMaxOutbox.finish, {
        outcomes: batch.map(({ id, receipt, attempt }) => {
          const result = delivery.results?.get(receipt.requestId + ":" + receipt.revision);
          const state: "failed" | "delivered" | "retry" =
            delivery.rejected || result?.status === "conflict" ? "failed" : result ? "delivered" : "retry";
          return { id, revision: receipt.revision, attempt, state };
        }),
        retryDelay: delivery.retryDelay ?? 0,
      });
    }
    return null;
  },
});

export const adminHealth = query({
  args: auth,
  returns: v.object({
    queued: v.number(),
    failed: v.number(),
    oldestQueuedAt: v.union(v.null(), v.number()),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const [queued, failed, oldest] = await Promise.all([
      ctx.db
        .query("usageMaxOutbox")
        .withIndex("by_state_next", (q) => q.eq("state", "queued"))
        .take(501),
      ctx.db
        .query("usageMaxOutbox")
        .withIndex("by_state_next", (q) => q.eq("state", "failed"))
        .take(501),
      ctx.db
        .query("usageMaxOutbox")
        .withIndex("by_state_and_queuedAt", (q) => q.eq("state", "queued").gte("queuedAt", 0))
        .first(),
    ]);
    return {
      queued: Math.min(500, queued.length),
      failed: Math.min(500, failed.length),
      oldestQueuedAt: queued.length
        ? queued
            .slice(0, 500)
            .reduce(
              (minimum, row) => Math.min(minimum, row.queuedAt ?? row.purgeAt - retentionMs),
              oldest?.queuedAt ?? Number.MAX_SAFE_INTEGER,
            )
        : null,
      truncated: queued.length > 500 || failed.length > 500,
    };
  },
});
