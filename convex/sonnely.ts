import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";

const secret = { secret: v.string() };
const auth = { ...secret, session: v.string() };
const optionalNumber = v.union(v.number(), v.null());
const sessionLife = 7 * 86400_000;

function service(input: string) {
  const expected = process.env.SONNELY_SERVICE_SECRET ?? process.env.RELAY_SERVICE_SECRET;
  let mismatch = 0;
  if (!expected || expected.length < 32 || input.length !== expected.length)
    throw new ConvexError("Unauthorized.");
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ input.charCodeAt(i);
  if (mismatch !== 0) throw new ConvexError("Unauthorized.");
}

async function accountFor(ctx: QueryCtx, session: string) {
  const row = await ctx.db
    .query("sessions")
    .withIndex("by_hash", (q) => q.eq("hash", session))
    .unique();
  return row && row.expires > Date.now() ? await ctx.db.get(row.account) : null;
}

async function requireAccount(ctx: QueryCtx, session: string) {
  const account = await accountFor(ctx, session);
  if (!account) throw new ConvexError("Sign in with a Solana wallet.");
  return account;
}

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
        balance: 0,
        referral: args.referral,
        invitedBy: inviter?._id,
      }));
    await ctx.db.insert("sessions", { hash: args.session, account, expires: now + sessionLife });
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
    v.object({ wallet: v.string(), name: v.string(), balance: v.number(), referral: v.string() }),
  ),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await accountFor(ctx, args.session);
    if (!account) return null;
    const { wallet, name, balance, referral } = account;
    return { wallet, name, balance, referral };
  },
});

export const rename = mutation({
  args: { ...auth, name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    await ctx.db.patch(account._id, { name: args.name });
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
    return keys.map(({ _id, _creationTime, name, prefix, cap, dailyCap, expires, revoked, lastUsed }) => ({
      id: _id,
      created: _creationTime,
      name,
      prefix,
      cap,
      dailyCap,
      expires,
      revoked,
      lastUsed,
    }));
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
    return null;
  },
});

export const usage = query({
  args: { ...auth, since: v.number() },
  returns: v.array(
    v.object({
      time: v.number(),
      keyName: v.string(),
      model: v.string(),
      input: v.number(),
      output: v.number(),
      cost: v.number(),
      status: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    service(args.secret);
    const account = await requireAccount(ctx, args.session);
    const rows = await ctx.db
      .query("usage")
      .withIndex("by_account", (q) => q.eq("account", account._id).gte("_creationTime", args.since))
      .order("desc")
      .take(1000);
    return rows.map(({ _creationTime, keyName, model, input, output, cost, status }) => ({
      time: _creationTime,
      keyName,
      model,
      input,
      output,
      cost,
      status,
    }));
  },
});

export const reserve = mutation({
  args: {
    ...secret,
    session: v.optional(v.string()),
    hash: v.optional(v.string()),
    model: v.string(),
    cost: v.number(),
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
    if (!account || account.balance < args.cost) throw new ConvexError("Insufficient compute credits.");
    const recent = await ctx.db
      .query("usage")
      .withIndex("by_account", (q) => q.eq("account", account._id).gte("_creationTime", now - 60_000))
      .take(15);
    if (recent.length >= 15) throw new ConvexError("Request limit reached. Try again in one minute.");
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
      keyDay: key ? day : undefined,
      model: args.model,
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
    status: v.union(v.literal("complete"), v.literal("failed"), v.literal("unreported")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    service(args.secret);
    const row = await ctx.db.get(args.id);
    if (!row || row.status !== "pending") return null;
    const cost = args.status === "unreported" ? row.cost : Math.min(row.cost, args.cost);
    const refund = row.cost - cost;
    const account = await ctx.db.get(row.account);
    if (account) await ctx.db.patch(account._id, { balance: account.balance + refund });
    if (row.key) {
      const key = await ctx.db.get(row.key);
      const day = row.keyDay ?? new Date(row._creationTime).toISOString().slice(0, 10);
      if (key) {
        const daily = await ctx.db
          .query("keyDays")
          .withIndex("by_key_day", (q) => q.eq("key", key._id).eq("day", day))
          .unique();
        if (daily) await ctx.db.patch(daily._id, { spent: daily.spent - refund });
        await ctx.db.patch(key._id, { lifetime: key.lifetime - refund });
      }
    }
    await ctx.db.patch(row._id, { input: args.input, output: args.output, cost, status: args.status });
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
    return await ctx.db.insert("tickets", { account: account._id, ...fields });
  },
});

const deposit = {
  reference: v.string(),
  recipient: v.string(),
  mint: v.string(),
  cluster: v.string(),
  amount: v.number(),
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
    await ctx.db.insert("deposits", { account: account._id, ...fields });
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
    const { reference, recipient, mint, cluster, amount, signature } = row;
    return { reference, recipient, mint, cluster, amount, signature };
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
    if (row.signature === args.signature) return null;
    const used = await ctx.db
      .query("deposits")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .unique();
    if (used || row.signature) throw new ConvexError("Payment already recorded.");
    await ctx.db.patch(row._id, { signature: args.signature });
    if (row.cluster === "mainnet") await ctx.db.patch(account._id, { balance: account.balance + row.amount });
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
    return rows.map(({ reference, cluster, amount, signature, _creationTime }) => ({
      reference,
      cluster,
      amount,
      signature,
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
