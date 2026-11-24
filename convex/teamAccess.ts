import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireAccount, service } from "./access";

export const teamRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
export const inviteRole = v.union(v.literal("admin"), v.literal("member"));
export const teamUnavailable = "Team or project unavailable.";
export const teamDenied = "Team role does not allow this action.";

export function teamMembership(ctx: QueryCtx, team: Id<"teams">, account: Id<"accounts">) {
  return ctx.db
    .query("teamMembers")
    .withIndex("by_team_and_account", (q) => q.eq("team", team).eq("account", account))
    .unique();
}

export async function teamActor(ctx: QueryCtx, auth: { secret: string; session: string }) {
  service(auth.secret);
  return requireAccount(ctx, auth.session);
}

export async function teamAccess(ctx: QueryCtx, actor: Doc<"accounts">, teamId: Id<"teams">, manage = false) {
  const member = await teamMembership(ctx, teamId, actor._id);
  if (!member) throw new ConvexError(teamUnavailable);
  if (manage && member.role === "member") throw new ConvexError(teamDenied);
  const team = await ctx.db.get("teams", teamId);
  if (!team) throw new ConvexError(teamUnavailable);
  return { team, member };
}

export async function projectAccess(
  ctx: QueryCtx,
  actor: Doc<"accounts">,
  projectId: Id<"teamProjects">,
  manage = false,
) {
  const project = await ctx.db.get("teamProjects", projectId);
  if (!project) throw new ConvexError(teamUnavailable);
  return { ...(await teamAccess(ctx, actor, project.team, manage)), project };
}
