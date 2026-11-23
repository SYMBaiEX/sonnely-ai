import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { auth, requireOperator } from "./access";
import { recordAudit } from "./events";

const taskView = v.object({
  id: v.id("crmTasks"),
  title: v.string(),
  dueAt: v.optional(v.number()),
  doneAt: v.optional(v.number()),
  assignee: v.string(),
  creator: v.string(),
  created: v.number(),
});

export async function taskDoc(ctx: QueryCtx, row: Doc<"crmTasks">) {
  const [assignee, creator] = await Promise.all([ctx.db.get(row.assignee), ctx.db.get(row.creator)]);
  return {
    id: row._id,
    title: row.title,
    dueAt: row.dueAt,
    doneAt: row.doneAt,
    assignee: assignee?.wallet ?? "Unavailable",
    creator: creator?.wallet ?? "Unavailable",
    created: row._creationTime,
  };
}

export const create = mutation({
  args: { ...auth, account: v.id("accounts"), title: v.string(), dueAt: v.optional(v.number()) },
  returns: v.id("crmTasks"),
  handler: async (ctx, args) => {
    const admin = await requireOperator(ctx, args, "support");
    const title = args.title.trim();
    if (!title || title.length > 160) throw new ConvexError("Write a follow-up of up to 160 characters.");
    if (!(await ctx.db.get(args.account))) throw new ConvexError("Account unavailable.");
    const id = await ctx.db.insert("crmTasks", {
      account: args.account,
      assignee: admin._id,
      creator: admin._id,
      title,
      dueAt: args.dueAt,
    });
    await ctx.db.insert("crmEvents", {
      account: args.account,
      admin: admin._id,
      kind: "task",
      note: "Follow-up: " + title,
    });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "crm.task",
      targetKind: "accounts",
      targetId: args.account,
      summary: "Follow-up: " + title,
      meta: { task: id, dueAt: args.dueAt },
    });
    return id;
  },
});

export const complete = mutation({
  args: { ...auth, id: v.id("crmTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOperator(ctx, args, "support");
    const task = await ctx.db.get(args.id);
    if (!task) throw new ConvexError("Follow-up unavailable.");
    if (task.doneAt === undefined) await ctx.db.patch(task._id, { doneAt: Date.now() });
    return null;
  },
});

export const reopen = mutation({
  args: { ...auth, id: v.id("crmTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOperator(ctx, args, "support");
    const task = await ctx.db.get(args.id);
    if (!task) throw new ConvexError("Follow-up unavailable.");
    if (task.doneAt !== undefined) await ctx.db.patch(task._id, { doneAt: undefined });
    return null;
  },
});

export const listForAccount = query({
  args: { ...auth, account: v.id("accounts") },
  returns: v.array(taskView),
  handler: async (ctx, args) => {
    await requireOperator(ctx, args, "support");
    const rows = await ctx.db
      .query("crmTasks")
      .withIndex("by_account", (q) => q.eq("account", args.account))
      .order("desc")
      .take(50);
    return await Promise.all(rows.map((row) => taskDoc(ctx, row)));
  },
});

export const mine = query({
  args: { ...auth, openOnly: v.optional(v.boolean()) },
  returns: v.array(
    v.object({
      id: v.id("crmTasks"),
      account: v.id("accounts"),
      wallet: v.string(),
      name: v.string(),
      title: v.string(),
      dueAt: v.optional(v.number()),
      doneAt: v.optional(v.number()),
      created: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const admin = await requireOperator(ctx, args, "support");
    const rows = await ctx.db
      .query("crmTasks")
      .withIndex("by_assignee_done", (q) =>
        args.openOnly ? q.eq("assignee", admin._id).eq("doneAt", undefined) : q.eq("assignee", admin._id),
      )
      .order("desc")
      .take(100);
    return await Promise.all(
      rows.map(async (row) => {
        const account = await ctx.db.get(row.account);
        return {
          id: row._id,
          account: row.account,
          wallet: account?.wallet ?? "Unavailable",
          name: account?.name ?? "",
          title: row.title,
          dueAt: row.dueAt,
          doneAt: row.doneAt,
          created: row._creationTime,
        };
      }),
    );
  },
});
