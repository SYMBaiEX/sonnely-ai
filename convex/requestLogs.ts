import { ConvexError, v } from "convex/values";
import { requestLogPageSize, type RequestLogRow } from "../lib/request-logs";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { auth, requireAccount, service } from "./access";
import { providerRejection, requestEndpoint, requestStatus } from "./requestLogContract";

const provider = v.union(v.literal("near-ai"), v.literal("phala"), v.literal("tinfoil"));
const requestRow = v.object({
  id: v.id("usage"),
  time: v.number(),
  keyName: v.string(),
  model: v.string(),
  provider,
  providerRejections: v.optional(v.array(providerRejection)),
  input: v.number(),
  output: v.number(),
  cost: v.number(),
  status: requestStatus,
  endpoint: v.optional(requestEndpoint),
  providerRequest: v.optional(v.string()),
  providerStatus: v.optional(v.number()),
  outcome: v.optional(v.string()),
  settledAt: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  providerDurationMs: v.optional(v.number()),
  timeToFirstTokenMs: v.optional(v.number()),
  cachedTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  stream: v.optional(v.boolean()),
});

function count(value: number | undefined) {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function elapsed(start: number | undefined, end: number | undefined) {
  if (start === undefined || end === undefined || count(start) === undefined || count(end) === undefined)
    return undefined;
  return count(end - start);
}

function toRow(row: Doc<"usage">): typeof requestRow.type & RequestLogRow {
  const details = row.usageMaxDetails;
  const timing = details?.timing;
  const startedAt = timing?.requestAt ?? row._creationTime;
  const firstToken = details?.firstTokenAt;
  return {
    id: row._id,
    time: row._creationTime,
    keyName: row.keyName,
    model: row.model,
    provider: row.provider ?? "near-ai",
    providerRejections: row.providerRejections,
    input: row.input,
    output: row.output,
    cost: row.cost,
    status: row.status,
    endpoint: row.endpoint,
    providerRequest:
      row.providerRequest && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/.test(row.providerRequest)
        ? row.providerRequest
        : undefined,
    providerStatus:
      row.providerStatus !== undefined &&
      Number.isInteger(row.providerStatus) &&
      row.providerStatus >= 100 &&
      row.providerStatus <= 599
        ? row.providerStatus
        : undefined,
    outcome: row.outcome && /^[a-z_]{1,64}$/.test(row.outcome) ? row.outcome : undefined,
    settledAt: count(row.settledAt),
    durationMs: elapsed(timing?.requestAt, timing?.settlementAt),
    providerDurationMs: elapsed(timing?.providerAt, timing?.providerDoneAt),
    timeToFirstTokenMs:
      details?.stream &&
      firstToken !== undefined &&
      firstToken <= (timing?.providerDoneAt ?? row.settledAt ?? -1)
        ? elapsed(startedAt, firstToken)
        : undefined,
    cachedTokens: count(details?.usage?.cacheReadTokens),
    reasoningTokens: count(details?.usage?.reasoningTokens),
    stream: details?.stream,
  };
}

type Filters = {
  since: number;
  provider?: typeof provider.type;
  status?: typeof requestStatus.type;
  model?: string;
  keyName?: string;
};

function indexedRows(ctx: QueryCtx, account: Id<"accounts">, filters: Filters) {
  const { keyName, model, status, provider, since } = filters;
  const usage = ctx.db.query("usage");
  if (keyName !== undefined) {
    return usage.withIndex("by_account_keyName", (q) =>
      q.eq("account", account).eq("keyName", keyName).gte("_creationTime", since),
    );
  }
  if (model !== undefined) {
    return usage.withIndex("by_account_model", (q) =>
      q.eq("account", account).eq("model", model).gte("_creationTime", since),
    );
  }
  if (status !== undefined) {
    return usage.withIndex("by_account_status_time", (q) =>
      q.eq("account", account).eq("status", status).gte("_creationTime", since),
    );
  }
  if (provider !== undefined) {
    return usage.withIndex("by_account_provider", (q) =>
      q
        .eq("account", account)
        .eq("provider", provider === "near-ai" ? undefined : provider)
        .gte("_creationTime", since),
    );
  }
  return usage.withIndex("by_account", (q) => q.eq("account", account).gte("_creationTime", since));
}

export const list = query({
  args: {
    ...auth,
    since: v.number(),
    cursor: v.union(v.string(), v.null()),
    provider: v.optional(provider),
    model: v.optional(v.string()),
    keyName: v.optional(v.string()),
    status: v.optional(requestStatus),
  },
  returns: v.object({
    wallet: v.string(),
    rows: v.array(requestRow),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const { since, cursor, provider, model, keyName, status } = args;
    if (
      count(since) === undefined ||
      (cursor !== null && (!cursor || cursor.length > 4096)) ||
      (model !== undefined && (!model.trim() || model.length > 100)) ||
      (keyName !== undefined && (!keyName.trim() || keyName.length > 60))
    )
      throw new ConvexError("Invalid request log filters.");

    const { page, continueCursor, isDone } = await indexedRows(ctx, account._id, args)
      .order("desc")
      .paginate({ cursor, numItems: requestLogPageSize });

    // Additional dimensions are evaluated inside one bounded index page.
    // The cursor follows scanned rows so empty pages can still advance.
    const rows = page.filter(
      (row) =>
        (provider === undefined || (row.provider ?? "near-ai") === provider) &&
        (model === undefined || row.model === model) &&
        (keyName === undefined || row.keyName === keyName) &&
        (status === undefined || row.status === status),
    );
    return { wallet: account.wallet, rows: rows.map(toRow), nextCursor: isDone ? null : continueCursor };
  },
});

export const details = query({
  args: { ...auth, id: v.string() },
  returns: v.union(requestRow, v.null()),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    if (args.id.length > 100) return null;
    const id = ctx.db.normalizeId("usage", args.id);
    const row = id && (await ctx.db.get(id));
    return row && row.account === account._id ? toRow(row) : null;
  },
});
