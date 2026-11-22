import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth, requireAdmin, requireRecentAdmin } from "./access";
import { settleUsage } from "./ledger";

const staleAfterMs = 5 * 60_000;
const resolution = v.union(v.literal("release"), v.literal("settle"));

export const queue = query({
  args: { ...auth, now: v.number() },
  returns: v.object({
    held: v.array(
      v.object({
        id: v.id("usage"),
        created: v.number(),
        wallet: v.string(),
        model: v.string(),
        status: v.union(v.literal("pending"), v.literal("unreported")),
        cost: v.number(),
        providerRequest: v.optional(v.string()),
      }),
    ),
    recent: v.array(
      v.object({
        id: v.id("creditResolutions"),
        created: v.number(),
        usage: v.id("usage"),
        admin: v.string(),
        resolution,
        evidence: v.string(),
        held: v.number(),
        charged: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const cutoff = args.now - staleAfterMs;
    const rows = (
      await Promise.all(
        (["pending", "unreported"] as const).map((status) =>
          ctx.db
            .query("usage")
            .withIndex("by_status", (q) =>
              q.eq("status", status).lte("_creationTime", status === "pending" ? cutoff : args.now),
            )
            .take(25),
        ),
      )
    )
      .flat()
      .sort((a, b) => a._creationTime - b._creationTime)
      .slice(0, 25);
    const history = await ctx.db.query("creditResolutions").order("desc").take(10);
    return {
      held: await Promise.all(
        rows.map(async (row) => ({
          id: row._id,
          created: row._creationTime,
          wallet: (await ctx.db.get(row.account))?.wallet ?? "Unavailable",
          model: row.model,
          status: row.status as "pending" | "unreported",
          cost: row.cost,
          providerRequest: row.providerRequest,
        })),
      ),
      recent: await Promise.all(
        history.map(async (row) => ({
          id: row._id,
          usage: row.usage,
          created: row._creationTime,
          admin: (await ctx.db.get(row.admin))?.wallet ?? "Unavailable",
          resolution: row.resolution,
          evidence: row.evidence,
          held: row.held,
          charged: row.charged,
        })),
      ),
    };
  },
});

export const resolve = mutation({
  args: {
    ...auth,
    id: v.id("usage"),
    resolution,
    charged: v.number(),
    evidence: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireRecentAdmin(ctx, args);
    const row = await ctx.db.get(args.id);
    if (!row || (row.status !== "pending" && row.status !== "unreported"))
      throw new ConvexError("This reservation is no longer held.");
    if (row.status === "pending" && row._creationTime > Date.now() - staleAfterMs)
      throw new ConvexError("Wait five minutes before resolving an inference reservation.");
    const evidence = args.evidence.trim();
    if (evidence.length < 8 || evidence.length > 500)
      throw new ConvexError("Record a provider receipt or an investigation note.");
    const charged = args.charged;
    if (
      !Number.isSafeInteger(charged) ||
      charged > row.cost ||
      (args.resolution === "release" ? charged !== 0 : charged <= 0)
    )
      throw new ConvexError("The final charge must fit within the reserved amount.");
    await settleUsage(ctx, row, {
      status: args.resolution === "release" ? "failed" : "complete",
      cost: charged,
      input: row.input,
      output: row.output,
      ...(charged && row.providerRequest ? { providerRequest: row.providerRequest } : {}),
    });
    await ctx.db.insert("creditResolutions", {
      usage: row._id,
      admin: admin._id,
      resolution: args.resolution,
      evidence,
      held: row.cost,
      charged,
    });
    return null;
  },
});
