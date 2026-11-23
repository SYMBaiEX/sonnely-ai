import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { auth, requireAdmin, requireRecentAdmin } from "./access";
import { recordAudit, recordEvent } from "./events";

const adjustCap = 1_000_000_000;

export const adjustBalance = mutation({
  args: { ...auth, account: v.id("accounts"), delta: v.number(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireRecentAdmin(ctx, args);
    const account = await ctx.db.get(args.account);
    if (!account) throw new ConvexError("Account unavailable.");
    const delta = args.delta;
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > adjustCap)
      throw new ConvexError("Adjust by a whole credit amount within 1,000 USD.");
    const reason = args.reason.trim();
    if (reason.length < 8 || reason.length > 500)
      throw new ConvexError("Record an evidence note of 8 to 500 characters.");
    const balanceAfter = account.balance + delta;
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0)
      throw new ConvexError("This adjustment would overdraw the account balance.");
    await ctx.db.patch(account._id, { balance: balanceAfter });
    await ctx.db.insert("balanceAdjustments", {
      account: account._id,
      admin: admin._id,
      delta,
      reason,
      balanceAfter,
    });
    await ctx.db.insert("crmEvents", {
      account: account._id,
      admin: admin._id,
      kind: "adjust",
      note: `Balance ${delta >= 0 ? "+" : ""}$${delta / 1e6} — ${reason.slice(0, 120)}`,
    });
    const summary = `Balance adjusted ${delta >= 0 ? "+" : ""}${delta / 1e6} USD by operations`;
    await recordEvent(ctx, { account: account._id, kind: "billing", actor: admin.wallet, summary });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "account.adjust-balance",
      targetKind: "account",
      targetId: account._id,
      summary,
      meta: { delta, balanceAfter },
    });
    return null;
  },
});

export const revokeKey = mutation({
  args: { ...auth, id: v.id("keys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const key = await ctx.db.get(args.id);
    if (!key) throw new ConvexError("Key unavailable.");
    if (!key.revoked) await ctx.db.patch(key._id, { revoked: true });
    const summary = `API key ${key.name} revoked by operations`;
    await ctx.db.insert("crmEvents", {
      account: key.account,
      admin: admin._id,
      kind: "note",
      note: summary + ` (${key.prefix}…).`,
    });
    await recordEvent(ctx, { account: key.account, kind: "key", actor: admin.wallet, summary });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "account.revoke-key",
      targetKind: "key",
      targetId: key._id,
      summary,
      meta: { prefix: key.prefix, account: key.account },
    });
    return null;
  },
});

export const setSuspended = mutation({
  args: {
    ...auth,
    account: v.id("accounts"),
    suspended: v.boolean(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireRecentAdmin(ctx, args);
    const account = await ctx.db.get(args.account);
    if (!account) throw new ConvexError("Account unavailable.");
    const note = args.note?.trim() || undefined;
    if (note && note.length > 500) throw new ConvexError("Keep the suspension note under 500 characters.");
    const existing = await ctx.db
      .query("accountFlags")
      .withIndex("by_account_flag", (q) => q.eq("account", account._id).eq("flag", "suspended"))
      .unique();
    if (args.suspended) {
      if (!existing)
        await ctx.db.insert("accountFlags", {
          account: account._id,
          flag: "suspended",
          note,
          admin: admin._id,
        });
      else if (note !== existing.note) await ctx.db.patch(existing._id, { note, admin: admin._id });
    } else if (existing) await ctx.db.delete(existing._id);
    const summary = args.suspended ? "Inference access suspended" : "Inference access restored";
    await ctx.db.insert("crmEvents", {
      account: account._id,
      admin: admin._id,
      kind: "flag",
      note: note ? `${summary}: ${note.slice(0, 120)}` : summary + ".",
    });
    await recordEvent(ctx, { account: account._id, kind: "account", actor: admin.wallet, summary });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "account.suspend",
      targetKind: "account",
      targetId: account._id,
      summary,
      meta: { suspended: args.suspended, note },
    });
    return null;
  },
});

export const resetSessions = mutation({
  args: { ...auth, account: v.id("accounts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireRecentAdmin(ctx, args);
    const account = await ctx.db.get(args.account);
    if (!account) throw new ConvexError("Account unavailable.");
    const sessions = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("account"), account._id))
      .take(100);
    for (const row of sessions) await ctx.db.delete(row._id);
    const summary = "Signed out everywhere by operations";
    await recordEvent(ctx, { account: account._id, kind: "session", actor: admin.wallet, summary });
    await recordAudit(ctx, {
      actor: admin._id,
      action: "account.reset-sessions",
      targetKind: "account",
      targetId: account._id,
      summary,
      meta: { cleared: sessions.length },
    });
    return null;
  },
});
