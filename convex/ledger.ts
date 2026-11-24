import bs58 from "bs58";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { enqueueGatewaySettlement } from "./usageMaxOutbox";

export async function settleUsage(
  ctx: MutationCtx,
  row: Doc<"usage">,
  args: {
    status: "complete" | "failed" | "unreported";
    cost: number;
    input: number;
    output: number;
    providerRequest?: string;
    providerStatus?: number;
    providerReportedCostNano?: number;
    usageMaxDetails?: Doc<"usage">["usageMaxDetails"];
    outcome?: string;
  },
) {
  const cost = args.status === "unreported" ? row.cost : Math.min(row.cost, args.cost);
  const refund = row.cost - cost;
  const account = await ctx.db.get(row.account);
  if (account) await ctx.db.patch(account._id, { balance: account.balance + refund });
  if (row.key) {
    const key = await ctx.db.get(row.key);
    const day = row.keyDay ?? new Date(row._creationTime).toISOString().slice(0, 10);
    if (key) {
      const daily = await ctx.db
        .query("keyDays")
        .withIndex("by_key_day", (q) => q.eq("key", key._id).eq("day", day))
        .unique();
      if (daily) await ctx.db.patch(daily._id, { spent: daily.spent - refund });
      await ctx.db.patch(key._id, { lifetime: key.lifetime - refund });
    }
  }
  if (row.project && refund > 0) {
    const project = await ctx.db.get("teamProjects", row.project);
    if (project) await ctx.db.patch("teamProjects", project._id, { spent: project.spent - refund });
  }
  const settledAt = Date.now();
  const providerReportedCostNano = row.provider === undefined ? undefined : args.providerReportedCostNano;
  const knownUsage =
    args.input > 0 || args.output > 0 ? { inputTokens: args.input, outputTokens: args.output } : undefined;
  const usageMaxDetails =
    args.usageMaxDetails ?? row.usageMaxDetails ?? (knownUsage && { usage: knownUsage });
  await ctx.db.patch(row._id, {
    input: args.input,
    output: args.output,
    cost,
    status: args.status,
    settledAt,
    ...(usageMaxDetails === undefined ? {} : { usageMaxDetails }),
    ...(args.providerStatus === undefined ? {} : { providerStatus: args.providerStatus }),
    ...(args.outcome ? { outcome: args.outcome } : {}),
    ...(args.providerRequest ? { providerRequest: args.providerRequest } : {}),
    ...(providerReportedCostNano === undefined ? {} : { providerReportedCostNano }),
    ...(row.provider === undefined && args.status === "complete" && args.providerRequest
      ? { reconciliation: "pending" }
      : {}),
  });
  await enqueueGatewaySettlement(ctx, row, {
    status: args.status,
    cost,
    settledAt,
    providerReportedCostNano: providerReportedCostNano ?? row.providerReportedCostNano,
    usageMaxDetails,
    outcome: args.outcome ?? row.outcome,
    providerStatus: args.providerStatus ?? row.providerStatus,
  });
}

export async function assertDepositSignatureUnused(
  ctx: MutationCtx,
  signature: string,
  owner?: { pilot?: Id<"confidentialPilotOrders">; confidential?: Id<"confidentialPaymentOrders"> },
) {
  const [publicDeposit, pilotDeposit, confidentialDeposit] = await Promise.all([
    ctx.db
      .query("deposits")
      .withIndex("by_signature", (q) => q.eq("signature", signature))
      .unique(),
    ctx.db
      .query("confidentialPilotOrders")
      .withIndex("by_submission_signature", (q) => q.eq("submission.signature", signature))
      .unique(),
    ctx.db
      .query("confidentialPaymentOrders")
      .withIndex("by_signature", (q) => q.eq("signature", signature))
      .unique(),
  ]);
  if (
    publicDeposit ||
    (pilotDeposit && pilotDeposit._id !== owner?.pilot) ||
    (confidentialDeposit && confidentialDeposit._id !== owner?.confidential)
  )
    throw new ConvexError("Payment already recorded.");
}

export async function assertDepositReferenceUnused(ctx: MutationCtx, reference: string) {
  const matches = await Promise.all([
    ctx.db
      .query("deposits")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first(),
    ctx.db
      .query("confidentialPilotOrders")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first(),
    ctx.db
      .query("confidentialPaymentOrders")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first(),
  ]);
  if (matches.some(Boolean)) throw new ConvexError("Payment reference already exists.");
}

export function base58Bytes(value: string, size: 32 | 64) {
  if (value.length < size || value.length > (size === 32 ? 44 : 88)) return false;
  try {
    return bs58.decode(value).length === size;
  } catch {
    return false;
  }
}

export function creditedConfidentialDeposits(ctx: QueryCtx, since: number, limit: number) {
  return ctx.db
    .query("confidentialPaymentOrders")
    .withIndex("by_status_and_resolvedAt", (q) => q.eq("status", "credited").gte("resolvedAt", since))
    .order("desc")
    .take(limit);
}

export async function hasCreditedDeposit(ctx: QueryCtx, account: Id<"accounts">) {
  const [publicDeposit, confidentialDeposit] = await Promise.all([
    ctx.db
      .query("deposits")
      .withIndex("by_account_cluster_signature", (q) =>
        q.eq("account", account).eq("cluster", "mainnet").gt("signature", undefined),
      )
      .first(),
    ctx.db
      .query("confidentialPaymentOrders")
      .withIndex("by_account_and_status", (q) => q.eq("account", account).eq("status", "credited"))
      .first(),
  ]);
  return Boolean(publicDeposit || confidentialDeposit);
}

export async function creditDeposit(
  ctx: MutationCtx,
  row: Doc<"deposits">,
  account: Doc<"accounts">,
  signature: string,
) {
  if (row.signature === signature) return;
  if (row.signature) throw new ConvexError("Payment already recorded.");
  await assertDepositSignatureUnused(ctx, signature);
  const balance = account.balance + row.amount;
  if (row.cluster === "mainnet" && !Number.isSafeInteger(balance))
    throw new ConvexError("The payment exceeds the credit balance limit.");
  await ctx.db.patch(row._id, { signature, nextCheckAt: undefined, finalizedAt: Date.now() });
  if (row.cluster === "mainnet") await ctx.db.patch(account._id, { balance });
}
