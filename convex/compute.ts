import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { auth, requireAccount, requireAdmin, service } from "./access";
import { computeProgress, kind, spec } from "./computeValidators";
import {
  computeFee,
  computeMarkup,
  computePlans,
  computePrice,
  computeRetention,
  imagePattern,
  repositoryPattern,
  revisionPattern,
} from "../lib/compute";
import { termsVersion } from "../lib/policy";
import { blackboxHourlyBase } from "../lib/blackbox-options";

import { computeFeatures } from "../lib/compute-features";

const leaseMs = 60_000;

function availability() {
  const flags = computeFeatures();
  return {
    blackboxes: flags.blackboxes && Boolean(process.env.PHALA_CLOUD_API_KEY),
    "dry-docks": flags["dry-docks"] && Boolean(process.env.BOAT_API_KEY),
  };
}

function summary(row: Doc<"computeRuns">) {
  return {
    id: row._id,
    createdAt: row._creationTime,
    spec: row.spec,
    minutes: row.minutes,
    phase: row.phase,
    result: row.result,
    stopRequested: row.stopRequested ?? false,
    active: row.active,
    reserve: row.reserve,
    charged: row.charged,
    base: row.base,
    fee: row.fee,
    seconds: row.seconds,
    expiresAt: row.expiresAt,
    startedAt: row.startedAt,
    workAt: row.workAt,
    teardownAt: row.teardownAt,
    settledAt: row.settledAt,
    purgeAt: row.purgeAt,
    hasLog: Boolean(row.log),
    endpoint: row.active && row.phase === "running" ? row.endpoint : undefined,
    evidenceAt: row.evidenceAt,
    composeHash: row.composeHash,
    hasEvidence: Boolean(row.evidence),
    hasArtifact: Boolean(row.artifact),
    message: row.message,
  };
}

export const list = query({
  args: { ...auth, kind, id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const runs = await ctx.db
      .query("computeRuns")
      .withIndex("by_account_kind", (q) => q.eq("account", account._id).eq("kind", args.kind))
      .order("desc")
      .take(30);
    const id = args.id ? ctx.db.normalizeId("computeRuns", args.id) : null;
    const selected = id ? await ctx.db.get(id) : null;
    return {
      enabled: availability()[args.kind],
      runs: runs.map(summary),
      detail:
        selected?.account === account._id && selected.kind === args.kind ? summary(selected) : undefined,
      log: selected?.account === account._id && selected.kind === args.kind ? (selected.log ?? "") : "",
      selected: selected?.account === account._id && selected.kind === args.kind ? selected._id : undefined,
    };
  },
});

export const file = query({
  args: { ...auth, id: v.string(), type: v.union(v.literal("artifact"), v.literal("evidence")) },
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const id = ctx.db.normalizeId("computeRuns", args.id);
    const row = id ? await ctx.db.get(id) : null;
    const file = row?.account === account._id ? row[args.type] : undefined;
    return file ? await ctx.storage.getUrl(file) : null;
  },
});

