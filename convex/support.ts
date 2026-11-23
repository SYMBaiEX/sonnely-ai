import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { auth, requireAccount, service } from "./access";
import { recordEvent } from "./events";

const state = v.union(v.literal("open"), v.literal("in_progress"), v.literal("resolved"));
const myTicket = v.object({
  id: v.id("tickets"),
  topic: v.string(),
  email: v.string(),
  state,
  opened: v.number(),
  updated: v.optional(v.number()),
  replyCount: v.number(),
  hasPublicReply: v.boolean(),
  lastReplyAt: v.optional(v.number()),
});
const threadReply = v.object({
  id: v.id("ticketReplies"),
  mine: v.boolean(),
  body: v.string(),
  time: v.number(),
});

async function myTicketDoc(ctx: QueryCtx, account: Id<"accounts">, row: Doc<"tickets">) {
  const replies = await ctx.db
    .query("ticketReplies")
    .withIndex("by_ticket", (q) => q.eq("ticket", row._id))
    .collect();
  const visible = replies.filter((item) => item.visibility === "public");
  const staff = visible.filter((item) => item.author !== account);
  const lastReplyAt = staff.length
    ? Math.max(...staff.map((item) => item._creationTime))
    : undefined;
  return {
    id: row._id,
    topic: row.topic,
    email: row.email,
    state: row.state ?? ("open" as const),
    opened: row._creationTime,
    updated: row.updatedAt,
    replyCount: visible.length,
    hasPublicReply: staff.length > 0,
    lastReplyAt,
  };
}

export const myTickets = query({
  args: { ...auth, page: paginationOptsValidator },
  returns: v.object({ page: v.array(myTicket), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const result = await ctx.db
      .query("tickets")
      .withIndex("by_account", (q) => q.eq("account", account._id))
      .order("desc")
      .paginate({ ...args.page, numItems: 20 });
    return {
      page: await Promise.all(result.page.map((row) => myTicketDoc(ctx, account._id, row))),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const myThread = query({
  args: { ...auth, id: v.id("tickets") },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("tickets"),
      topic: v.string(),
      email: v.string(),
      state,
      message: v.string(),
      opened: v.number(),
      replies: v.array(threadReply),
    }),
  ),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const ticket = await ctx.db.get(args.id);
    if (!ticket || ticket.account !== account._id)
      throw new ConvexError("Support request unavailable.");
    const replies = await ctx.db
      .query("ticketReplies")
      .withIndex("by_ticket", (q) => q.eq("ticket", ticket._id))
      .order("desc")
      .take(50);
    return {
      id: ticket._id,
      topic: ticket.topic,
      email: ticket.email,
      state: ticket.state ?? ("open" as const),
      message: ticket.message,
      opened: ticket._creationTime,
      replies: replies
        .filter((item) => item.visibility === "public")
        .reverse()
        .map((item) => ({
          id: item._id,
          mine: item.author === account._id,
          body: item.body,
          time: item._creationTime,
        })),
    };
  },
});

export const customerReply = mutation({
  args: { ...auth, id: v.id("tickets"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const ticket = await ctx.db.get(args.id);
    if (!ticket || ticket.account !== account._id)
      throw new ConvexError("Support request unavailable.");
    const body = args.body.trim();
    if (!body || body.length > 4000)
      throw new ConvexError("Write a reply of up to 4,000 characters.");
    await ctx.db.insert("ticketReplies", {
      ticket: ticket._id,
      author: account._id,
      visibility: "public",
      body,
    });
    await ctx.db.patch(
      ticket._id,
      ticket.state === "resolved"
        ? { updatedAt: Date.now(), state: undefined }
        : { updatedAt: Date.now() },
    );
    await recordEvent(ctx, {
      account: account._id,
      kind: "support",
      actor: account.wallet,
      summary: "Replied on support request",
    });
    return null;
  },
});

export const openTicket = mutation({
  args: { ...auth, email: v.string(), topic: v.string(), message: v.string() },
  returns: v.id("tickets"),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const email = args.email.trim();
    const topic = args.topic.trim();
    const message = args.message.trim();
    if (
      !email ||
      email.length > 254 ||
      !topic ||
      topic.length > 60 ||
      !message ||
      message.length > 3000
    )
      throw new ConvexError("Check the request fields and try again.");
    const recent = await ctx.db
      .query("tickets")
      .withIndex("by_account", (q) =>
        q.eq("account", account._id).gte("_creationTime", Date.now() - 86400_000),
      )
      .take(5);
    if (recent.length >= 5) throw new ConvexError("Daily request limit reached.");
    const id = await ctx.db.insert("tickets", { account: account._id, email, topic, message });
    await recordEvent(ctx, {
      account: account._id,
      kind: "support",
      actor: account.wallet,
      summary: "Opened support request: " + topic,
    });
    return id;
  },
});
