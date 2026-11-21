import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { secret, service } from "./access";
import { creditDeposit } from "./ledger";
import { mainnetMint } from "../lib/payments";

export const pending = internalQuery({
  args: { treasury: v.string(), now: v.number() },
  returns: v.array(
    v.object({
      id: v.id("deposits"),
      created: v.number(),
      wallet: v.string(),
      reference: v.string(),
      recipient: v.string(),
      mint: v.string(),
      amount: v.number(),
      cluster: v.string(),
    }),
  ),
  handler: async (ctx, { treasury, now }) => {
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_cluster_recipient_signature_next_check", (q) =>
        q
          .eq("cluster", "mainnet")
          .eq("recipient", treasury)
          .eq("signature", undefined)
          .lte("nextCheckAt", now),
      )
      .take(48);
    return (
      await Promise.all(
        rows.map(async (row) => {
          const account = await ctx.db.get(row.account);
          if (!account || row.mint !== mainnetMint || !Number.isSafeInteger(row.amount) || row.amount <= 0)
            return null;
          const { _id: id, _creationTime: created, reference, recipient, mint, amount, cluster } = row;
          return { id, created, wallet: account.wallet, reference, recipient, mint, amount, cluster };
        }),
      )
    ).filter((row) => row !== null);
  },
});

export const applyResult = internalMutation({
  args: { id: v.id("deposits"), signature: v.optional(v.string()), nextCheckAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { id, signature, nextCheckAt }) => {
    const row = await ctx.db.get(id);
    if (!row || row.signature || row.cluster !== "mainnet" || row.mint !== mainnetMint) return false;
    if (!signature) {
      await ctx.db.patch(row._id, { nextCheckAt });
      return false;
    }
    const account = await ctx.db.get(row.account);
    if (!account) return false;
    await creditDeposit(ctx, row, account, signature);
    return true;
  },
});

export const recordHealth = internalMutation({
  args: { failures: v.number() },
  returns: v.null(),
  handler: async (ctx, { failures }) => {
    const row = await ctx.db.query("recoveryHealth").first();
    const status = { checkedAt: Date.now(), failures };
    if (row) await ctx.db.patch(row._id, status);
    else await ctx.db.insert("recoveryHealth", status);
    return null;
  },
});

export const health = query({
  args: secret,
  returns: v.union(v.null(), v.object({ checkedAt: v.number(), failures: v.number() })),
  handler: async (ctx, args) => {
    service(args.secret);
    const row = await ctx.db.query("recoveryHealth").first();
    return row ? { checkedAt: row.checkedAt, failures: row.failures } : null;
  },
});
