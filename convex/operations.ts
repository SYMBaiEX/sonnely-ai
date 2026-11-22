import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { alertFallbackConfigured, sendAlertFallback } from "./alertFallback";
import { auth, requireAdmin, secret, service } from "./access";
import { applyNearCosts, providerCost } from "./finance";
import { alertDeliveryState, gatewayIncident, operationState, providerCheck } from "./operationsContract";
import { z } from "zod";
import { providerDailyLimit } from "./launchGuard";
import { loadStatements } from "./statementFeed";

const minute = 60_000;
const retention = 30 * 24 * 60 * minute;
const bridgeUrl = "https://sonnely.com/api/internal/operations";
const adminUrl = "https://sonnely.com/console/admin";
const replyHealth = z
  .array(
    z.strictObject({
      provider: z.enum(["near-ai", "phala", "tinfoil"]),
      state: z.enum(["ok", "unavailable", "disabled"]),
    }),
  )
  .length(3);
const replyCosts = z.array(z.object({ requestId: z.uuid(), costNanoUsd: z.int().positive() })).max(100);
const replyAlerts = z.object({
  evaluatedAt: z.int().nonnegative().nullable(),
  truncated: z.boolean(),
  items: z
    .array(
      z.object({
        rule: z.enum(["provider_errors", "slow_provider", "billing_pending"]),
        provider: z.enum(["near-ai", "phala", "tinfoil"]),
        observed: z.int().nonnegative(),
        samples: z.int().nonnegative(),
        openedAt: z.int().nonnegative(),
        resolvedAt: z.int().nonnegative().optional(),
      }),
    )
    .max(50),
});
const emailReply = z.object({
  state: z.enum(["delivered", "accepted", "failed", "retry", "unconfirmed"]),
  messageId: z.string().min(1).max(160).optional(),
  code: z
    .string()
    .regex(/^E_[A-Z0-9_]{1,60}$/)
    .optional(),
});

async function bridge(payload: object) {
  const token = process.env.SONNELY_OPERATIONS_TOKEN;
  if (!token) throw new Error("Operations bridge unavailable");
  const response = await fetch(bridgeUrl, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Operations bridge unavailable");
  return response.json() as Promise<unknown>;
}

async function saveState(ctx: MutationCtx, value: typeof operationState.type) {
  const row = await ctx.db
    .query("operationsState")
    .withIndex("by_kind", (q) => q.eq("kind", value.kind))
    .unique();
  if (row && row.checkedAt > value.checkedAt) return;
  if (row) await ctx.db.patch(row._id, value);
  else await ctx.db.insert("operationsState", value);
}

export const claimCosts = internalMutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const now = Date.now();
    const items = await ctx.db
      .query("usage")
      .withIndex("by_reconciliation_and_reconcileAfter", (q) =>
        q.eq("reconciliation", "pending").lte("reconcileAfter", now),
      )
      .take(100);
    for (const item of items) await ctx.db.patch(item._id, { reconcileAfter: now + 15 * minute });
    return [...new Set(items.flatMap((item) => (item.providerRequest ? [item.providerRequest] : [])))];
  },
});

export const applyCosts = internalMutation({
  args: { checkedAt: v.number(), checked: v.number(), costs: v.union(v.null(), v.array(providerCost)) },
  returns: v.number(),
  handler: async (ctx, { checkedAt, checked, costs }) => {
    const matched = costs ? await applyNearCosts(ctx, costs) : 0;
    await saveState(ctx, {
      kind: "near_costs",
      checkedAt,
      checked,
      matched,
      status: costs ? "ok" : "unavailable",
      ...(costs ? { successAt: checkedAt } : {}),
    });
    return matched;
  },
});

async function enqueue(ctx: MutationCtx, key: string, subject: string, text: string) {
  const existing = await ctx.db
    .query("alertDeliveries")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) return existing._id;
  const now = Date.now();
  return ctx.db.insert("alertDeliveries", {
    key,
    subject,
    text,
    state: "queued",
    nextAt: now,
    purgeAt: now + retention,
    attempts: 0,
  });
}

const names: Record<string, string> = { "near-ai": "NEAR AI", phala: "Phala", tinfoil: "Tinfoil" };
const ruleLabel = {
  provider_errors: "Provider errors",
  slow_provider: "Slow provider",
  billing_pending: "Billing recovery",
};

