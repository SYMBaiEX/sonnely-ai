import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { auth, requireAdmin, requireRecentAdmin } from "./access";
import { recordAudit } from "./events";
import { amendGatewayCost } from "./usageMaxOutbox";

const payoutOrder = {
  reference: v.string(),
  amount: v.number(),
  recipient: v.string(),
  treasury: v.string(),
  mint: v.string(),
  cluster: v.literal("mainnet"),
};

const payoutView = v.object({
  ...payoutOrder,
  time: v.number(),
  signature: v.optional(v.string()),
});
const payoutDoc = v.object({
  ...payoutOrder,
  id: v.id("payouts"),
  signature: v.optional(v.string()),
  transaction: v.optional(v.string()),
  lastValidBlockHeight: v.optional(v.number()),
});
const usageMetric = v.object({
  requests: v.number(),
  complete: v.number(),
  failed: v.number(),
  held: v.number(),
  input: v.number(),
  output: v.number(),
  spendMicros: v.number(),
});

async function totals(ctx: QueryCtx) {
  return ctx.db.query("finance").unique();
}

const emptyFinance = { reconciled: 0, customerMicros: 0, providerNano: 0, paidMicros: 0 };
const available = (data: typeof emptyFinance) =>
  Math.max(0, data.customerMicros - Math.ceil(data.providerNano / 1000) - data.paidMicros);

export const overview = query({
  args: { ...auth, since: v.number() },
  returns: v.object({
    stats: usageMetric,
    models: v.record(v.string(), usageMetric),
    activeWallets: v.number(),
    deposits: v.number(),
    depositMicros: v.number(),
    tickets: v.number(),
    truncated: v.boolean(),
    finance: v.object({
      reconciled: v.number(),
      customerMicros: v.number(),
      providerNano: v.number(),
      paidMicros: v.number(),
      availableMicros: v.number(),
    }),
    payouts: v.array(payoutView),
    hasUnreconciled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const limit = 1_000;
    const [usage, deposits, tickets, finance, payouts, pendingCost] = await Promise.all([
      ctx.db
        .query("usage")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", args.since))
        .order("desc")
        .take(limit + 1),
      ctx.db
        .query("deposits")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", args.since))
        .order("desc")
        .take(limit + 1),
      ctx.db
        .query("tickets")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", args.since))
        .order("desc")
        .take(limit + 1),
      totals(ctx),
      ctx.db.query("payouts").order("desc").take(15),
      ctx.db
        .query("usage")
        .withIndex("by_reconciliation", (q) => q.eq("reconciliation", "pending"))
        .first(),
    ]);
    const zero = () => ({
      requests: 0,
      complete: 0,
      failed: 0,
      held: 0,
      input: 0,
      output: 0,
      spendMicros: 0,
    });
    const stats = zero();
    const byModel = new Map<string, ReturnType<typeof zero>>();
    for (const row of usage.slice(0, limit)) {
      const model = byModel.get(row.model) ?? zero();
      byModel.set(row.model, model);
      for (const metric of [stats, model]) {
        metric.requests++;
        metric.input += row.input;
        metric.output += row.output;
        if (row.status === "complete") {
          metric.complete++;
          metric.spendMicros += row.cost;
        } else if (row.status === "failed") metric.failed++;
        else metric.held++;
      }
    }
    const finalized = deposits.slice(0, limit).filter((row) => row.cluster === "mainnet" && row.signature);
    const ledger = finance ?? emptyFinance;
    const open = finance?.pendingPayout ? await ctx.db.get(finance.pendingPayout) : null;
    return {
      stats,
      models: Object.fromEntries(byModel),
      activeWallets: new Set(usage.slice(0, limit).map((row) => row.account)).size,
      deposits: finalized.length,
      depositMicros: finalized.reduce((sum, row) => sum + row.amount, 0),
      tickets: Math.min(tickets.length, limit),
      truncated: [usage, deposits, tickets].some((list) => list.length > limit),
      finance: {
        reconciled: ledger.reconciled,
        customerMicros: ledger.customerMicros,
        providerNano: ledger.providerNano,
        paidMicros: ledger.paidMicros,
        availableMicros: Math.max(0, available(ledger) - (open?.amount ?? 0)),
      },
      payouts: payouts.map(
        ({ reference, amount, recipient, treasury, mint, cluster, signature, _creationTime }) => ({
          reference,
          amount,
          recipient,
          treasury,
          mint,
          cluster,
          signature,
          time: _creationTime,
        }),
      ),
      hasUnreconciled: Boolean(pendingCost),
    };
  },
});

export const pendingCosts = query({
  args: auth,
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const rows = await ctx.db
      .query("usage")
      .withIndex("by_reconciliation", (q) => q.eq("reconciliation", "pending"))
      .order("asc")
      .take(100);
    return rows.flatMap((row) => (row.providerRequest ? [row.providerRequest] : []));
  },
});

