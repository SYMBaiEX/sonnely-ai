import { v } from "convex/values";
import { query } from "./_generated/server";
import { auth, requireAccount, service } from "./access";

export const settled = query({
  args: { ...auth, since: v.number() },
  returns: v.array(
    v.object({
      id: v.id("usage"),
      time: v.number(),
      model: v.string(),
      provider: v.string(),
      input: v.number(),
      output: v.number(),
      cost: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const rows = await ctx.db
      .query("usage")
      .withIndex("by_account_status_time", (q) =>
        q.eq("account", account._id).eq("status", "complete").gte("_creationTime", args.since),
      )
      .order("desc")
      .take(100);
    return rows.map(({ _id, _creationTime, model, provider, input, output, cost }) => ({
      id: _id,
      time: _creationTime,
      model,
      provider: provider ?? "near-ai",
      input,
      output,
      cost,
    }));
  },
});