export const captureAlerts = internalMutation({
  args: {
    checkedAt: v.number(),
    evaluatedAt: v.union(v.null(), v.number()),
    truncated: v.boolean(),
    items: v.array(gatewayIncident),
  },
  returns: v.null(),
  handler: async (ctx, { checkedAt, evaluatedAt, truncated, items }) => {
    const prior = await ctx.db
      .query("operationsState")
      .withIndex("by_kind", (q) => q.eq("kind", "gateway_alerts"))
      .unique();
    if (prior && prior.checkedAt > checkedAt) return null;
    if (evaluatedAt === null || (prior?.watermark && evaluatedAt < prior.watermark)) {
      await saveState(ctx, {
        kind: "gateway_alerts",
        checkedAt,
        checked: 0,
        matched: 0,
        status: "unavailable",
      });
      return null;
    }
    const start = Math.max(prior?.watermark ?? checkedAt - 10 * minute, checkedAt - retention);
    let matched = 0;
    for (const item of items.slice(0, 50)) {
      const prefix = [item.rule, item.provider, item.openedAt].join(":");
      const provider = names[item.provider];
      if (!provider) continue;
      const title = ruleLabel[item.rule] + " · " + provider;
      if (item.openedAt >= start || item.resolvedAt === undefined) {
        const detail =
          item.rule === "provider_errors"
            ? item.observed + "% of " + item.samples + " provider attempts failed."
            : item.rule === "slow_provider"
              ? "P95 provider latency is " + item.observed + " ms over " + item.samples + " attempts."
              : item.observed + " requests await billing recovery.";
        await enqueue(ctx, prefix + ":open", "[Sonnely] " + title, detail + "\n\nReview " + adminUrl);
        matched++;
      }
      if (item.resolvedAt !== undefined && item.resolvedAt >= start) {
        await enqueue(
          ctx,
          prefix + ":resolved",
          "[Sonnely] Resolved · " + title,
          "The alert is no longer open.\n\nReview " + adminUrl,
        );
        matched++;
      }
    }
    await saveState(ctx, {
      kind: "gateway_alerts",
      checkedAt,
      checked: items.length,
      matched,
      status: truncated ? "partial" : "ok",
      successAt: checkedAt,
      ...(!truncated ? { watermark: evaluatedAt } : {}),
    });
    return null;
  },
});

export const captureHealth = internalMutation({
  args: { checkedAt: v.number(), providers: v.union(v.array(providerCheck), v.null()) },
  returns: v.null(),
  handler: async (ctx, { checkedAt, providers }) => {
    const failed = providers?.filter(({ state }) => state === "unavailable") ?? [];
    await saveState(ctx, {
      kind: "provider_health",
      checkedAt,
      ...(providers ? { providers } : {}),
      checked: providers?.filter(({ state }) => state !== "disabled").length ?? 0,
      matched: providers?.filter(({ state }) => state === "ok").length ?? 0,
      status: !providers ? "unavailable" : failed.length ? "partial" : "ok",
    });
    const window = Math.floor(checkedAt / (6 * 60 * minute));
    for (const { provider } of failed) {
      await enqueue(
        ctx,
        "catalog:" + provider + ":" + window,
        "[Sonnely] Provider unavailable · " + names[provider],
        "The provider catalog probe failed. Review provider availability and account balance.\n\n" + adminUrl,
      );
    }
    if (!providers)
      await enqueue(
        ctx,
        "probe:" + window,
        "[Sonnely] Provider checks unavailable",
        "The gateway health bridge did not respond.\n\n" + adminUrl,
      );
    const budgetWindow = Math.floor(checkedAt / (24 * 60 * minute)) * 24 * 60 * minute;
    for (const provider of ["near-ai", "phala", "tinfoil"] as const) {
      const bucket = "provider:" + provider;
      const meter = await ctx.db
        .query("launchLimits")
        .withIndex("by_bucket_window", (q) => q.eq("bucket", bucket).eq("window", budgetWindow))
        .unique();
      const limit = providerDailyLimit(provider === "near-ai" ? undefined : provider);
      if ((meter?.used ?? 0) >= limit * 0.8)
        await enqueue(
          ctx,
          "provider-budget:" + provider + ":" + budgetWindow,
          "[Sonnely] Inference budget running low · " + names[provider],
          "Today’s reservations reached 80% of the provider limit. Check upstream credits before increasing it.\n\n" +
            adminUrl,
        );
    }
    const age = checkedAt - 15 * minute;
    const [stale, unreported] = await Promise.all(
      (["pending", "unreported"] as const).map((status) =>
        ctx.db
          .query("usage")
          .withIndex("by_status", (q) => q.eq("status", status).lt("_creationTime", age))
          .first(),
      ),
    );
    if (stale || unreported)
      await enqueue(
        ctx,
        "credit-holds:" + window,
        "[Sonnely] Credit recovery needs attention",
        "A credit hold is older than 15 minutes. Review Held credits and look up the provider’s usage before settling or releasing it.\n\n" +
          adminUrl,
      );
    const active = await ctx.db
      .query("computeRuns")
      .withIndex("by_ready", (q) => q.eq("active", true))
      .take(10);
    for (const run of active) {
      if (run.phase === "teardown" && run.teardownAt && run.teardownAt < checkedAt - 5 * minute)
        await enqueue(
          ctx,
          "compute-teardown:" + run._id,
          "[Sonnely] Compute teardown delayed",
          "A compute run is still awaiting provider deletion.\n\n" + adminUrl,
        );
    }
    const deposit = await ctx.db.query("recoveryHealth").first();
    if (!deposit || deposit.failures > 0 || deposit.checkedAt < checkedAt - 6 * minute)
      await enqueue(
        ctx,
        "deposit-recovery:" + window,
        "[Sonnely] Deposit recovery needs attention",
        "The Solana deposit check is stale or reported an error.\n\n" + adminUrl,
      );
    return null;
  },
});

