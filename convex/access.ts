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

export function walletRole(wallet: string): "admin" | "member" {
  const admins = (process.env.SONNELY_ADMIN_WALLETS ?? "").split(",").map((value) => value.trim());
  return admins.includes(wallet) ? "admin" : "member";
}

export async function requireAdmin(ctx: QueryCtx, args: { secret: string; session: string }) {
  service(args.secret);
  const account = await requireAccount(ctx, args.session);
  if (walletRole(account.wallet) !== "admin") throw new ConvexError("Administrator access required.");
  return account;
}
