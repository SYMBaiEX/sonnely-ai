import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { auth, requireAdmin, walletRole } from "./access";
import { firstConversion } from "./referralPipeline";

const state = v.union(v.literal("open"), v.literal("in_progress"), v.literal("resolved"));
const outcome = v.union(
  v.literal("pending"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("unreported"),
);
const filter = v.union(v.literal("all"), state);
const traceFilter = v.union(v.literal("all"), outcome);
const identity = v.object({
  id: v.id("accounts"),
  joined: v.number(),
  wallet: v.string(),
  name: v.string(),
  username: v.optional(v.string()),
  balance: v.number(),
  role: v.string(),
});
const trace = v.object({
  id: v.id("usage"),
  account: v.id("accounts"),
  started: v.number(),
  settled: v.optional(v.number()),
  status: outcome,
  model: v.string(),
  keyName: v.string(),
  cost: v.number(),
  input: v.number(),
  output: v.number(),
  providerRequest: v.optional(v.string()),
  provider: v.union(v.literal("near-ai"), v.literal("phala")),
  providerCostNano: v.optional(v.number()),
  providerReportedCostNano: v.optional(v.number()),
  providerStatus: v.optional(v.number()),
  outcome: v.optional(v.string()),
});
const support = v.object({
  id: v.id("tickets"),
  account: v.id("accounts"),
  opened: v.number(),
  updated: v.optional(v.number()),
  topic: v.string(),
  email: v.string(),
  message: v.string(),
  state,
  assignedWallet: v.optional(v.string()),
});
const paging = { isDone: v.boolean(), continueCursor: v.string() };

function customerDoc(row: Doc<"accounts">) {
  return {
    id: row._id,
    joined: row._creationTime,
    wallet: row.wallet,
    name: row.name,
    username: row.username,
    balance: row.balance,
    role: walletRole(row.wallet),
  };
}

function traceDoc(row: Doc<"usage">) {
  return {
    id: row._id,
    account: row.account,
    started: row._creationTime,
    settled: row.settledAt,
    status: row.status,
    model: row.model,
    keyName: row.keyName,
    cost: row.cost,
    input: row.input,
    output: row.output,
    providerRequest: row.providerRequest,
    provider: row.provider ?? ("near-ai" as const),
    providerCostNano: row.providerCostNano,
    providerReportedCostNano: row.providerReportedCostNano,
    providerStatus: row.providerStatus,
    outcome: row.outcome,
  };
}

async function ticketDoc(ctx: QueryCtx, row: Doc<"tickets">) {
  return {
    id: row._id,
    account: row.account,
    opened: row._creationTime,
    updated: row.updatedAt,
    topic: row.topic,
    email: row.email,
    message: row.message,
    state: row.state ?? ("open" as const),
    assignedWallet: row.assignedTo ? (await ctx.db.get(row.assignedTo))?.wallet : undefined,
  };
}

export const customers = query({
  args: { ...auth, search: v.string(), page: paginationOptsValidator },
  returns: v.object({ page: v.array(identity), ...paging }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const search = args.search.trim().slice(0, 50);
    const lower = search.replace(/^@/, "").toLowerCase();
    const rows = !search
      ? ctx.db.query("accounts").order("desc")
      : search.length >= 30 && !search.startsWith("@")
        ? ctx.db
            .query("accounts")
            .withIndex("by_wallet", (q) => q.gte("wallet", search).lt("wallet", search + "\uffff"))
        : ctx.db
            .query("accounts")
            .withIndex("by_username", (q) => q.gte("username", lower).lt("username", lower + "\uffff"));
    const result = await rows.paginate({ ...args.page, numItems: 30 });
    return {
      page: result.page.map(customerDoc),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const tickets = query({
  args: { ...auth, state: filter, page: paginationOptsValidator },
  returns: v.object({ page: v.array(support), ...paging }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const selected = args.state;
    const rows =
      selected === "all"
        ? ctx.db.query("tickets")
        : selected === "open"
          ? ctx.db.query("tickets").withIndex("by_state", (q) => q.eq("state", undefined))
          : ctx.db.query("tickets").withIndex("by_state", (q) => q.eq("state", selected));
    const result = await rows.order("desc").paginate({ ...args.page, numItems: 25 });
    return {
      page: await Promise.all(result.page.map((row) => ticketDoc(ctx, row))),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const traces = query({
  args: { ...auth, status: traceFilter, search: v.string(), page: paginationOptsValidator },
  returns: v.object({ page: v.array(trace), ...paging }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const search = args.search.trim().slice(0, 80);
    const selected = args.status;
    if (search) {
      const id = ctx.db.normalizeId("usage", search);
      const match = id
        ? await ctx.db.get(id)
        : await ctx.db
            .query("usage")
            .withIndex("by_provider_request", (q) => q.eq("providerRequest", search))
            .first();
      return {
        page: match && (selected === "all" || selected === match.status) ? [traceDoc(match)] : [],
        isDone: true,
        continueCursor: "",
      };
    }
    const rows =
      selected === "all"
        ? ctx.db.query("usage")
        : ctx.db.query("usage").withIndex("by_status", (q) => q.eq("status", selected));
    const result = await rows.order("desc").paginate({ ...args.page, numItems: 30 });
    return { page: result.page.map(traceDoc), isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const customer = query({
  args: { ...auth, id: v.id("accounts") },
  returns: v.union(
    v.null(),
    v.object({
      customer: identity,
      funded: v.boolean(),
      active: v.boolean(),
      acceptedTerms: v.optional(v.string()),
      acceptedAt: v.optional(v.number()),
      inviter: v.optional(identity),
      deposits: v.array(
        v.object({
          id: v.id("deposits"),
          time: v.number(),
          amount: v.number(),
          cluster: v.string(),
          reference: v.string(),
          signature: v.optional(v.string()),
        }),
      ),
      traces: v.array(trace),
      tickets: v.array(support),
      activity: v.array(
        v.object({
          id: v.id("crmEvents"),
          time: v.number(),
          actor: v.string(),
          kind: v.string(),
          note: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const account = await ctx.db.get(args.id);
    if (!account) return null;
    const [inviter, deposits, traces, tickets, notes, conversion] = await Promise.all([
      account.invitedBy ? ctx.db.get(account.invitedBy) : null,
      ctx.db
        .query("deposits")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(12),
      ctx.db
        .query("usage")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(12),
      ctx.db
        .query("tickets")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(12),
      ctx.db
        .query("crmEvents")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(20),
      firstConversion(ctx, account._id),
    ]);
    return {
      customer: customerDoc(account),
      ...conversion,
      acceptedTerms: account.termsVersion,
      acceptedAt: account.termsAcceptedAt,
      inviter: inviter ? customerDoc(inviter) : undefined,
      deposits: deposits.map((row) => ({
        id: row._id,
        time: row.finalizedAt ?? row._creationTime,
        amount: row.amount,
        cluster: row.cluster,
        reference: row.reference,
        signature: row.signature,
      })),
      traces: traces.map(traceDoc),
      tickets: await Promise.all(tickets.map((row) => ticketDoc(ctx, row))),
      activity: await Promise.all(
        notes.map(async (row) => ({
          id: row._id,
          time: row._creationTime,
          actor: (await ctx.db.get(row.admin))?.wallet ?? "Unavailable",
          kind: row.kind,
          note: row.note,
        })),
      ),
    };
  },
});

export const addNote = mutation({
  args: { ...auth, account: v.id("accounts"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const note = args.note.trim();
    if (!note || note.length > 2000) throw new ConvexError("Write a note of up to 2,000 characters.");
    if (!(await ctx.db.get(args.account))) throw new ConvexError("Account unavailable.");
    await ctx.db.insert("crmEvents", { admin: admin._id, account: args.account, kind: "note", note });
    return null;
  },
});

export const updateTicket = mutation({
  args: {
    ...auth,
    id: v.id("tickets"),
    state,
    assignment: v.union(v.literal("keep"), v.literal("claim"), v.literal("unassign")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const ticket = await ctx.db.get(args.id);
    if (!ticket) throw new ConvexError("Support request unavailable.");
    const old = ticket.state ?? "open";
    const assignedTo =
      args.assignment === "keep" ? ticket.assignedTo : args.assignment === "claim" ? admin._id : undefined;
    if (old === args.state && assignedTo === ticket.assignedTo) return null;
    await ctx.db.patch(ticket._id, {
      state: args.state === "open" ? undefined : args.state,
      assignedTo,
      updatedAt: Date.now(),
    });
    const assignment =
      assignedTo === ticket.assignedTo ? "" : assignedTo ? ". Assigned to acting admin." : ". Unassigned.";
    await ctx.db.insert("crmEvents", {
      account: ticket.account,
      admin: admin._id,
      ticket: ticket._id,
      kind: "ticket",
      note: "Support status changed from " + old + " to " + args.state + assignment,
    });
    return null;
  },
});
