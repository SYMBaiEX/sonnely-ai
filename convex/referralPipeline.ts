import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { auth, requireAccount, service } from "./access";

export async function firstConversion(ctx: QueryCtx, id: Id<"accounts">) {
  const [deposit, request] = await Promise.all([
    ctx.db
      .query("deposits")
      .withIndex("by_account_cluster_signature", (q) =>
        q.eq("account", id).eq("cluster", "mainnet").gt("signature", undefined),
      )
      .first(),
    ctx.db
      .query("usage")
      .withIndex("by_account_status_cost", (q) => q.eq("account", id).eq("status", "complete").gt("cost", 0))
      .first(),
  ]);
  return { funded: Boolean(deposit), active: Boolean(request) };
}

export const list = query({
  args: { ...auth, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        username: v.optional(v.string()),
        wallet: v.string(),
        joined: v.number(),
        funded: v.boolean(),
        active: v.boolean(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const result = await ctx.db
      .query("accounts")
      .withIndex("by_inviter", (q) => q.eq("invitedBy", account._id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(30, Math.max(1, args.paginationOpts.numItems)),
      });
    return {
      page: await Promise.all(
        result.page.map(async (row) => ({
          username: row.username,
          wallet: row.wallet.slice(0, 4) + "…" + row.wallet.slice(-4),
          joined: row._creationTime,
          ...(await firstConversion(ctx, row._id)),
        })),
      ),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
