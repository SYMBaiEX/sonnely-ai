import { ConvexError, v } from "convex/values";
import { confidentialPaymentHoldMs, confidentialUsdcMint } from "../lib/confidential-payment-types";
import { creditBalance } from "../lib/credit-amount";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { auth, requireAccount, requireAdmin, requireRecentAdmin, service } from "./access";
import { recordAudit, recordEvent } from "./events";
import { assertDepositReferenceUnused, assertDepositSignatureUnused, base58Bytes } from "./ledger";

const reviewReason = v.union(
  v.literal("details-encrypted"),
  v.literal("amount-mismatch"),
  v.literal("asset-mismatch"),
);
const orderView = v.object({
  reference: v.string(),
  payer: v.string(),
  treasury: v.string(),
  cluster: v.literal("mainnet"),
  mint: v.literal(confidentialUsdcMint),
  amount: v.number(),
  status: v.union(
    v.literal("awaiting_payment"),
    v.literal("under_review"),
    v.literal("credited"),
    v.literal("rejected"),
    v.literal("cancelled"),
    v.literal("expired"),
  ),
  createdAt: v.number(),
  expiresAt: v.number(),
  cancelledAt: v.optional(v.number()),
  signature: v.optional(v.string()),
  slot: v.optional(v.number()),
  blockTime: v.optional(v.number()),
  submittedAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),
  reason: v.optional(v.string()),
  reviewReason: v.optional(reviewReason),
});

type Order = Doc<"confidentialPaymentOrders">;

function view(row: Order): typeof orderView.type {
  const { _id, _creationTime, account, ...payment } = row;
  return { ...payment, createdAt: _creationTime, cluster: "mainnet", mint: confidentialUsdcMint };
}

function member(ctx: QueryCtx, args: { secret: string; session: string }) {
  service(args.secret);
  return requireAccount(ctx, args.session);
}

function awaitingPayment(ctx: QueryCtx, account: Doc<"accounts">["_id"]) {
  return ctx.db
    .query("confidentialPaymentOrders")
    .withIndex("by_account_and_status", (q) => q.eq("account", account).eq("status", "awaiting_payment"))
    .unique();
}

async function byReference(ctx: QueryCtx, reference: string) {
  if (!base58Bytes(reference, 32)) throw new ConvexError("Invalid confidential payment reference.");
  const row = await ctx.db
    .query("confidentialPaymentOrders")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .unique();
  if (!row) throw new ConvexError("Confidential payment order unavailable.");
  return row;
}

async function accountOrder(ctx: QueryCtx, account: Doc<"accounts">, reference: string) {
  const row = await byReference(ctx, reference);
  if (row.account !== account._id || row.payer !== account.wallet)
    throw new ConvexError("Confidential payment order unavailable.");
  return row;
}

export const active = query({
  args: auth,
  returns: v.union(v.null(), orderView),
  handler: async (ctx, args) => {
    const account = await member(ctx, args);
    const row =
      (await awaitingPayment(ctx, account._id)) ??
      (await ctx.db
        .query("confidentialPaymentOrders")
        .withIndex("by_account_and_status", (q) => q.eq("account", account._id).eq("status", "under_review"))
        .order("desc")
        .first());
    return row ? view(row) : null;
  },
});

export const details = query({
  args: { ...auth, reference: v.string() },
  returns: orderView,
  handler: async (ctx, args) => view(await accountOrder(ctx, await member(ctx, args), args.reference)),
});

export const history = query({
  args: auth,
  returns: v.array(orderView),
  handler: async (ctx, args) => {
    const account = await member(ctx, args);
    const rows = await ctx.db
      .query("confidentialPaymentOrders")
      .withIndex("by_account", (q) => q.eq("account", account._id))
      .order("desc")
      .take(30);
    return rows.map(view);
  },
});