export const open = mutation({
  args: { ...auth, spec, minutes: v.number(), reference: v.string() },
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    if (account.termsVersion !== termsVersion) throw new ConvexError("Accept the current Sonnely terms.");
    const { spec, minutes, reference } = args;
    const plan = computePlans[spec.kind];
    if (!/^[a-f0-9]{32}$/.test(reference) || !(plan.minutes as readonly number[]).includes(minutes))
      throw new ConvexError("Choose a supported rental window and submit again.");
    if (spec.kind === "blackboxes") {
      if (
        spec.image.length > 240 ||
        !imagePattern.test(spec.image) ||
        !Number.isInteger(spec.port) ||
        spec.port < 1 ||
        spec.port > 65535
      )
        throw new ConvexError(
          "Use a public Docker Hub or GHCR image pinned to a SHA-256 digest and a port from 1 to 65535.",
        );
    } else {
      const repo = spec.repository.split("/").at(-1);
      if (
        !repositoryPattern.test(spec.repository) ||
        repo === "." ||
        repo === ".." ||
        repo?.endsWith(".git") ||
        !revisionPattern.test(spec.revision)
      )
        throw new ConvexError("Use a public GitHub repository URL and its full 40-character commit SHA.");
    }
    const previous = await ctx.db
      .query("computeRuns")
      .withIndex("by_account_reference", (q) => q.eq("account", account._id).eq("reference", reference))
      .unique();
    if (previous) return { id: previous._id };
    if (!availability()[spec.kind])
      throw new ConvexError("This compute product is unavailable for new runs.");
    const active = await ctx.db
      .query("computeRuns")
      .withIndex("by_account_active", (q) => q.eq("account", account._id).eq("active", true))
      .first();
    if (active) throw new ConvexError("The active compute run limit is one per wallet.");
    const limit = spec.kind === "blackboxes" ? 2 : 4;
    const capacity = await ctx.db
      .query("computeRuns")
      .withIndex("by_kind_active", (q) => q.eq("kind", spec.kind).eq("active", true))
      .take(limit);
    if (capacity.length >= limit)
      throw new ConvexError("The pilot capacity limit was reached. Try again shortly.");
    const hourlyBase =
      spec.kind === "blackboxes" ? blackboxHourlyBase(spec.machine, spec.disk) : plan.hourlyBase;
    const reserve = computePrice(hourlyBase, plan.unitSeconds, minutes * 60).total;
    if (account.balance < reserve) throw new ConvexError("Add credits to cover the quoted maximum.");
    const id = await ctx.db.insert("computeRuns", {
      account: account._id,
      kind: spec.kind,
      spec,
      reference,
      minutes,
      reserve,
      hourlyBase,
      unitSeconds: plan.unitSeconds,
      markup: computeMarkup,
      fixedFee: computeFee,
      active: true,
      phase: "queued",
      nextAt: Date.now(),
    });
    await ctx.db.patch(account._id, { balance: account.balance - reserve });
    await ctx.scheduler.runAfter(0, internal.computeWorker.run, { id });
    return { id };
  },
});

export const stop = mutation({
  args: { ...auth, id: v.string() },
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const id = ctx.db.normalizeId("computeRuns", args.id);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.account !== account._id) throw new ConvexError("Compute run not found.");
    if (row.active && !row.stopRequested) {
      await ctx.db.patch(row._id, { stopRequested: true, nextAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.computeWorker.run, { id: row._id });
    }
  },
});

export const claim = internalMutation({
  args: { id: v.id("computeRuns") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    const now = Date.now();
    if (!row?.active || row.nextAt > now || (row.lease ?? 0) > now) return null;
    const lease = now + leaseMs;
    await ctx.db.patch(id, { lease, nextAt: lease });
    return { ...row, lease };
  },
});

const progress = v.object(
  Object.fromEntries(
    Object.entries(computeProgress).map(([key, validator]) => [key, v.optional(validator)]),
  ) as { [K in keyof typeof computeProgress]: ReturnType<typeof v.optional<(typeof computeProgress)[K]>> },
);

export const advance = internalMutation({
  args: {
    id: v.id("computeRuns"),
    lease: v.number(),
    patch: progress,
    delay: v.number(),
    settle: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, lease, patch, delay, settle }) => {
    const row = await ctx.db.get(id);
    if (!row?.active || row.lease !== lease) return false;
    if (settle) {
      const now = Date.now();
      const start = patch.startedAt ?? row.startedAt;
      const end = patch.endedAt ?? row.endedAt ?? now;
      const elapsed = start === undefined ? 0 : Math.max(1, Math.ceil((end - start) / 1000));
      const seconds = Math.min(row.minutes * 60, patch.meteredSeconds ?? row.meteredSeconds ?? elapsed);
      const timeBase = Math.ceil(
        (row.hourlyBase * Math.ceil(seconds / row.unitSeconds) * row.unitSeconds) / 3600,
      );
      const base = Math.min(timeBase, patch.meteredBase ?? row.meteredBase ?? timeBase);
      const fee = base ? row.fixedFee + Math.ceil((base * row.markup) / 100) : 0;
      const charged = base + fee;
      const account = await ctx.db.get(row.account);
      if (account) await ctx.db.patch(account._id, { balance: account.balance + row.reserve - charged });
      await ctx.db.patch(id, {
        ...patch,
        active: false,
        lease: undefined,
        phase: "settled",
        settledAt: now,
        nextAt: now,
        purgeAt: now + computeRetention,
        seconds,
        base,
        fee,
        charged,
        commitToken: undefined,
        endpoint: undefined,
      });
      return true;
    }
    const wait =
      row.stopRequested && (patch.providerId ?? row.providerId) && (patch.phase ?? row.phase) !== "teardown"
        ? 0
        : delay;
    const now = Date.now();
    await ctx.db.patch(id, {
      ...patch,
      lease: undefined,
      nextAt: now + wait,
      workAt: row.workAt ?? (patch.phase === "running" ? now : undefined),
      teardownAt: row.teardownAt ?? (patch.phase === "teardown" ? now : undefined),
    });
    await ctx.scheduler.runAfter(wait, internal.computeWorker.run, { id });
    return true;
  },
});

