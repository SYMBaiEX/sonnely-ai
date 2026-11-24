import { normalizeUsername, usernameHelp, usernamePattern } from "../lib/username";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";

import { guardProvider } from "./launchGuard";
import { creditDeposit, settleUsage } from "./ledger";
import { recordEvent } from "./events";
import { gatewayDetails } from "./usageMaxOutboxValidators";
import { termsVersion } from "../lib/policy";
import { creditDecimal } from "../lib/credit-amount";
import {
  accountFor,
  accountRole,
  auth,
  requireAccount,
  secret,
  service,
  sessionLife,
  walletRole,
} from "./access";

const optionalNumber = v.union(v.number(), v.null());

export const signIn = mutation({
  args: {
    ...auth,
    wallet: v.string(),
    nonce: v.string(),
    expires: v.number(),
    referral: v.string(),
    invite: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const now = Date.now();
    const consumed = await ctx.db
      .query("consumedChallenges")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (consumed || args.expires < now) throw new ConvexError("This sign-in expired or was already used.");
    await ctx.db.insert("consumedChallenges", { nonce: args.nonce, expires: args.expires });
    const expired = await ctx.db
      .query("consumedChallenges")
      .withIndex("by_expiry", (q) => q.lt("expires", now))
      .take(8);
    for (const row of expired) await ctx.db.delete(row._id);
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_wallet", (q) => q.eq("wallet", args.wallet))
      .unique();
    const invite = args.invite;
    const inviter = invite
      ? await ctx.db
          .query("accounts")
          .withIndex("by_referral", (q) => q.eq("referral", invite))
          .unique()
      : null;
    const account =
      existing?._id ??
      (await ctx.db.insert("accounts", {
        wallet: args.wallet,
        name: "",
        onboarding: "pending",
        balance: 0,
        referral: args.referral,
        invitedBy: inviter?._id,
      }));
    await ctx.db.insert("sessions", { hash: args.session, account, expires: now + sessionLife });
    await recordEvent(ctx, {
      account,
      kind: "session",
      actor: args.wallet,
      summary: "Signed in with Solana wallet",
    });
    return null;
  },
});

export const signOut = mutation({
  args: auth,
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_hash", (q) => q.eq("hash", args.session))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const profile = query({
  args: auth,
  returns: v.union(
    v.null(),
    v.object({
      wallet: v.string(),
      name: v.string(),
      username: v.optional(v.string()),
      balance: v.number(),
      referral: v.string(),
      acceptedTerms: v.optional(v.string()),
      onboarding: v.optional(v.union(v.literal("pending"), v.literal("fund"), v.literal("later"))),
      role: accountRole,
    }),
  ),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await accountFor(ctx, args.session);
    if (!account) return null;
    const { wallet, name, balance, referral } = account;
    return {
      wallet,
      name,
      username: account.username,
      balance,
      referral,
      acceptedTerms: account.termsVersion,
      onboarding: account.onboarding,
      role: walletRole(wallet),
    };
  },
});

export const acceptTerms = mutation({
  args: { ...auth, version: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    if (args.version !== termsVersion) throw new ConvexError("Refresh to review the current terms.");
    if (account.termsVersion !== termsVersion) {
      await ctx.db.patch(account._id, { termsVersion, termsAcceptedAt: Date.now() });
      await recordEvent(ctx, {
        account: account._id,
        kind: "terms",
        actor: account.wallet,
        summary: `Accepted terms v${args.version}`,
      });
    }
    return null;
  },
});