export const open = mutation({
  args: { ...auth, reference: v.string(), treasury: v.string(), amount: v.number() },
  returns: orderView,
  handler: async (ctx, args) => {
    const account = await member(ctx, args);
    const { reference, treasury, amount } = args;
    if (
      !base58Bytes(treasury, 32) ||
      !base58Bytes(account.wallet, 32) ||
      treasury !== process.env.SONNELY_TREASURY_WALLET ||
      treasury === account.wallet
    )
      throw new ConvexError("Confidential payment treasury is unavailable for this wallet.");
    if (!base58Bytes(reference, 32)) throw new ConvexError("Invalid confidential payment reference.");
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(account.balance + amount))
      throw new ConvexError("Invalid confidential payment amount.");

    const now = Date.now();
    const existing = await awaitingPayment(ctx, account._id);
    if (existing && existing.expiresAt > now) {
      if (existing.treasury !== treasury || existing.amount !== amount)
        throw new ConvexError("Finish or cancel the existing confidential payment before opening another.");
      return view(existing);
    }
    if (existing) await ctx.db.patch(existing._id, { status: "expired" });
    await assertDepositReferenceUnused(ctx, reference);
    const id = await ctx.db.insert("confidentialPaymentOrders", {
      account: account._id,
      payer: account.wallet,
      treasury,
      reference,
      amount,
      status: "awaiting_payment",
      expiresAt: now + confidentialPaymentHoldMs,
    });
    const row = await ctx.db.get(id);
    if (!row) throw new ConvexError("Confidential payment order unavailable.");
    return view(row);
  },
});

export const cancel = mutation({
  args: { ...auth, reference: v.string() },
  returns: orderView,
  handler: async (ctx, args) => {
    const row = await accountOrder(ctx, await member(ctx, args), args.reference);
    if (row.status === "cancelled" || row.status === "expired") return view(row);
    if (row.status !== "awaiting_payment")
      throw new ConvexError("A submitted confidential payment cannot be cancelled.");
    const cancelledAt = Date.now();
    const patch =
      cancelledAt >= row.expiresAt
        ? { status: "expired" as const }
        : { status: "cancelled" as const, cancelledAt };
    await ctx.db.patch(row._id, patch);
    return view({ ...row, ...patch });
  },
});

async function credit(ctx: MutationCtx, row: Order, account: Doc<"accounts">) {
  const balance = account.balance + row.amount;
  if (!Number.isSafeInteger(balance)) throw new ConvexError("The payment exceeds the credit balance limit.");
  const settled = { status: "credited", resolvedAt: Date.now(), reviewReason: undefined } as const;
  await ctx.db.patch(row._id, settled);
  await ctx.db.patch(account._id, { balance });
  await recordEvent(ctx, {
    account: account._id,
    kind: "billing",
    actor: row.payer,
    summary: `Credited confidential USDC payment ${creditBalance(row.amount)}`,
  });
  return view({ ...row, ...settled });
}

