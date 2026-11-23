import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "./_generated/server";

export const secret = { secret: v.string() };
export const auth = { ...secret, session: v.string() };

export function service(input: string) {
  const expected = process.env.SONNELY_SERVICE_SECRET ?? process.env.RELAY_SERVICE_SECRET;
  if (!expected || expected.length < 32 || input.length !== expected.length)
    throw new ConvexError("Unauthorized.");
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ input.charCodeAt(i);
  if (mismatch !== 0) throw new ConvexError("Unauthorized.");
}

export async function accountFor(ctx: QueryCtx, session: string) {
  const row = await ctx.db
    .query("sessions")
    .withIndex("by_hash", (q) => q.eq("hash", session))
    .unique();
  return row && row.expires > Date.now() ? await ctx.db.get(row.account) : null;
}

export async function requireAccount(ctx: QueryCtx, session: string) {
  const account = await accountFor(ctx, session);
  if (!account) throw new ConvexError("Sign in with a Solana wallet.");
  return account;
}

export const accountRole = v.union(
  v.literal("admin"),
  v.literal("support"),
  v.literal("finance"),
  v.literal("member"),
);
export const sessionLife = 7 * 86_400_000;

export function walletRole(wallet: string): typeof accountRole.type {
  const listed = (list: string | undefined) =>
    (list ?? "").split(",").some((value) => value.trim() === wallet);
  if (listed(process.env.SONNELY_ADMIN_WALLETS)) return "admin";
  if (listed(process.env.SONNELY_FINANCE_WALLETS)) return "finance";
  if (listed(process.env.SONNELY_SUPPORT_WALLETS)) return "support";
  return "member";
}

export async function requireOperator(
  ctx: QueryCtx,
  args: { secret: string; session: string },
  role: "support" | "finance",
) {
  service(args.secret);
  const account = await requireAccount(ctx, args.session);
  const assigned = walletRole(account.wallet);
  if (assigned !== "admin" && assigned !== role) throw new ConvexError("Administrator access required.");
  return account;
}

export async function requireRecentAdmin(ctx: QueryCtx, args: { secret: string; session: string }) {
  const account = await requireAdmin(ctx, args);
  const session = args.session;
  const row = await ctx.db
    .query("sessions")
    .withIndex("by_hash", (q) => q.eq("hash", session))
    .unique();
  if (!row || Date.now() - (row.expires - sessionLife) > 10 * 60_000)
    throw new ConvexError("Sign in again with your wallet before approving this action.");
  return account;
}

export async function requireAdmin(ctx: QueryCtx, args: { secret: string; session: string }) {
  service(args.secret);
  const account = await requireAccount(ctx, args.session);
  if (walletRole(account.wallet) !== "admin") throw new ConvexError("Administrator access required.");
  return account;
}