export const finishOnboarding = mutation({
  args: { ...auth, funding: v.union(v.literal("fund"), v.literal("later")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    if (account.onboarding === "pending") {
      await ctx.db.patch(account._id, { onboarding: args.funding });
      await recordEvent(ctx, {
        account: account._id,
        kind: "onboarding",
        actor: account.wallet,
        summary: `Workspace setup: ${args.funding}`,
      });
    }
    return null;
  },
});

export const rename = mutation({
  args: { ...auth, name: v.string(), username: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const requested =
      args.username === undefined ? account.username : normalizeUsername(args.username) || undefined;
    if (requested) {
      if (!usernamePattern.test(requested)) throw new ConvexError(usernameHelp);
      const owner = await ctx.db
        .query("accounts")
        .withIndex("by_username", (q) => q.eq("username", requested))
        .unique();
      if (owner && owner._id !== account._id) throw new ConvexError("That username is already taken.");
    }
    await ctx.db.patch(account._id, { name: args.name, username: requested });
    await recordEvent(ctx, {
      account: account._id,
      kind: "profile",
      actor: account.wallet,
      summary: "Profile updated",
    });
    return null;
  },
});

export const listKeys = query({
  args: auth,
  returns: v.array(
    v.object({
      id: v.id("keys"),
      created: v.number(),
      name: v.string(),
      prefix: v.string(),
      cap: optionalNumber,
      dailyCap: optionalNumber,
      expires: optionalNumber,
      revoked: v.boolean(),
      lastUsed: v.optional(v.number()),
      todaySpent: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const keys = await ctx.db
      .query("keys")
      .withIndex("by_account", (q) => q.eq("account", account._id))
      .order("desc")
      .take(100);
    const today = new Date().toISOString().slice(0, 10);
    return Promise.all(
      keys.map(async ({ _id, _creationTime, name, prefix, cap, dailyCap, expires, revoked, lastUsed }) => ({
        id: _id,
        created: _creationTime,
        name,
        prefix,
        cap,
        dailyCap,
        expires,
        revoked,
        lastUsed,
        todaySpent:
          (
            await ctx.db
              .query("keyDays")
              .withIndex("by_key_day", (q) => q.eq("key", _id).eq("day", today))
              .unique()
          )?.spent ?? 0,
      })),
    );
  },
});

export const createKey = mutation({
  args: {
    ...auth,
    name: v.string(),
    prefix: v.string(),
    hash: v.string(),
    cap: optionalNumber,
    dailyCap: optionalNumber,
    expires: optionalNumber,
  },
  returns: v.null(),
  handler: async (ctx, { secret: credential, session, ...fields }) => {
    service(credential);
    const account = await requireAccount(ctx, session);
    const recent = await ctx.db
      .query("keys")
      .withIndex("by_account", (q) => q.eq("account", account._id).gte("_creationTime", Date.now() - 60_000))
      .take(5);
    if (recent.length >= 5) throw new ConvexError("Wait a minute before creating another key.");
    await ctx.db.insert("keys", { ...fields, account: account._id, revoked: false, lifetime: 0 });
    await recordEvent(ctx, {
      account: account._id,
      kind: "key",
      actor: account.wallet,
      summary: `Created API key ${fields.name.slice(0, 80)}`,
    });
    return null;
  },
});

export const revokeKey = mutation({
  args: { ...auth, id: v.id("keys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const key = await ctx.db.get(args.id);
    if (!key || key.account !== account._id) throw new ConvexError("Key unavailable.");
    await ctx.db.patch(key._id, { revoked: true });
    await recordEvent(ctx, {
      account: account._id,
      kind: "key",
      actor: account.wallet,
      summary: `Revoked API key ${key.name.slice(0, 80)}`,
    });
    return null;
  },
});

const usageRow = v.object({
  id: v.id("usage"),
  time: v.number(),
  keyName: v.string(),
  model: v.string(),
  provider: v.union(v.literal("near-ai"), v.literal("phala"), v.literal("tinfoil")),
  input: v.number(),
  output: v.number(),
  cost: v.number(),
  status: v.string(),
});

async function usageRows(ctx: QueryCtx, account: Id<"accounts">, since: number) {
  const rows = await ctx.db
    .query("usage")
    .withIndex("by_account", (q) => q.eq("account", account).gte("_creationTime", since))
    .order("desc")
    .take(1000);
  return rows.map(({ _id, _creationTime, keyName, model, provider, input, output, cost, status }) => ({
    id: _id,
    time: _creationTime,
    keyName,
    model,
    provider: provider ?? ("near-ai" as const),
    input,
    output,
    cost,
    status,
  }));
}

export const usage = query({
  args: { ...auth, since: v.number() },
  returns: v.array(usageRow),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    return usageRows(ctx, account._id, args.since);
  },
});

export const consoleLive = query({
  args: { ...auth, since: v.optional(v.number()) },
  returns: v.union(v.null(), v.object({ wallet: v.string(), balance: v.number(), rows: v.array(usageRow) })),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await accountFor(ctx, args.session);
    if (!account) return null;
    const rows = args.since === undefined ? [] : await usageRows(ctx, account._id, args.since);
    return { wallet: account.wallet, balance: account.balance, rows };
  },
});

export const reserve = mutation({
  args: {
    ...secret,
    session: v.optional(v.string()),
    hash: v.optional(v.string()),
    requireTerms: v.optional(v.boolean()),
    model: v.string(),
    provider: v.optional(v.union(v.literal("phala"), v.literal("tinfoil"))),
    cost: v.number(),
    retryKey: v.optional(v.string()),
  },
  returns: v.id("usage"),
  handler: async (ctx, args) => {
    service(args.secret);
    const now = Date.now();
    const hash = args.hash;
    const key = hash
      ? await ctx.db
          .query("keys")
          .withIndex("by_hash", (q) => q.eq("hash", hash))
          .unique()
      : null;
    if (hash && (!key || key.revoked || (key.expires !== null && key.expires <= now)))
      throw new ConvexError("Invalid or expired API key.");
    const account = key ? await ctx.db.get(key.account) : await requireAccount(ctx, args.session ?? "");
    if (args.requireTerms && account?.termsVersion !== termsVersion)
      throw new ConvexError("Accept the current Sonnely terms in the console.");
    if (!account) throw new ConvexError("Invalid account.");
    const suspended = await ctx.db
      .query("accountFlags")
      .withIndex("by_account_flag", (q) => q.eq("account", account._id).eq("flag", "suspended"))
      .unique();
    if (suspended) throw new ConvexError("Inference is suspended on this account. Contact support.");
    if (args.retryKey) {
      const retryKey = args.retryKey;
      const previous = await ctx.db
        .query("usage")
        .withIndex("by_account_retryKey", (q) => q.eq("account", account._id).eq("retryKey", retryKey))
        .unique();
      if (previous) throw new ConvexError({ code: "duplicate_request", reference: previous._id });
    }
    if (!Number.isSafeInteger(args.cost) || args.cost < 0) throw new ConvexError("Invalid reservation.");
    if (account.balance < args.cost) throw new ConvexError("Insufficient compute credits.");
    const recent = await ctx.db
      .query("usage")
      .withIndex("by_account", (q) => q.eq("account", account._id).gte("_creationTime", now - 60_000))
      .take(15);
    if (recent.length >= 15) throw new ConvexError("Request limit reached. Try again in one minute.");
    await guardProvider(ctx, args.provider, args.cost, now);
    const day = new Date(now).toISOString().slice(0, 10);
    if (key) {
      const usage = await ctx.db
        .query("keyDays")
        .withIndex("by_key_day", (q) => q.eq("key", key._id).eq("day", day))
        .unique();
      const daily = (usage?.spent ?? 0) + args.cost;
      if (
        (key.cap !== null && key.lifetime + args.cost > key.cap) ||
        (key.dailyCap !== null && daily > key.dailyCap)
      )
        throw new ConvexError("The API key budget would be exceeded.");
      if (usage) await ctx.db.patch(usage._id, { spent: daily });
      else await ctx.db.insert("keyDays", { key: key._id, day, spent: daily });
      await ctx.db.patch(key._id, { lifetime: key.lifetime + args.cost, lastUsed: now });
    }
    await ctx.db.patch(account._id, { balance: account.balance - args.cost });
    return await ctx.db.insert("usage", {
      account: account._id,
      key: key?._id,
      keyName: key?.name ?? "Console",
      retryKey: args.retryKey,
      keyDay: key ? day : undefined,
      model: args.model,
      ...(args.provider ? { provider: args.provider } : {}),
      input: 0,
      output: 0,
      cost: args.cost,
      status: "pending",
    });
  },
});

export const settle = mutation({
  args: {
    ...secret,
    id: v.id("usage"),
    input: v.number(),
    output: v.number(),
    cost: v.number(),
    providerRequest: v.optional(v.string()),
    providerStatus: v.optional(v.number()),
    providerReportedCostNano: v.optional(v.number()),
    usageMaxDetails: v.optional(gatewayDetails),
    outcome: v.optional(v.string()),
    status: v.union(v.literal("complete"), v.literal("failed"), v.literal("unreported")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const row = await ctx.db.get(args.id);
    if (!row || row.status !== "pending") return null;
    await settleUsage(ctx, row, args);
    return null;
  },
});

export const referrals = query({
  args: auth,
  returns: v.array(v.object({ wallet: v.string(), time: v.number() })),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const rows = await ctx.db
      .query("accounts")
      .withIndex("by_inviter", (q) => q.eq("invitedBy", account._id))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      wallet: row.wallet.slice(0, 4) + "…" + row.wallet.slice(-4),
      time: row._creationTime,
    }));
  },
});