export const providerCost = v.object({ requestId: v.string(), costNanoUsd: v.number() });

export async function applyNearCosts(ctx: MutationCtx, costs: Array<typeof providerCost.type>) {
  if (costs.length > 100) throw new ConvexError("Reconcile at most 100 requests.");
  const existing = await totals(ctx);
  const ledger = {
    ...emptyFinance,
    ...(existing && {
      reconciled: existing.reconciled,
      customerMicros: existing.customerMicros,
      providerNano: existing.providerNano,
      paidMicros: existing.paidMicros,
    }),
  };
  let count = 0;
  for (const cost of costs) {
    if (!Number.isSafeInteger(cost.costNanoUsd) || cost.costNanoUsd <= 0) continue;
    const rows = await ctx.db
      .query("usage")
      .withIndex("by_provider_request", (q) => q.eq("providerRequest", cost.requestId))
      .take(2);
    const row = rows.length === 1 ? rows[0] : undefined;
    if (!row || row.provider !== undefined || row.status !== "complete" || row.reconciliation !== "pending")
      continue;
    await ctx.db.patch(row._id, { reconciliation: "reconciled", providerCostNano: cost.costNanoUsd });
    await amendGatewayCost(ctx, row._id, cost.costNanoUsd);
    ledger.reconciled++;
    ledger.customerMicros += row.cost;
    ledger.providerNano += cost.costNanoUsd;
    count++;
  }
  if (count > 0) {
    if (existing) await ctx.db.patch(existing._id, ledger);
    else await ctx.db.insert("finance", ledger);
  }
  return count;
}

export const reconcile = mutation({
  args: { ...auth, costs: v.array(providerCost) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const matched = await applyNearCosts(ctx, args.costs);
    if (matched)
      await recordAudit(ctx, {
        actor: admin._id,
        action: "finance.reconcile",
        targetKind: "finance",
        targetId: "ledger",
        summary: "Reconciled " + matched + " provider cost" + (matched === 1 ? "" : "s"),
      });
    return matched;
  },
});

export const payoutCoverage = query({
  args: auth,
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const [accounts, pending, unreported, compute] = await Promise.all([
      ctx.db.query("accounts").take(2_001),
      ctx.db
        .query("usage")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .take(1_001),
      ctx.db
        .query("usage")
        .withIndex("by_status", (q) => q.eq("status", "unreported"))
        .take(1_001),
      ctx.db
        .query("computeRuns")
        .withIndex("by_ready", (q) => q.eq("active", true))
        .take(17),
    ]);
    if (compute.length > 16 || accounts.length > 2_000 || pending.length > 1_000 || unreported.length > 1_000)
      return null;
    return (
      accounts.reduce((sum, row) => sum + row.balance, 0) +
      pending.reduce((sum, row) => sum + row.cost, 0) +
      unreported.reduce((sum, row) => sum + row.cost, 0) +
      compute.reduce((sum, row) => sum + row.reserve, 0)
    );
  },
});

