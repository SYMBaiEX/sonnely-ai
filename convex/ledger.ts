import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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
  await ctx.db.patch(row._id, {
    input: args.input,
    output: args.output,
    cost,
    status: args.status,
    settledAt: Date.now(),
    ...(args.providerStatus === undefined ? {} : { providerStatus: args.providerStatus }),
    ...(args.outcome ? { outcome: args.outcome } : {}),
    ...(args.providerRequest ? { providerRequest: args.providerRequest } : {}),
    ...(args.status === "complete" && args.providerRequest ? { reconciliation: "pending" } : {}),
  });
}

export async function creditDeposit(
  ctx: MutationCtx,
  row: Doc<"deposits">,
  account: Doc<"accounts">,
  signature: string,
) {
  if (row.signature === signature) return;
  const used = await ctx.db
    .query("deposits")
    .withIndex("by_signature", (q) => q.eq("signature", signature))
    .unique();
  if (used || row.signature) throw new ConvexError("Payment already recorded.");
  const balance = account.balance + row.amount;
  if (row.cluster === "mainnet" && !Number.isSafeInteger(balance))
    throw new ConvexError("The payment exceeds the credit balance limit.");
  await ctx.db.patch(row._id, { signature, nextCheckAt: undefined, finalizedAt: Date.now() });
  if (row.cluster === "mainnet") await ctx.db.patch(account._id, { balance });
}