export const providerHealth = query({
  args: secret,
  returns: v.union(v.null(), operationState),
  handler: async (ctx, args) => {
    service(args.secret);
    const row = await ctx.db
      .query("operationsState")
      .withIndex("by_kind", (q) => q.eq("kind", "provider_health"))
      .unique();
    if (!row) return null;
    const { _id, _creationTime, ...status } = row;
    return status;
  },
});

export const sweep = internalAction({
  args: {},
  returns: v.object({ checked: v.number(), reconciled: v.number() }),
  handler: async (ctx): Promise<{ checked: number; reconciled: number }> => {
    if (!process.env.SONNELY_OPERATIONS_TOKEN) return { checked: 0, reconciled: 0 };
    const checkedAt = Date.now();
    const ids = await ctx.runMutation(internal.operations.claimCosts, {});
    const requests = new Set(ids);
    const [costs, alerts, probes] = await Promise.all([
      ids.length
        ? bridge({ kind: "near_costs", requestIds: ids })
            .then((raw) => replyCosts.parse(raw).filter((item) => requests.has(item.requestId)))
            .catch(() => null)
        : Promise.resolve([]),
      bridge({ kind: "gateway_alerts" })
        .then((raw) => replyAlerts.parse(raw))
        .catch(() => ({ evaluatedAt: null, truncated: false, items: [] })),
      bridge({ kind: "provider_health" })
        .then((raw) => replyHealth.parse(raw))
        .catch(() => null),
    ]);
    const [reconciled] = await Promise.all([
      ctx.runMutation(internal.operations.applyCosts, { checkedAt, checked: ids.length, costs }),
      ctx.runMutation(internal.operations.captureAlerts, { checkedAt, ...alerts }),
      ctx.runMutation(internal.operations.captureHealth, { checkedAt, providers: probes }),
    ]);
    return { checked: ids.length, reconciled };
  },
});

export const recordStatementSync = internalMutation({
  args: { checkedAt: v.number(), checked: v.number(), matched: v.number(), failed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { checkedAt, checked, matched, failed }) => {
    await saveState(ctx, {
      kind: "provider_invoices",
      checkedAt,
      checked,
      matched,
      status: failed ? "partial" : "ok",
      ...(failed ? {} : { successAt: checkedAt }),
    });
    return null;
  },
});

export const importStatements = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const endpoint = process.env.SONNELY_STATEMENT_FEED_URL;
    const token = process.env.SONNELY_STATEMENT_FEED_TOKEN;
    if (!endpoint || !token) return null;
    const checkedAt = Date.now();
    const statements = await loadStatements(endpoint, token).catch(() => null);
    let matched = 0;
    let failed = !statements;
    for (const { currency: _currency, ...statement } of statements ?? []) {
      const recorded = await ctx
        .runMutation(internal.providerInvoices.ingestStatement, statement)
        .catch(() => null);
      if (recorded)
        matched += recorded.filter(
          ({ state }) => state === "new" || state === "exact" || state === "variance",
        ).length;
      else failed = true;
    }
    await ctx.runMutation(internal.operations.recordStatementSync, {
      checkedAt,
      checked: statements?.length ?? 0,
      matched,
      failed,
    });
    return null;
  },
});

