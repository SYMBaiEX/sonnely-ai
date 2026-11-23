import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export async function recordAudit(
  ctx: MutationCtx,
  entry: {
    actor: Id<"accounts">;
    action: string;
    targetKind: string;
    targetId: string;
    summary: string;
    meta?: unknown;
  },
) {
  await ctx.db.insert("adminAudit", {
    actor: entry.actor,
    action: entry.action,
    targetKind: entry.targetKind,
    targetId: entry.targetId,
    summary: entry.summary.slice(0, 500),
    meta: entry.meta,
  });
}

export async function recordEvent(
  ctx: MutationCtx,
  entry: { account: Id<"accounts">; kind: string; actor: string; summary: string },
) {
  await ctx.db.insert("accountEvents", {
    account: entry.account,
    kind: entry.kind,
    actor: entry.actor,
    summary: entry.summary.slice(0, 500),
  });
}
