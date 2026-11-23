import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { auth, requireOperator } from "./access";
import { recordAudit } from "./events";

export const apply = mutation({
  args: {
    ...auth,
    ids: v.array(v.id("tickets")),
    op: v.union(v.literal("claim"), v.literal("unassign"), v.literal("resolve")),
  },
  returns: v.object({ applied: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireOperator(ctx, args, "support");
    if (!args.ids.length) throw new ConvexError("Select at least one support request.");
    if (args.ids.length > 50) throw new ConvexError("Bulk actions are limited to 50 requests.");
    const now = Date.now();
    const applied: Id<"tickets">[] = [];
    let skipped = 0;
    for (const id of args.ids) {
      const ticket = await ctx.db.get(id);
      const state = ticket?.state ?? "open";
      if (
        !ticket ||
        (args.op === "resolve" && state === "resolved") ||
        (args.op === "claim" && ticket.assignedTo === admin._id) ||
        (args.op === "unassign" && ticket.assignedTo === undefined)
      ) {
        skipped += 1;
        continue;
      }
      const patch: {
        assignedTo?: Id<"accounts">;
        state?: "in_progress" | "resolved";
        updatedAt: number;
      } = { updatedAt: now };
      let note = "";
      if (args.op === "claim") {
        patch.assignedTo = admin._id;
        note = "Assigned to " + admin.wallet;
      } else if (args.op === "unassign") {
        patch.assignedTo = undefined;
        note = "Unassigned";
      } else {
        patch.state = "resolved";
        note = "Marked resolved";
      }
      await ctx.db.patch(ticket._id, patch);
      await ctx.db.insert("crmEvents", {
        account: ticket.account,
        admin: admin._id,
        ticket: ticket._id,
        kind: "ticket",
        note,
      });
      applied.push(ticket._id);
    }
    if (applied.length)
      await recordAudit(ctx, {
        actor: admin._id,
        action: "crm.bulk",
        targetKind: "ticket",
        targetId: applied.join(","),
        summary: args.op + " x" + applied.length,
        meta: { ids: applied },
      });
    return { applied: applied.length, skipped };
  },
});