export const ticket = mutation({
  args: { ...auth, email: v.string(), topic: v.string(), message: v.string() },
  returns: v.id("tickets"),
  handler: async (ctx, { secret: credential, session, ...fields }) => {
    service(credential);
    const account = await requireAccount(ctx, session);
    const recent = await ctx.db
      .query("tickets")
      .withIndex("by_account", (q) =>
        q.eq("account", account._id).gte("_creationTime", Date.now() - 86400_000),
      )
      .take(5);
    if (recent.length >= 5) throw new ConvexError("Daily request limit reached.");
    const id = await ctx.db.insert("tickets", { account: account._id, ...fields });
    await recordEvent(ctx, {
      account: account._id,
      kind: "support",
      actor: account.wallet,
      summary: `Opened support request: ${fields.topic.slice(0, 120)}`,
    });
    return id;
  },
});

const solPayment = v.optional(
  v.object({ lamports: v.number(), expiresAt: v.number(), priceUsd: v.string() }),
);

const deposit = {
  reference: v.string(),
  recipient: v.string(),
  mint: v.string(),
  cluster: v.string(),
  amount: v.number(),
  sol: solPayment,
};
export const createDeposit = mutation({
  args: { ...auth, ...deposit },
  returns: v.null(),
  handler: async (ctx, { secret: credential, session, ...fields }) => {
    service(credential);
    const account = await requireAccount(ctx, session);
    const recent = await ctx.db
      .query("deposits")
      .withIndex("by_account", (q) => q.eq("account", account._id).gte("_creationTime", Date.now() - 60_000))
      .take(5);
    if (recent.length >= 5) throw new ConvexError("Wait a minute before opening another payment.");
    if (
      fields.sol &&
      (fields.cluster !== "mainnet" ||
        !Number.isSafeInteger(fields.sol.lamports) ||
        fields.sol.lamports <= 0 ||
        fields.sol.expiresAt <= Date.now())
    )
      throw new ConvexError("Invalid SOL payment quote.");
    await ctx.db.insert("deposits", { account: account._id, ...fields });
    await recordEvent(ctx, {
      account: account._id,
      kind: "billing",
      actor: account.wallet,
      summary: `Started ${fields.sol ? "SOL" : "USDC"} deposit $${creditDecimal(fields.amount, 2)}`,
    });
    return null;
  },
});

