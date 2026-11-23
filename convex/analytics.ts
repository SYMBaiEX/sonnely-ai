import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { auth, requireAdmin } from "./access";

const span = 86_400_000;
const limit = 2_000;
const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);

const provider = v.union(v.literal("near-ai"), v.literal("phala"), v.literal("tinfoil"));
type Provider = typeof provider.type;

type DayBucket = {
  day: string;
  requests: number;
  completed: number;
  failed: number;
  held: number;
  spend: number;
  signups: number;
  deposits: number;
  depositUsd: number;
};

export const daily = query({
  args: { ...auth, days: v.number() },
  returns: v.object({
    days: v.array(
      v.object({
        day: v.string(),
        requests: v.number(),
        completed: v.number(),
        failed: v.number(),
        held: v.number(),
        spend: v.number(),
        signups: v.number(),
        deposits: v.number(),
        depositUsd: v.number(),
      }),
    ),
    truncated: v.boolean(),
    topCustomers: v.array(
      v.object({
        id: v.id("accounts"),
        wallet: v.string(),
        name: v.string(),
        username: v.optional(v.string()),
        spend: v.number(),
        requests: v.number(),
      }),
    ),
    topModels: v.array(v.object({ model: v.string(), spend: v.number(), requests: v.number() })),
    providerSplit: v.array(v.object({ provider, requests: v.number() })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const range = Math.min(90, Math.max(7, Math.round(args.days)));
    const [usage, deposits, accounts] = await Promise.all([
      ctx.db.query("usage").order("desc").take(limit),
      ctx.db.query("deposits").order("desc").take(limit),
      ctx.db.query("accounts").order("desc").take(limit),
    ]);
    const since = Date.parse(utcDay(Date.now() - (range - 1) * span));
    const days: DayBucket[] = [];
    const buckets = new Map<string, DayBucket>();
    for (let offset = 0; offset < range; offset++) {
      const day = utcDay(since + offset * span);
      const bucket: DayBucket = {
        day,
        requests: 0,
        completed: 0,
        failed: 0,
        held: 0,
        spend: 0,
        signups: 0,
        deposits: 0,
        depositUsd: 0,
      };
      days.push(bucket);
      buckets.set(day, bucket);
    }
    const customers = new Map<Id<"accounts">, { spend: number; requests: number }>();
    const models = new Map<string, { spend: number; requests: number }>();
    const providers = new Map<Provider, number>();
    for (const row of usage) {
      if (row._creationTime < since) continue;
      const bucket = buckets.get(utcDay(row._creationTime));
      if (bucket) {
        bucket.requests++;
        if (row.status === "complete") {
          bucket.completed++;
          bucket.spend += row.cost;
        } else if (row.status === "failed") bucket.failed++;
        else bucket.held++;
      }
      const customer = customers.get(row.account) ?? { spend: 0, requests: 0 };
      customer.requests++;
      const model = models.get(row.model) ?? { spend: 0, requests: 0 };
      model.requests++;
      if (row.status === "complete") {
        customer.spend += row.cost;
        model.spend += row.cost;
      }
      customers.set(row.account, customer);
      models.set(row.model, model);
      const route = row.provider ?? ("near-ai" as const);
      providers.set(route, (providers.get(route) ?? 0) + 1);
    }
    for (const row of deposits) {
      if (!row.signature || row.cluster !== "mainnet") continue;
      const bucket = buckets.get(utcDay(row.finalizedAt ?? row._creationTime));
      if (!bucket) continue;
      bucket.deposits++;
      bucket.depositUsd += row.amount;
    }
    for (const row of accounts) {
      if (row._creationTime < since) continue;
      const bucket = buckets.get(utcDay(row._creationTime));
      if (bucket) bucket.signups++;
    }
    const identities = new Map<Id<"accounts">, Doc<"accounts">>(accounts.map((row) => [row._id, row]));
    const leaders = [...customers.entries()]
      .filter(([, metric]) => metric.spend > 0)
      .sort((a, b) => b[1].spend - a[1].spend || b[1].requests - a[1].requests)
      .slice(0, 10);
    const topCustomers = await Promise.all(
      leaders.map(async ([id, metric]) => {
        const account = identities.get(id) ?? (await ctx.db.get(id));
        return {
          id,
          wallet: account?.wallet ?? "Unavailable",
          name: account?.name ?? "",
          username: account?.username,
          spend: metric.spend,
          requests: metric.requests,
        };
      }),
    );
    const topModels = [...models.entries()]
      .filter(([, metric]) => metric.spend > 0)
      .sort(
        (a, b) =>
          b[1].spend - a[1].spend || b[1].requests - a[1].requests || a[0].localeCompare(b[0]),
      )
      .slice(0, 10)
      .map(([model, metric]) => ({ model, spend: metric.spend, requests: metric.requests }));
    const providerSplit = [...providers.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([route, requests]) => ({ provider: route, requests }));
    return {
      days,
      truncated: usage.length === limit || deposits.length === limit || accounts.length === limit,
      topCustomers,
      topModels,
      providerSplit,
    };
  },
});
