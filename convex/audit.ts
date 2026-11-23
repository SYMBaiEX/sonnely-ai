import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { auth, requireAdmin } from "./access";

const auditEntry = v.object({
  id: v.id("adminAudit"),
  time: v.number(),
  actor: v.string(),
  action: v.string(),
  targetKind: v.string(),
  targetId: v.string(),
  summary: v.string(),
  meta: v.optional(v.any()),
});

export const auditTrail = query({
  args: {
    ...auth,
    action: v.optional(v.string()),
    actor: v.optional(v.string()),
    since: v.optional(v.number()),
    page: paginationOptsValidator,
  },
  returns: v.object({ page: v.array(auditEntry), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const action = args.action?.trim().slice(0, 40) || undefined;
    const prefix = args.actor?.trim().slice(0, 60) || undefined;
    const account = prefix
      ? await ctx.db
          .query("accounts")
          .withIndex("by_wallet", (q) => q.gte("wallet", prefix).lt("wallet", prefix + "\uffff"))
          .first()
      : undefined;
    if (prefix && !account) return { page: [], isDone: true, continueCursor: "" };
    const base = (
      action
        ? ctx.db.query("adminAudit").withIndex("by_action", (q) => q.eq("action", action))
        : account
          ? ctx.db.query("adminAudit").withIndex("by_actor", (q) => q.eq("actor", account._id))
          : ctx.db.query("adminAudit")
    ).order("desc");
    const rows =
      (action && account) || args.since !== undefined
        ? base.filter((q) =>
            q.and(
              ...(action && account ? [q.eq(q.field("actor"), account._id)] : []),
              ...(args.since === undefined
                ? []
                : [q.gte(q.field("_creationTime"), args.since)]),
            ),
          )
        : base;
    const result = await rows.paginate({ ...args.page, numItems: 30 });
    return {
      page: await Promise.all(
        result.page.map(async (row) => ({
          id: row._id,
          time: row._creationTime,
          actor: (await ctx.db.get(row.actor))?.wallet ?? "Unavailable",
          action: row.action,
          targetKind: row.targetKind,
          targetId: row.targetId,
          summary: row.summary,
          meta: row.meta,
        })),
      ),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
