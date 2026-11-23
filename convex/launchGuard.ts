import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { secret, service } from "./access";
import type { Doc } from "./_generated/dataModel";

const minute = 60_000;
const day = 86_400_000;

function positiveLimit(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function providerDailyLimit(provider: Doc<"usage">["provider"]) {
  return positiveLimit(
    provider === "phala"
      ? process.env.SONNELY_PHALA_DAILY_LIMIT_MICROUSD
      : provider === "tinfoil"
        ? process.env.SONNELY_TINFOIL_DAILY_LIMIT_MICROUSD
        : process.env.SONNELY_NEAR_DAILY_LIMIT_MICROUSD,
    25_000_000,
  );
}

export async function guardProvider(
  ctx: MutationCtx,
  provider: Doc<"usage">["provider"],
  cost: number,
  now: number,
) {
  const route = provider ?? "near-ai";
  const dailyLimit = providerDailyLimit(provider);
  const concurrentLimit = Math.min(100, positiveLimit(process.env.SONNELY_PROVIDER_CONCURRENCY, 20));
  const active = await ctx.db
    .query("usage")
    .withIndex("by_provider_status", (q) =>
      q
        .eq("provider", provider)
        .eq("status", "pending")
        .gt("_creationTime", now - 2 * minute),
    )
    .take(concurrentLimit);
  if (active.length >= concurrentLimit)
    throw new ConvexError("Provider concurrency limit reached. Try again shortly.");
  const window = Math.floor(now / day) * day;
  const meter = await ctx.db
    .query("launchLimits")
    .withIndex("by_bucket_window", (q) => q.eq("bucket", "provider:" + route).eq("window", window))
    .unique();
  const reserved = (meter?.used ?? 0) + cost;
  if (reserved > dailyLimit) throw new ConvexError("Provider daily reservation limit reached.");
  if (meter) await ctx.db.patch(meter._id, { used: reserved });
  else await ctx.db.insert("launchLimits", { bucket: "provider:" + route, window, used: reserved });
}

export const throttleSignIn = mutation({
  args: { ...secret, bucket: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    if (!/^[a-f0-9]{64}$/.test(args.bucket)) throw new ConvexError("Invalid sign-in bucket.");
    const bucket = "sign-in:" + args.bucket;
    const window = Math.floor(Date.now() / minute) * minute;
    const row = await ctx.db
      .query("launchLimits")
      .withIndex("by_bucket_window", (q) => q.eq("bucket", bucket).eq("window", window))
      .unique();
    if ((row?.used ?? 0) >= 30)
      throw new ConvexError("Sign-in request limit reached. Try again in one minute.");
    if (row) await ctx.db.patch(row._id, { used: row.used + 1 });
    else await ctx.db.insert("launchLimits", { bucket, window, used: 1 });
    return null;
  },
});

export const expire = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 2 * day;
    const expired = await ctx.db
      .query("launchLimits")
      .withIndex("by_window", (q) => q.lt("window", cutoff))
      .take(400);
    for (const row of expired) await ctx.db.delete(row._id);
    return null;
  },
});