export const record = mutation({
  args: {
    ...auth,
    reference: v.string(),
    signature: v.string(),
    slot: v.number(),
    blockTime: v.number(),
    verified: v.optional(v.boolean()),
    reviewReason: v.optional(reviewReason),
  },
  returns: orderView,
  handler: async (ctx, args) => {
    const account = await member(ctx, args);
    const row = await accountOrder(ctx, account, args.reference);
    const { signature, slot, blockTime, verified } = args;
    if (
      !base58Bytes(signature, 64) ||
      !Number.isSafeInteger(slot) ||
      slot <= 0 ||
      !Number.isSafeInteger(blockTime) ||
      blockTime <= 0 ||
      (verified && args.reviewReason)
    )
      throw new ConvexError("Invalid confidential payment settlement.");

    if (row.signature) {
      if (row.signature !== signature || row.slot !== slot || row.blockTime !== blockTime)
        throw new ConvexError("This order already has a different confidential payment.");
      if (row.status !== "under_review" || row.reviewReason !== "details-encrypted") return view(row);
      if (verified) return credit(ctx, row, account);
      if (args.reviewReason && args.reviewReason !== row.reviewReason) {
        await ctx.db.patch(row._id, { reviewReason: args.reviewReason });
        return view({ ...row, reviewReason: args.reviewReason });
      }
      return view(row);
    }

    // Solana block time is measured in seconds. Adjacent payment windows use the
    // same rounding so each second belongs to at most one order for a payer.
    const opens = Math.ceil(row._creationTime / 1000);
    const closes = Math.ceil(Math.min(row.expiresAt, row.cancelledAt ?? row.expiresAt) / 1000);
    if (blockTime < opens || blockTime >= closes)
      throw new ConvexError("This transaction finalized outside the confidential payment window.");
    if (row.status !== "awaiting_payment" && row.status !== "expired" && row.status !== "cancelled")
      throw new ConvexError("Confidential payment order unavailable.");
    await assertDepositSignatureUnused(ctx, signature);
    const receipt = {
      signature,
      slot,
      blockTime,
      submittedAt: Date.now(),
      status: "under_review" as const,
      reviewReason: args.reviewReason ?? "details-encrypted",
    };
    await ctx.db.patch(row._id, receipt);
    return verified ? credit(ctx, { ...row, ...receipt }, account) : view({ ...row, ...receipt });
  },
});

export const queue = query({
  args: { ...auth, cursor: v.optional(v.string()) },
  returns: v.object({ payments: v.array(orderView), nextCursor: v.union(v.null(), v.string()) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const page = await ctx.db
      .query("confidentialPaymentOrders")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "under_review"))
      .paginate({ cursor: args.cursor ?? null, numItems: 25 });
    return { payments: page.page.map(view), nextCursor: page.isDone ? null : page.continueCursor };
  },
});

export const reviewDetails = query({
  args: { ...auth, reference: v.string() },
  returns: orderView,
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    return view(await byReference(ctx, args.reference));
  },
});

export const resolve = mutation({
  args: {
    ...auth,
    reference: v.string(),
    signature: v.string(),
    action: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
  },
  returns: orderView,
  handler: async (ctx, args) => {
    const admin = await requireRecentAdmin(ctx, args);
    const row = await byReference(ctx, args.reference);
    if (row.signature !== args.signature || !base58Bytes(args.signature, 64))
      throw new ConvexError("This order does not match the confidential payment signature.");
    const approve = args.action === "approve";
    if (row.status === (approve ? "credited" : "rejected")) return view(row);
    if (row.status !== "under_review")
      throw new ConvexError("This confidential payment is no longer under review.");

    const reason = args.reason?.trim();
    if ((!approve && !reason) || (reason && reason.length > 500))
      throw new ConvexError("Record a rejection reason of 1 to 500 characters.");
    if (approve && row.reviewReason !== "details-encrypted")
      throw new ConvexError("The verified payment does not match this order.");
    const account = await ctx.db.get(row.account);
    if (!account || account.wallet !== row.payer)
      throw new ConvexError("Confidential payment account unavailable.");
    await assertDepositSignatureUnused(ctx, args.signature, { confidential: row._id });
    const result = approve ? await credit(ctx, row, account) : await reject(ctx, row, reason!);
    await recordAudit(ctx, {
      actor: admin._id,
      action: `finance.confidentialPayment.${args.action}`,
      targetKind: "confidentialPaymentOrder",
      targetId: row._id,
      summary: approve ? "Approved confidential USDC payment" : "Rejected confidential USDC payment",
      meta: { reference: row.reference, signature: row.signature, ...(reason ? { reason } : {}) },
    });
    return result;
  },
});

async function reject(ctx: MutationCtx, row: Order, reason: string) {
  const rejected = { status: "rejected", resolvedAt: Date.now(), reason } as const;
  await ctx.db.patch(row._id, rejected);
  return view({ ...row, ...rejected });
}
