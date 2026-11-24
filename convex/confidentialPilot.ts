import bs58 from "bs58";
import { ConvexError, v } from "convex/values";
import { confidentialPilotAmount } from "../lib/confidential-pilot-types";
import { mainnetMint } from "../lib/payments";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { auth, requireAdmin } from "./access";
import { recordEvent } from "./events";
import { assertDepositSignatureUnused } from "./ledger";

const submissionFields = {
  signature: v.string(),
  messageHash: v.string(),
  lastValidBlockHeight: v.number(),
};
const orderView = v.object({
  reference: v.string(),
  payer: v.string(),
  treasury: v.string(),
  cluster: v.literal("mainnet"),
  mint: v.literal(mainnetMint),
  amount: v.literal(confidentialPilotAmount),
  status: v.union(v.literal("pending"), v.literal("finalized")),
  createdAt: v.number(),
  submission: v.optional(v.object(submissionFields)),
  signature: v.optional(v.string()),
  finalizedAt: v.optional(v.number()),
});

function base58Bytes(value: string, size: 32 | 64) {
  if (value.length < size || value.length > (size === 32 ? 44 : 88)) return false;
  try {
    return bs58.decode(value).length === size;
  } catch {
    return false;
  }
}

function view(row: Doc<"confidentialPilotOrders">): typeof orderView.type {
  const {
    reference,
    payer,
    treasury,
    status,
    _creationTime: createdAt,
    submission,
    signature,
    finalizedAt,
  } = row;
  return {
    reference,
    payer,
    treasury,
    cluster: "mainnet",
    mint: mainnetMint,
    amount: confidentialPilotAmount,
    status,
    createdAt,
    submission,
    signature,
    finalizedAt,
  };
}

function pendingOrder(ctx: QueryCtx, account: Doc<"accounts">["_id"]) {
  return ctx.db
    .query("confidentialPilotOrders")
    .withIndex("by_account_and_status", (q) => q.eq("account", account).eq("status", "pending"))
    .unique();
}

async function accountOrder(ctx: QueryCtx, account: Doc<"accounts">, reference: string) {
  if (!base58Bytes(reference, 32)) throw new ConvexError("Invalid confidential payment reference.");
  const row = await ctx.db
    .query("confidentialPilotOrders")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .unique();
  if (!row || row.account !== account._id || row.payer !== account.wallet)
    throw new ConvexError("Confidential payment order unavailable.");
  return row;
}

export const active = query({
  args: auth,
  returns: v.union(v.null(), orderView),
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args);
    const row =
      (await pendingOrder(ctx, account._id)) ??
      (await ctx.db
        .query("confidentialPilotOrders")
        .withIndex("by_account_and_status", (q) => q.eq("account", account._id).eq("status", "finalized"))
        .order("desc")
        .first());
    return row ? view(row) : null;
  },
});

export const details = query({
  args: { ...auth, reference: v.string() },
  returns: orderView,
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args);
    return view(await accountOrder(ctx, account, args.reference));
  },
});

export const open = mutation({
  args: { ...auth, reference: v.string(), treasury: v.string() },
  returns: orderView,
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args);
    const { reference, treasury } = args;
    if (
      !base58Bytes(treasury, 32) ||
      !base58Bytes(account.wallet, 32) ||
      treasury !== process.env.SONNELY_TREASURY_WALLET ||
      treasury === account.wallet
    )
      throw new ConvexError("Confidential payment treasury is unavailable for this wallet.");
    if (!base58Bytes(reference, 32)) throw new ConvexError("Invalid confidential payment reference.");

    const existing = await pendingOrder(ctx, account._id);
    if (existing) {
      if (existing.treasury !== treasury)
        throw new ConvexError("Recover the existing confidential payment before opening another.");
      return view(existing);
    }

    const [existingPilot, existingDeposit] = await Promise.all([
      ctx.db
        .query("confidentialPilotOrders")
        .withIndex("by_reference", (q) => q.eq("reference", reference))
        .unique(),
      ctx.db
        .query("deposits")
        .withIndex("by_reference", (q) => q.eq("reference", reference))
        .unique(),
    ]);
    if (existingPilot || existingDeposit) throw new ConvexError("Payment reference already exists.");
    const id = await ctx.db.insert("confidentialPilotOrders", {
      account: account._id,
      payer: account.wallet,
      treasury,
      reference,
      status: "pending",
    });
    const row = await ctx.db.get("confidentialPilotOrders", id);
    if (!row) throw new ConvexError("Confidential payment order unavailable.");
    return view(row);
  },
});

