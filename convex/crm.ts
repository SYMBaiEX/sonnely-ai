import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { auth, requireAdmin, requireOperator, walletRole } from "./access";
import { recordAudit, recordEvent } from "./events";
import { termsVersion } from "../lib/policy";
import { firstConversion } from "./referralPipeline";
import { taskDoc } from "./crmTasks";

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
  onboarding: v.optional(v.union(v.literal("pending"), v.literal("fund"), v.literal("later"))),
});
const listed = v.object({
  ...identity.fields,
  flags: v.array(v.string()),
  funded: v.boolean(),
  active: v.boolean(),
});
const customerFilter = v.object({
  flag: v.optional(v.string()),
  funded: v.optional(v.union(v.literal("any"), v.literal("funded"), v.literal("unfunded"))),
  active: v.optional(v.boolean()),
});
const customerSort = v.union(v.literal("recent"), v.literal("spend"), v.literal("balance"));
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
  provider: v.union(v.literal("near-ai"), v.literal("phala"), v.literal("tinfoil")),
  wallet: v.optional(v.string()),
  providerCostNano: v.optional(v.number()),
  providerReportedCostNano: v.optional(v.number()),
  providerStatus: v.optional(v.number()),
  outcome: v.optional(v.string()),
});
const supportFields = {
  id: v.id("tickets"),
  account: v.id("accounts"),
  opened: v.number(),
  updated: v.optional(v.number()),
  topic: v.string(),
  email: v.string(),
  message: v.string(),
  state,
  assignedWallet: v.optional(v.string()),
  replyCount: v.number(),
};
const support = v.object(supportFields);
const reply = v.object({
  id: v.id("ticketReplies"),
  author: v.string(),
  visibility: v.union(v.literal("public"), v.literal("internal")),
  body: v.string(),
  time: v.number(),
});
const timelineItem = v.object({
  id: v.union(v.id("accountEvents"), v.id("crmEvents")),
  time: v.number(),
  kind: v.string(),
  actor: v.string(),
  summary: v.optional(v.string()),
  note: v.optional(v.string()),
});
const customerStats = v.object({
  totalDeposits: v.number(),
  totalSpend: v.number(),
  requestCount: v.number(),
  lastActiveAt: v.optional(v.number()),
  referredCount: v.number(),
});
const referral = v.object({
  id: v.id("accounts"),
  wallet: v.string(),
  username: v.optional(v.string()),
  joined: v.number(),
  funded: v.boolean(),
  active: v.boolean(),
});
const apiKey = v.object({
  id: v.id("keys"),
  name: v.string(),
  prefix: v.string(),
  revoked: v.boolean(),
  lastUsed: v.optional(v.number()),
});
const paging = { isDone: v.boolean(), continueCursor: v.string() };

async function flagNames(ctx: QueryCtx, account: Id<"accounts">) {
  const rows = await ctx.db
    .query("accountFlags")
    .withIndex("by_account", (q) => q.eq("account", account))
    .collect();
  return rows.map((row) => row.flag).sort();
}

function customerDoc(row: Doc<"accounts">) {
  return {
    id: row._id,
    joined: row._creationTime,
    wallet: row.wallet,
    name: row.name,
    username: row.username,
    balance: row.balance,
    role: walletRole(row.wallet),
    onboarding: row.onboarding,
  };
}