export const openPayout = mutation({
  args: { ...auth, reference: v.string(), mint: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const account = await requireRecentAdmin(ctx, args);
    const treasury = process.env.SONNELY_TREASURY_WALLET;
    const recipient = process.env.SONNELY_PROFIT_WALLET;
    if (!treasury || !recipient || treasury === recipient) throw new ConvexError("Payout is not configured.");
    const ledger = await totals(ctx);
    const open = ledger?.pendingPayout ? await ctx.db.get(ledger.pendingPayout) : null;
    if (open) return open.reference;
    const amount = ledger ? available(ledger) : 0;
    if (!ledger || !amount) throw new ConvexError("No reconciled margin is available.");
    const payout = await ctx.db.insert("payouts", {
      reference: args.reference,
      mint: args.mint,
      cluster: "mainnet",
      amount,
      treasury,
      recipient,
      createdBy: account._id,
    });
    await ctx.db.patch(ledger._id, { pendingPayout: payout });
    await recordAudit(ctx, {
      actor: account._id,
      action: "finance.openPayout",
      targetKind: "payout",
      targetId: payout,
      summary: "Opened payout " + args.reference + " for " + amount + " micros",
    });
    return args.reference;
  },
});

async function pendingPayout(ctx: QueryCtx, reference: string) {
  const ledger = await totals(ctx);
  const row = ledger?.pendingPayout ? await ctx.db.get(ledger.pendingPayout) : null;
  if (!ledger || !row || row.reference !== reference) throw new ConvexError("Payout unavailable.");
  return { ledger, row };
}

function payoutByReference(ctx: QueryCtx, reference: string) {
  return ctx.db
    .query("payouts")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .unique();
}

export const payoutDetails = query({
  args: { ...auth, reference: v.string() },
  returns: payoutDoc,
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const row = await payoutByReference(ctx, args.reference);
    if (!row || (!row.signature && (await totals(ctx))?.pendingPayout !== row._id))
      throw new ConvexError("Payout unavailable.");
    const {
      _id: id,
      reference,
      treasury,
      recipient,
      amount,
      mint,
      cluster,
      signature,
      transaction,
      lastValidBlockHeight,
    } = row;
    return {
      id,
      reference,
      treasury,
      recipient,
      amount,
      mint,
      cluster,
      signature,
      transaction,
      lastValidBlockHeight,
    };
  },
});

export const savePayoutTransaction = mutation({
  args: {
    ...auth,
    reference: v.string(),
    transaction: v.string(),
    lastValidBlockHeight: v.number(),
    observedHeight: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args);
    const { ledger, row } = await pendingPayout(ctx, args.reference);
    if (account.wallet !== row.treasury)
      throw new ConvexError("Only the treasury wallet can approve a payout.");
    if (row.amount > available(ledger)) throw new ConvexError("Reconciled margin has changed.");
    if (row.transaction && (row.lastValidBlockHeight ?? 0) >= args.observedHeight) return row.transaction;
    await ctx.db.patch(row._id, {
      transaction: args.transaction,
      lastValidBlockHeight: args.lastValidBlockHeight,
    });
    await recordAudit(ctx, {
      actor: account._id,
      action: "finance.savePayoutTransaction",
      targetKind: "payout",
      targetId: row._id,
      summary: "Saved payout transaction for " + args.reference,
    });
    return args.transaction;
  },
});

export const confirmPayout = mutation({
  args: { ...auth, reference: v.string(), signature: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const already = await payoutByReference(ctx, args.reference);
    if (already?.signature === args.signature) return null;
    const { ledger, row } = await pendingPayout(ctx, args.reference);
    await ctx.db.patch(row._id, { signature: args.signature });
    await ctx.db.patch(ledger._id, { paidMicros: ledger.paidMicros + row.amount, pendingPayout: undefined });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "finance.confirmPayout",
      targetKind: "payout",
      targetId: row._id,
      summary: "Confirmed payout " + args.reference + " on chain",
    });
    return null;
  },
});