export const queueTest = mutation({
  args: auth,
  returns: v.id("alertDeliveries"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    if (
      !(process.env.SONNELY_OPERATIONS_TOKEN && process.env.SONNELY_EMAIL_ENABLED === "true") &&
      !alertFallbackConfigured()
    )
      throw new ConvexError("External alerts are not configured.");
    return enqueue(
      ctx,
      "test:" + Math.floor(Date.now() / (10 * minute)),
      "[Sonnely] Operational alert test",
      "This is a test of Sonnely’s scheduled alert delivery. No incident was opened.\n\nReview " + adminUrl,
    );
  },
});

export const claimEmails = internalMutation({
  args: {},
  returns: v.array(
    v.object({ id: v.id("alertDeliveries"), subject: v.string(), text: v.string(), attempts: v.number() }),
  ),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("alertDeliveries")
      .withIndex("by_state_and_nextAt", (q) => q.eq("state", "sending").lte("nextAt", now))
      .take(20);
    for (const item of expired) await ctx.db.patch(item._id, { state: "unconfirmed" });
    const queue = await ctx.db
      .query("alertDeliveries")
      .withIndex("by_state_and_nextAt", (q) => q.eq("state", "queued").lte("nextAt", now))
      .take(10);
    for (const item of queue)
      await ctx.db.patch(item._id, {
        state: "sending",
        nextAt: now + 2 * minute,
        attempts: item.attempts + 1,
      });
    return queue.map((item) => ({
      id: item._id,
      subject: item.subject,
      text: item.text,
      attempts: item.attempts + 1,
    }));
  },
});

export const finishEmail = internalMutation({
  args: {
    id: v.id("alertDeliveries"),
    attempts: v.number(),
    state: alertDeliveryState,
    providerId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, attempts, state, providerId, errorCode }) => {
    const row = await ctx.db.get(id);
    if (row?.state !== "sending" || row.attempts !== attempts) return null;
    const now = Date.now();

    const nextAt = now + Math.min(15, 2 ** attempts) * minute;
    await ctx.db.patch(id, {
      state,
      errorCode,
      ...(providerId ? { providerId } : {}),
      ...(state === "queued" ? { nextAt } : {}),
    });
    return null;
  },
});

export const dispatch = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const mailEnabled =
      Boolean(process.env.SONNELY_OPERATIONS_TOKEN) && process.env.SONNELY_EMAIL_ENABLED === "true";
    if (!mailEnabled && !alertFallbackConfigured()) return null;
    const items = await ctx.runMutation(internal.operations.claimEmails, {});
    await Promise.all(
      items.map(async ({ id, subject, text, attempts }) => {
        const email = mailEnabled
          ? await bridge({ kind: "alert_email", id, subject, text })
              .then((raw) => emailReply.parse(raw))
              .catch(() => ({ state: "unconfirmed" as const, messageId: undefined, code: undefined }))
          : { state: "retry" as const, messageId: undefined, code: undefined };
        const fallback =
          email.state !== "delivered" &&
          email.state !== "accepted" &&
          (await sendAlertFallback(id, subject, text));
        const result = fallback
          ? { state: "accepted" as const, code: "E_SLACK_ACCEPTED", messageId: undefined }
          : email;
        await ctx.runMutation(internal.operations.finishEmail, {
          id,
          attempts,
          state: result.state === "retry" ? (attempts < 5 ? "queued" : "failed") : result.state,
          ...(result.messageId ? { providerId: result.messageId } : {}),
          ...(result.code ? { errorCode: result.code } : {}),
        });
      }),
    );
    return null;
  },
});

export const expire = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("alertDeliveries")
      .withIndex("by_expiry", (q) => q.lt("purgeAt", Date.now()))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});

export const status = query({
  args: auth,
  returns: v.object({
    emailEnabled: v.boolean(),
    fallbackConfigured: v.boolean(),
    checks: v.array(operationState),
    email: v.array(
      v.object({
        subject: v.string(),
        createdAt: v.number(),
        state: alertDeliveryState,
        errorCode: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const [checks, email] = await Promise.all([
      ctx.db.query("operationsState").take(4),
      ctx.db.query("alertDeliveries").order("desc").take(12),
    ]);
    return {
      emailEnabled: process.env.SONNELY_EMAIL_ENABLED === "true",
      fallbackConfigured: alertFallbackConfigured(),
      checks: checks.map(({ _id, _creationTime, ...row }) => row),
      email: email.map(({ subject, _creationTime, state, errorCode }) => ({
        subject,
        createdAt: _creationTime,
        state,
        ...(errorCode ? { errorCode } : {}),
      })),
    };
  },
});