export const stage = mutation({
  args: { ...auth, reference: v.string(), payer: v.string(), treasury: v.string(), ...submissionFields },
  returns: orderView,
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args);
    const row = await accountOrder(ctx, account, args.reference);
    const { payer, treasury, signature, messageHash, lastValidBlockHeight } = args;
    if (payer !== row.payer || treasury !== row.treasury)
      throw new ConvexError("Confidential payment does not match this order.");
    if (
      !base58Bytes(signature, 64) ||
      !/^[a-f0-9]{64}$/.test(messageHash) ||
      !Number.isSafeInteger(lastValidBlockHeight) ||
      lastValidBlockHeight <= 0
    )
      throw new ConvexError("Invalid confidential payment submission.");
    if (row.status !== "pending") throw new ConvexError("Payment already recorded.");
    if (row.submission) {
      if (
        row.submission.signature === signature &&
        row.submission.messageHash === messageHash &&
        row.submission.lastValidBlockHeight === lastValidBlockHeight
      )
        return view(row);
      throw new ConvexError("Recover the submitted confidential payment before sending another.");
    }
    await assertDepositSignatureUnused(ctx, signature);
    const submission = { signature, messageHash, lastValidBlockHeight };
    await ctx.db.patch("confidentialPilotOrders", row._id, { submission });
    return view({ ...row, submission });
  },
});

export const release = mutation({
  args: { ...auth, reference: v.string(), signature: v.string() },
  returns: orderView,
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args);
    const row = await accountOrder(ctx, account, args.reference);
    if (!base58Bytes(args.signature, 64)) throw new ConvexError("Invalid confidential payment signature.");
    if (row.status !== "pending") throw new ConvexError("Payment already recorded.");
    if (!row.submission) return view(row);
    if (row.submission.signature !== args.signature)
      throw new ConvexError("Confidential payment submission changed.");
    await ctx.db.patch("confidentialPilotOrders", row._id, { submission: undefined });
    return view({ ...row, submission: undefined });
  },
});

export const finalize = mutation({
  args: { ...auth, reference: v.string(), payer: v.string(), treasury: v.string(), signature: v.string() },
  returns: orderView,
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args);
    const row = await accountOrder(ctx, account, args.reference);
    const { payer, treasury, signature } = args;
    if (!base58Bytes(signature, 64)) throw new ConvexError("Invalid confidential payment signature.");
    if (payer !== row.payer || treasury !== row.treasury)
      throw new ConvexError("Confidential payment does not match this order.");
    if (row.signature === signature) return view(row);
    if (row.status !== "pending") throw new ConvexError("Payment already recorded.");
    if (row.submission?.signature !== signature)
      throw new ConvexError("No matching confidential payment submission.");

    await assertDepositSignatureUnused(ctx, signature, row._id);
    const balance = account.balance + confidentialPilotAmount;
    if (!Number.isSafeInteger(balance))
      throw new ConvexError("The payment exceeds the credit balance limit.");
    const finalized = { status: "finalized", signature, finalizedAt: Date.now() } as const;
    await ctx.db.patch("confidentialPilotOrders", row._id, finalized);
    await ctx.db.patch("accounts", account._id, { balance });
    await recordEvent(ctx, {
      account: account._id,
      kind: "billing",
      actor: account.wallet,
      summary: "Finalized confidential USDC pilot deposit $0.01",
    });
    return view({ ...row, ...finalized });
  },
});