export const depositDetails = query({
  args: { ...auth, reference: v.string() },
  returns: v.object({ ...deposit, signature: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const row = await ctx.db
      .query("deposits")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();
    if (!row || row.account !== account._id) throw new ConvexError("Payment request unavailable.");
    const { reference, recipient, mint, cluster, amount, signature, sol } = row;
    return { reference, recipient, mint, cluster, amount, signature, sol };
  },
});

export const confirmDeposit = mutation({
  args: { ...auth, reference: v.string(), signature: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const row = await ctx.db
      .query("deposits")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();
    if (!row || row.account !== account._id) throw new ConvexError("Payment request unavailable.");
    await creditDeposit(ctx, row, account, args.signature);
    if (row.signature !== args.signature)
      await recordEvent(ctx, {
        account: account._id,
        kind: "billing",
        actor: account.wallet,
        summary: `Finalized ${row.sol ? "SOL" : "USDC"} deposit $${creditDecimal(row.amount, 2)}`,
      });
    return null;
  },
});

export const history = query({
  args: auth,
  returns: v.array(
    v.object({
      reference: v.string(),
      cluster: v.string(),
      amount: v.number(),
      signature: v.optional(v.string()),
      sol: solPayment,
      time: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_account", (q) => q.eq("account", account._id))
      .order("desc")
      .take(30);
    return rows.map(({ reference, cluster, amount, signature, sol, _creationTime }) => ({
      reference,
      cluster,
      amount,
      signature,
      sol,
      time: _creationTime,
    }));
  },
});

export const throttleQuote = mutation({
  args: auth,
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const now = Date.now();
    if (account.lastQuote && now - account.lastQuote < 5_000) {
      throw new ConvexError("Quote limit reached. Wait a few seconds.");
    }
    await ctx.db.patch(account._id, { lastQuote: now });
    return null;
  },
});

export const updateKey = mutation({
  args: {
    ...auth,
    id: v.id("keys"),
    name: v.string(),
    cap: optionalNumber,
    dailyCap: optionalNumber,
    expires: optionalNumber,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const key = await ctx.db.get(args.id);
    if (!key || key.account !== account._id || key.revoked) throw new ConvexError("Key unavailable.");
    const name = args.name.trim();
    if (!name || name.length > 60) throw new ConvexError("Name must be 1-60 characters.");
    for (const cap of [args.cap, args.dailyCap])
      if (cap !== null && (!Number.isSafeInteger(cap) || cap < 10_000))
        throw new ConvexError("Spending caps start at $0.01.");
    await ctx.db.patch(key._id, {
      name,
      cap: args.cap,
      dailyCap: args.dailyCap,
      expires: args.expires,
    });
    return null;
  },
});

export const listSessions = query({
  args: auth,
  returns: v.array(
    v.object({
      id: v.id("sessions"),
      created: v.number(),
      expires: v.number(),
      current: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    // No by_account index on sessions; a bounded filtered scan fits this small table.
    const rows = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("account"), account._id))
      .take(50);
    return rows.map(({ _id, _creationTime, hash, expires }) => ({
      id: _id,
      created: _creationTime,
      expires,
      current: hash === args.session,
    }));
  },
});

export const signOutOthers = mutation({
  args: auth,
  returns: v.number(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const rows = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("account"), account._id))
      .take(50);
    let removed = 0;
    for (const row of rows) {
      if (row.hash === args.session) continue;
      await ctx.db.delete(row._id);
      removed++;
    }
    return removed;
  },
});

export const cancelDeposit = mutation({
  args: { ...auth, reference: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const row = await ctx.db
      .query("deposits")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();
    if (!row || row.account !== account._id) throw new ConvexError("Payment request unavailable.");
    if (row.signature || row.finalizedAt !== undefined)
      throw new ConvexError("This payment is already finalized.");
    await ctx.db.delete(row._id);
    return null;
  },
});
