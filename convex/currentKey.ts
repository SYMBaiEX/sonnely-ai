import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireActiveKey, secret, service } from "./access";

const optionalAmount = v.union(v.number(), v.null());
const budget = {
  cap_microusd: optionalAmount,
  used_microusd: v.number(),
  remaining_microusd: optionalAmount,
};

function budgetView(cap: number | null, used: number) {
  return {
    cap_microusd: cap,
    used_microusd: used,
    remaining_microusd: cap === null ? null : Math.max(0, cap - used),
  };
}

export const status = query({
  args: { ...secret, hash: v.string(), now: v.number() },
  returns: v.object({
    name: v.string(),
    expires_at_ms: v.union(v.number(), v.null()),
    daily: v.object({ ...budget, resets_at: v.string() }),
    lifetime: v.object(budget),
  }),
  handler: async (ctx, args) => {
    service(args.secret);
    const key = await requireActiveKey(ctx, args.hash, args.now);
    const now = new Date(args.now);
    const day = now.toISOString().slice(0, 10);
    const tally = await ctx.db
      .query("keyDays")
      .withIndex("by_key_day", (q) => q.eq("key", key._id).eq("day", day))
      .unique();
    const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return {
      name: key.name,
      expires_at_ms: key.expires,
      daily: { ...budgetView(key.dailyCap, tally?.spent ?? 0), resets_at: new Date(nextDay).toISOString() },
      lifetime: budgetView(key.cap, key.lifetime),
    };
  },
});
