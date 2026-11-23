import { v } from "convex/values";
import { query } from "./_generated/server";
import { accountRole, auth, requireAdmin, requireOperator, walletRole } from "./access";

const operatorFields = {
  id: v.optional(v.id("accounts")),
  wallet: v.string(),
  name: v.optional(v.string()),
  role: accountRole,
};

function envWallets() {
  const wallets = new Set<string>();
  for (const list of [
    process.env.SONNELY_ADMIN_WALLETS,
    process.env.SONNELY_SUPPORT_WALLETS,
    process.env.SONNELY_FINANCE_WALLETS,
  ])
    for (const wallet of (list ?? "").split(",")) {
      const trimmed = wallet.trim();
      if (trimmed) wallets.add(trimmed);
    }
  return [...wallets];
}

const byRoleThenWallet = <T extends { wallet: string; role: string }>(a: T, b: T) =>
  a.role.localeCompare(b.role) || a.wallet.localeCompare(b.wallet);

export const directory = query({
  args: auth,
  returns: v.array(
    v.object({
      ...operatorFields,
      joined: v.optional(v.number()),
      lastActiveAt: v.optional(v.number()),
      openTickets: v.number(),
      openTasks: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const openTickets = [
      ...(await ctx.db
        .query("tickets")
        .withIndex("by_state", (q) => q.eq("state", undefined))
        .collect()),
      ...(await ctx.db
        .query("tickets")
        .withIndex("by_state", (q) => q.eq("state", "in_progress"))
        .collect()),
    ];
    const rows = await Promise.all(
      envWallets().map(async (wallet) => {
        const account = await ctx.db
          .query("accounts")
          .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
          .unique();
        if (!account) return { wallet, role: walletRole(wallet), openTickets: 0, openTasks: 0 };
        const [audit, openTasks] = await Promise.all([
          ctx.db
            .query("adminAudit")
            .withIndex("by_actor", (q) => q.eq("actor", account._id))
            .order("desc")
            .first(),
          ctx.db
            .query("crmTasks")
            .withIndex("by_assignee_done", (q) => q.eq("assignee", account._id).eq("doneAt", undefined))
            .collect(),
        ]);
        return {
          id: account._id,
          wallet,
          name: account.name || undefined,
          role: walletRole(wallet),
          joined: account._creationTime,
          lastActiveAt: audit?._creationTime,
          openTickets: openTickets.filter((row) => row.assignedTo === account._id).length,
          openTasks: openTasks.length,
        };
      }),
    );
    return rows.sort(byRoleThenWallet);
  },
});

export const operators = query({
  args: auth,
  returns: v.array(v.object(operatorFields)),
  handler: async (ctx, args) => {
    await requireOperator(ctx, args, "support");
    const rows = await Promise.all(
      envWallets().map(async (wallet) => {
        const account = await ctx.db
          .query("accounts")
          .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
          .unique();
        return {
          id: account?._id,
          wallet,
          name: account?.name || undefined,
          role: walletRole(wallet),
        };
      }),
    );
    return rows.sort(byRoleThenWallet);
  },
});