function traceDoc(row: Doc<"usage">, wallet?: string) {
  return {
    id: row._id,
    account: row.account,
    wallet,
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

function traceWalletPage(ctx: QueryCtx, rows: Doc<"usage">[]) {
  return Promise.all(
    rows.map(async (row) => traceDoc(row, (await ctx.db.get(row.account))?.wallet)),
  );
}

async function ticketDoc(ctx: QueryCtx, row: Doc<"tickets">) {
  const [assigned, replies] = await Promise.all([
    row.assignedTo ? ctx.db.get(row.assignedTo) : null,
    ctx.db
      .query("ticketReplies")
      .withIndex("by_ticket", (q) => q.eq("ticket", row._id))
      .collect(),
  ]);
  return {
    id: row._id,
    account: row.account,
    opened: row._creationTime,
    updated: row.updatedAt,
    topic: row.topic,
    email: row.email,
    message: row.message,
    state: row.state ?? ("open" as const),
    assignedWallet: assigned?.wallet,
    replyCount: replies.length,
  };
}

async function replyDoc(ctx: QueryCtx, row: Doc<"ticketReplies">) {
  return {
    id: row._id,
    author: (await ctx.db.get(row.author))?.wallet ?? "Unavailable",
    visibility: row.visibility,
    body: row.body,
    time: row._creationTime,
  };
}

export const customers = query({
  args: {
    ...auth,
    search: v.string(),
    filter: v.optional(customerFilter),
    sort: v.optional(customerSort),
    page: paginationOptsValidator,
  },
  returns: v.object({ page: v.array(listed), ...paging }),
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
    const flag = args.filter?.flag?.trim().toLowerCase().slice(0, 24) || undefined;
    const funded =
      args.filter?.funded === "funded" || args.filter?.funded === "unfunded" ? args.filter.funded : undefined;
    const active = args.filter?.active;
    const sort = args.sort ?? "recent";
    const since = Date.now() - 30 * 86_400_000;
    const signals = async (account: Id<"accounts">) => {
      const [deposit, request] = await Promise.all([
        ctx.db
          .query("deposits")
          .withIndex("by_account_cluster_signature", (q) =>
            q.eq("account", account).eq("cluster", "mainnet").gt("signature", undefined),
          )
          .first(),
        ctx.db
          .query("usage")
          .withIndex("by_account_status_time", (q) =>
            q.eq("account", account).eq("status", "complete").gt("_creationTime", since),
          )
          .first(),
      ]);
      return { funded: Boolean(deposit), active: Boolean(request) };
    };
    if (!flag && !funded && active === undefined && sort === "recent") {
      const result = await rows.paginate({ ...args.page, numItems: 30 });
      return {
        page: await Promise.all(
          result.page.map(async (row) => ({
            ...customerDoc(row),
            flags: await flagNames(ctx, row._id),
            ...(await signals(row._id)),
          })),
        ),
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      };
    }
    // Filtered and sorted scans cap at 200 recent candidates and skip cursor paging.
    const enriched = await Promise.all(
      (await rows.take(200)).map(async (row) => {
        const [flags, signal] = await Promise.all([flagNames(ctx, row._id), signals(row._id)]);
        return { row, flags, ...signal };
      }),
    );
    const matches = enriched.filter(
      (entry) =>
        (!flag || entry.flags.includes(flag)) &&
        (!funded || (funded === "funded") === entry.funded) &&
        (active === undefined || entry.active === active),
    );
    const scored = await Promise.all(
      matches.map(async (entry) => ({
        ...entry,
        score:
          sort === "balance"
            ? entry.row.balance
            : sort === "spend"
              ? (
                  await ctx.db
                    .query("usage")
                    .withIndex("by_account_status_time", (q) =>
                      q.eq("account", entry.row._id).eq("status", "complete"),
                    )
                    .collect()
                ).reduce((sum, usage) => sum + usage.cost, 0)
              : 0,
      })),
    );
    if (sort !== "recent") scored.sort((a, b) => b.score - a.score);
    return {
      page: scored.slice(0, Math.min(args.page.numItems, 30)).map((entry) => ({
        ...customerDoc(entry.row),
        flags: entry.flags,
        funded: entry.funded,
        active: entry.active,
      })),
      isDone: true,
      continueCursor: "",
    };
  },
});

export const tickets = query({
  args: { ...auth, state: filter, search: v.optional(v.string()), page: paginationOptsValidator },
  returns: v.object({ page: v.array(support), ...paging }),
  handler: async (ctx, args) => {
    await requireOperator(ctx, args, "support");
    const selected = args.state;
    const rows =
      selected === "all"
        ? ctx.db.query("tickets")
        : selected === "open"
          ? ctx.db.query("tickets").withIndex("by_state", (q) => q.eq("state", undefined))
          : ctx.db.query("tickets").withIndex("by_state", (q) => q.eq("state", selected));
    const search = args.search?.trim().toLowerCase().slice(0, 80) ?? "";
    if (search) {
      const matches = (await rows.order("desc").take(300)).filter((row) =>
        (row.topic + " " + row.email + " " + row.message).toLowerCase().includes(search),
      );
      return {
        page: await Promise.all(matches.slice(0, 25).map((row) => ticketDoc(ctx, row))),
        isDone: true,
        continueCursor: "",
      };
    }
    const result = await rows.order("desc").paginate({ ...args.page, numItems: 25 });
    return {
      page: await Promise.all(result.page.map((row) => ticketDoc(ctx, row))),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const ticketThread = query({
  args: { ...auth, id: v.id("tickets") },
  returns: v.union(
    v.null(),
    v.object({
      ...supportFields,
      customer: v.object({
        wallet: v.string(),
        name: v.string(),
        username: v.optional(v.string()),
      }),
      replies: v.array(reply),
    }),
  ),
  handler: async (ctx, args) => {
    await requireOperator(ctx, args, "support");
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    const [account, replies] = await Promise.all([
      ctx.db.get(row.account),
      ctx.db
        .query("ticketReplies")
        .withIndex("by_ticket", (q) => q.eq("ticket", row._id))
        .order("desc")
        .take(50),
    ]);
    return {
      ...(await ticketDoc(ctx, row)),
      customer: {
        wallet: account?.wallet ?? "",
        name: account?.name ?? "",
        username: account?.username,
      },
      replies: await Promise.all(replies.map((item) => replyDoc(ctx, item))),
    };
  },
});

export const navBadges = query({
  args: { ...auth },
  returns: v.object({ openTickets: v.number(), overdueTasks: v.number() }),
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args);
    const [open, inProgress, tasks] = await Promise.all([
      ctx.db
        .query("tickets")
        .withIndex("by_state", (q) => q.eq("state", undefined))
        .collect(),
      ctx.db
        .query("tickets")
        .withIndex("by_state", (q) => q.eq("state", "in_progress"))
        .collect(),
      ctx.db
        .query("crmTasks")
        .withIndex("by_assignee_done", (q) => q.eq("assignee", account._id).eq("doneAt", undefined))
        .collect(),
    ]);
    const now = Date.now();
    return {
      openTickets: open.length + inProgress.length,
      overdueTasks: tasks.filter((task) => task.dueAt !== undefined && task.dueAt < now).length,
    };
  },
});

export const traces = query({
  args: {
    ...auth,
    status: traceFilter,
    search: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    since: v.optional(v.number()),
    page: paginationOptsValidator,
  },
  returns: v.object({ page: v.array(trace), ...paging }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const search = args.search.trim().slice(0, 80);
    const selected = args.status;
    const model = args.model?.trim().slice(0, 60) || undefined;
    const provider = args.provider?.trim().slice(0, 20) || undefined;
    const since = args.since;
    const matches = (row: Doc<"usage">) =>
      (!model || row.model === model) &&
      (!provider || (row.provider ?? "near-ai") === provider) &&
      (since === undefined || row._creationTime >= since);
    if (search) {
      const id = ctx.db.normalizeId("usage", search);
      const match = id
        ? await ctx.db.get(id)
        : await ctx.db
            .query("usage")
            .withIndex("by_provider_request", (q) => q.eq("providerRequest", search))
            .first();
      const hit =
        match && (selected === "all" || selected === match.status) && matches(match) ? match : null;
      return {
        page: hit ? await traceWalletPage(ctx, [hit]) : [],
        isDone: true,
        continueCursor: "",
      };
    }
    const rows =
      selected === "all"
        ? ctx.db.query("usage")
        : ctx.db.query("usage").withIndex("by_status", (q) => q.eq("status", selected));
    if (!model && !provider && since === undefined) {
      const result = await rows.order("desc").paginate({ ...args.page, numItems: 30 });
      return {
        page: await traceWalletPage(ctx, result.page),
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      };
    }
    // Filtered scans cap at 200 recent candidates and skip cursor paging.
    const page = (await rows.order("desc").take(200))
      .filter(matches)
      .slice(0, Math.min(args.page.numItems, 30));
    return { page: await traceWalletPage(ctx, page), isDone: true, continueCursor: "" };
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
      suspended: v.boolean(),
      flags: v.array(v.string()),
      adjustments: v.array(
        v.object({
          id: v.id("balanceAdjustments"),
          time: v.number(),
          delta: v.number(),
          reason: v.string(),
          balanceAfter: v.number(),
          adminWallet: v.string(),
        }),
      ),
      keys: v.array(apiKey),
      activity: v.array(
        v.object({
          id: v.id("crmEvents"),
          time: v.number(),
          actor: v.string(),
          kind: v.string(),
          note: v.string(),
        }),
      ),
      tasks: v.array(
        v.object({
          id: v.id("crmTasks"),
          title: v.string(),
          dueAt: v.optional(v.number()),
          doneAt: v.optional(v.number()),
          assignee: v.string(),
          creator: v.string(),
          created: v.number(),
        }),
      ),
      timeline: v.array(timelineItem),
      stats: customerStats,
      referrals: v.array(referral),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const account = await ctx.db.get(args.id);
    if (!account) return null;
    const [
      inviter,
      deposits,
      usageRows,
      tickets,
      notes,
      events,
      referred,
      keys,
      conversion,
      flagRows,
      adjustmentRows,
      followUps,
    ] = await Promise.all([
      account.invitedBy ? ctx.db.get(account.invitedBy) : null,
      ctx.db
        .query("deposits")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(500),
      ctx.db
        .query("usage")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(5000),
      ctx.db
        .query("tickets")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(12),
      ctx.db
        .query("crmEvents")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(40),
      ctx.db
        .query("accountEvents")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(40),
      ctx.db
        .query("accounts")
        .withIndex("by_inviter", (q) => q.eq("invitedBy", account._id))
        .collect(),
      ctx.db
        .query("keys")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(25),
      firstConversion(ctx, account._id),
      ctx.db
        .query("accountFlags")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .take(24),
      ctx.db
        .query("balanceAdjustments")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(12),
      ctx.db
        .query("crmTasks")
        .withIndex("by_account", (q) => q.eq("account", account._id))
        .order("desc")
        .take(20),
    ]);
    const noteRows = await Promise.all(
      notes.map(async (row) => ({
        id: row._id,
        time: row._creationTime,
        actor: (await ctx.db.get(row.admin))?.wallet ?? "Unavailable",
        kind: row.kind,
        note: row.note,
      })),
    );
    const timeline = [
      ...events.map((row) => ({
        id: row._id,
        time: row._creationTime,
        kind: row.kind,
        actor: row.actor,
        summary: row.summary,
        note: undefined,
      })),
      ...noteRows.map((row) => ({
        id: row.id,
        time: row.time,
        kind: row.kind,
        actor: row.actor,
        summary: undefined,
        note: row.note,
      })),
    ]
      .sort((a, b) => b.time - a.time)
      .slice(0, 40);
    return {
      customer: customerDoc(account),
      ...conversion,
      acceptedTerms: account.termsVersion,
      acceptedAt: account.termsAcceptedAt,
      inviter: inviter ? customerDoc(inviter) : undefined,
      deposits: deposits.slice(0, 12).map((row) => ({
        id: row._id,
        time: row.finalizedAt ?? row._creationTime,
        amount: row.amount,
        cluster: row.cluster,
        reference: row.reference,
        signature: row.signature,
      })),
      traces: usageRows.slice(0, 12).map((row) => traceDoc(row, account.wallet)),
      tickets: await Promise.all(tickets.map((row) => ticketDoc(ctx, row))),
      suspended: flagRows.some((row) => row.flag === "suspended"),
      flags: flagRows.map((row) => row.flag),
      adjustments: await Promise.all(
        adjustmentRows.map(async (row) => ({
          id: row._id,
          time: row._creationTime,
          delta: row.delta,
          reason: row.reason,
          balanceAfter: row.balanceAfter,
          adminWallet: (await ctx.db.get(row.admin))?.wallet ?? "Unavailable",
        })),
      ),
      keys: keys.map((row) => ({
        id: row._id,
        name: row.name,
        prefix: row.prefix,
        revoked: row.revoked,
        lastUsed: row.lastUsed,
      })),
      activity: noteRows.slice(0, 20),
      tasks: await Promise.all(followUps.map((row) => taskDoc(ctx, row))),
      timeline,
      stats: {
        totalDeposits: deposits
          .filter((row) => row.finalizedAt !== undefined)
          .reduce((sum, row) => sum + row.amount, 0),
        totalSpend: usageRows
          .filter((row) => row.status === "complete")
          .reduce((sum, row) => sum + row.cost, 0),
        requestCount: usageRows.length,
        lastActiveAt: usageRows[0]?._creationTime,
        referredCount: referred.length,
      },
      referrals: await Promise.all(
        referred
          .sort((a, b) => b._creationTime - a._creationTime)
          .slice(0, 10)
          .map(async (row) => ({
            id: row._id,
            wallet: row.wallet,
            username: row.username,
            joined: row._creationTime,
            ...(await firstConversion(ctx, row._id)),
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
    const account = await ctx.db.get(args.account);
    if (!account) throw new ConvexError("Account unavailable.");
    await ctx.db.insert("crmEvents", { admin: admin._id, account: args.account, kind: "note", note });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "crm.note",
      targetKind: "account",
      targetId: args.account,
      summary: "Note added to " + account.wallet,
    });
    return null;
  },
});

export const updateTicket = mutation({
  args: {
    ...auth,
    id: v.id("tickets"),
    state,
    assignment: v.union(v.literal("keep"), v.literal("claim"), v.literal("unassign"), v.literal("assign")),
    assignTo: v.optional(v.id("accounts")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireOperator(ctx, args, "support");
    const ticket = await ctx.db.get(args.id);
    if (!ticket) throw new ConvexError("Support request unavailable.");
    const old = ticket.state ?? "open";
    let assignedTo = args.assignment === "keep" ? ticket.assignedTo : undefined;
    let assigneeWallet: string | undefined;
    if (args.assignment === "claim") {
      assignedTo = admin._id;
      assigneeWallet = admin.wallet;
    } else if (args.assignment === "assign") {
      if (!args.assignTo) throw new ConvexError("Choose an operator for this request.");
      const target = await ctx.db.get(args.assignTo);
      const role = target ? walletRole(target.wallet) : "member";
      if (!target || (role !== "admin" && role !== "support"))
        throw new ConvexError("Requests can only be assigned to admin or support operators.");
      assignedTo = target._id;
      assigneeWallet = target.wallet;
    }
    if (old === args.state && assignedTo === ticket.assignedTo) return null;
    await ctx.db.patch(ticket._id, {
      state: args.state === "open" ? undefined : args.state,
      assignedTo,
      updatedAt: Date.now(),
    });
    const assignment =
      assignedTo === ticket.assignedTo
        ? ""
        : assignedTo
          ? ". Assigned to " + assigneeWallet + "."
          : ". Unassigned.";
    await ctx.db.insert("crmEvents", {
      account: ticket.account,
      admin: admin._id,
      ticket: ticket._id,
      kind: "ticket",
      note: "Support status changed from " + old + " to " + args.state + assignment,
    });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "crm.ticket",
      targetKind: "ticket",
      targetId: args.id,
      summary: "Ticket " + args.id + " -> " + args.state,
    });
    return null;
  },
});

export const replyTicket = mutation({
  args: {
    ...auth,
    id: v.id("tickets"),
    body: v.string(),
    visibility: v.union(v.literal("public"), v.literal("internal")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireOperator(ctx, args, "support");
    const ticket = await ctx.db.get(args.id);
    if (!ticket) throw new ConvexError("Support request unavailable.");
    const body = args.body.trim();
    if (!body || body.length > 4000) throw new ConvexError("Write a reply of up to 4,000 characters.");
    const now = Date.now();
    await ctx.db.insert("ticketReplies", {
      ticket: ticket._id,
      author: admin._id,
      visibility: args.visibility,
      body,
    });
    await ctx.db.patch(
      ticket._id,
      ticket.state === undefined ? { updatedAt: now, state: "in_progress" as const } : { updatedAt: now },
    );
    await ctx.db.insert("crmEvents", {
      account: ticket.account,
      admin: admin._id,
      ticket: ticket._id,
      kind: "reply",
      note:
        (args.visibility === "public" ? "Replied to customer" : "Internal reply") + ": " + body.slice(0, 120),
    });
    await recordEvent(ctx, {
      account: ticket.account,
      kind: "support",
      actor: admin.wallet,
      summary: "Support reply on: " + ticket.topic,
    });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "crm.reply",
      targetKind: "tickets",
      targetId: ticket._id,
      summary: (args.visibility === "public" ? "Public" : "Internal") + " reply on: " + ticket.topic,
    });
    return null;
  },
});

export const activation = query({
  args: auth,
  returns: v.object({
    joined: v.number(),
    accepted: v.number(),
    finishedSetup: v.number(),
    startedFunding: v.number(),
    funded: v.number(),
    active: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const since = Date.now() - 14 * 86_400_000;
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
      .order("desc")
      .take(201);
    const cohort = accounts.slice(0, 200);
    const milestones = await Promise.all(
      cohort.map(async (row) => {
        const [deposit, conversion] = await Promise.all([
          ctx.db
            .query("deposits")
            .withIndex("by_account_cluster_signature", (q) =>
              q.eq("account", row._id).eq("cluster", "mainnet"),
            )
            .first(),
          firstConversion(ctx, row._id),
        ]);
        return { payment: Boolean(deposit), ...conversion };
      }),
    );
    return {
      joined: cohort.length,
      accepted: cohort.filter((row) => row.termsVersion === termsVersion).length,
      finishedSetup: cohort.filter(({ onboarding }) => onboarding === "fund" || onboarding === "later")
        .length,
      startedFunding: milestones.filter(({ payment }) => payment).length,
      funded: milestones.filter(({ funded }) => funded).length,
      active: milestones.filter(({ active }) => active).length,
      capped: accounts.length > 200,
    };
  },
});

function flagSlug(value: string) {
  const flag = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(flag))
    throw new ConvexError("Flags are slugs of up to 24 lowercase letters, digits, and dashes.");
  return flag;
}

export const setFlag = mutation({
  args: { ...auth, account: v.id("accounts"), flag: v.string(), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const flag = flagSlug(args.flag);
    const note = args.note?.trim().slice(0, 500) || undefined;
    if (!(await ctx.db.get(args.account))) throw new ConvexError("Account unavailable.");
    const existing = await ctx.db
      .query("accountFlags")
      .withIndex("by_account_flag", (q) => q.eq("account", args.account).eq("flag", flag))
      .first();
    if (existing) {
      if (existing.note === note) return null;
      await ctx.db.patch(existing._id, { note, admin: admin._id });
    } else {
      await ctx.db.insert("accountFlags", { account: args.account, flag, note, admin: admin._id });
    }
    await recordAudit(ctx, {
      actor: admin._id,
      action: "crm.flag",
      targetKind: "account",
      targetId: args.account,
      summary: "Flag '" + flag + "' set" + (note ? ": " + note : ""),
    });
    await ctx.db.insert("crmEvents", {
      admin: admin._id,
      account: args.account,
      kind: "flag",
      note: "Flag '" + flag + "' added",
    });
    return null;
  },
});

export const removeFlag = mutation({
  args: { ...auth, account: v.id("accounts"), flag: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const flag = flagSlug(args.flag);
    const rows = await ctx.db
      .query("accountFlags")
      .withIndex("by_account_flag", (q) => q.eq("account", args.account).eq("flag", flag))
      .collect();
    if (!rows.length) return null;
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    await recordAudit(ctx, {
      actor: admin._id,
      action: "crm.unflag",
      targetKind: "account",
      targetId: args.account,
      summary: "Flag '" + flag + "' removed",
    });
    await ctx.db.insert("crmEvents", {
      admin: admin._id,
      account: args.account,
      kind: "flag",
      note: "Flag '" + flag + "' removed",
    });
    return null;
  },
});

export const customerFlags = query({
  args: { ...auth, account: v.id("accounts") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    return await flagNames(ctx, args.account);
  },
});

export const knownFlags = query({
  args: auth,
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const rows = await ctx.db.query("accountFlags").withIndex("by_flag").take(200);
    return [...new Set(rows.map((row) => row.flag))];
  },
});

export const saveSegment = mutation({
  args: { ...auth, name: v.string(), definition: v.string() },
  returns: v.id("savedSegments"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const name = args.name.trim();
    if (!name || name.length > 40) throw new ConvexError("Name the view in 40 characters or fewer.");
    const definition = args.definition.trim();
    if (definition.length > 2000) throw new ConvexError("The saved view definition is too large.");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(definition);
    } catch {
      throw new ConvexError("The saved view definition must be JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new ConvexError("The saved view definition must be a JSON object.");
    const { search, flag, funded, active } = parsed;
    if (
      (search !== undefined && typeof search !== "string") ||
      (flag !== undefined && typeof flag !== "string") ||
      (funded !== undefined && funded !== "any" && funded !== "funded" && funded !== "unfunded") ||
      (active !== undefined && typeof active !== "boolean")
    )
      throw new ConvexError("Saved views only describe search, flag, funded, and active filters.");
    return await ctx.db.insert("savedSegments", { admin: admin._id, name, definition });
  },
});

export const listSegments = query({
  args: auth,
  returns: v.array(v.object({ id: v.id("savedSegments"), name: v.string(), definition: v.string() })),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const rows = await ctx.db
      .query("savedSegments")
      .withIndex("by_admin", (q) => q.eq("admin", admin._id))
      .order("desc")
      .take(100);
    return rows.map((row) => ({ id: row._id, name: row.name, definition: row.definition }));
  },
});

export const deleteSegment = mutation({
  args: { ...auth, id: v.id("savedSegments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const row = await ctx.db.get(args.id);
    if (!row || row.admin !== admin._id) throw new ConvexError("Saved view unavailable.");
    await ctx.db.delete(row._id);
    return null;
  },
});