async function purge(ctx: MutationCtx, rows: Doc<"computeRuns">[]) {
  for (const row of rows) {
    for (const file of [row.artifact, row.evidence]) if (file) await ctx.storage.delete(file);
    await ctx.db.patch(row._id, {
      artifact: undefined,
      evidence: undefined,
      log: undefined,
      purgeAt: undefined,
    });
  }
}

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const runs = await ctx.db
      .query("computeRuns")
      .withIndex("by_ready", (q) => q.eq("active", true).lte("nextAt", now))
      .take(16);
    for (const { _id: id } of runs) await ctx.scheduler.runAfter(0, internal.computeWorker.run, { id });
    await purge(
      ctx,
      await ctx.db
        .query("computeRuns")
        .withIndex("by_purge", (q) => q.gt("purgeAt", undefined).lte("purgeAt", now))
        .take(16),
    );
  },
});

export const markLaunch = internalMutation({
  args: { id: v.id("computeRuns"), lease: v.number(), at: v.number() },
  handler: async (ctx, { id, lease, at }) => {
    const row = await ctx.db.get(id);
    if (!row?.active || row.lease !== lease || row.stopRequested || row.launchAttemptAt) return false;
    await ctx.db.patch(id, { phase: "provisioning", launchAttemptAt: at });
    return true;
  },
});

export const markCommand = internalMutation({
  args: { id: v.id("computeRuns"), lease: v.number() },
  handler: async (ctx, { id, lease }) => {
    const row = await ctx.db.get(id);
    if (!row?.active || row.lease !== lease || row.stopRequested || row.commandAttemptAt) return false;
    await ctx.db.patch(id, { commandAttemptAt: Date.now() });
    return true;
  },
});

export const adminSummary = query({
  args: { ...auth, since: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const [recent, open] = await Promise.all([
      ctx.db
        .query("computeRuns")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", args.since))
        .order("desc")
        .take(101),
      ctx.db
        .query("computeRuns")
        .withIndex("by_ready", (q) => q.eq("active", true))
        .take(16),
    ]);
    const stats = (kind: "blackboxes" | "dry-docks") => {
      const runs = recent.slice(0, 100).filter((row) => row.kind === kind);
      const active = open.filter((row) => row.kind === kind);
      return {
        runs: runs.length,
        completed: runs.filter((row) => row.result === "completed").length,
        failed: runs.filter((row) => row.result === "failed").length,
        meteredSeconds: runs.reduce((sum, row) => sum + (row.seconds ?? 0), 0),
        active: active.length,
        held: active.reduce((sum, row) => sum + row.reserve, 0),
        teardown: active.filter((row) => row.phase === "teardown").length,
        delayedTeardown: active.filter((row) => row.teardownAt && Date.now() - row.teardownAt > 120_000)
          .length,
        charged: runs.reduce((sum, row) => sum + (row.charged ?? 0), 0),
        base: runs.reduce((sum, row) => sum + (row.base ?? 0), 0),
        fee: runs.reduce((sum, row) => sum + (row.fee ?? 0), 0),
      };
    };
    return {
      blackboxes: stats("blackboxes"),
      "dry-docks": stats("dry-docks"),
      truncated: recent.length > 100,
    };
  },
});

export const authorizeCapacityRead = internalQuery({
  args: auth,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    return null;
  },
});

export const exportRun = query({
  args: { ...auth, id: v.string(), type: v.union(v.literal("receipt"), v.literal("log")) },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const id = ctx.db.normalizeId("computeRuns", args.id);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.account !== account._id || row.kind !== "dry-docks") return null;
    if (args.type === "log") return row.log || null;
    if (row.active) return null;
    return JSON.stringify(
      {
        run: row._id,
        result: row.result,
        workload: row.spec,
        created_at_ms: row._creationTime,
        settled_at_ms: row.settledAt,
        metered_seconds: row.seconds,
        reserve_microusd: row.reserve,
        provider_base_microusd: row.base,
        fee_microusd: row.fee,
        charged_microusd: row.charged,
        released_microusd: row.reserve - (row.charged ?? 0),
      },
      null,
      2,
    );
  },
});
