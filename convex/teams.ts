import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { auth } from "./access";
import { recordEvent } from "./events";
import { base58Bytes } from "./ledger";
import { requestEndpoint, requestStatus } from "./requestLogContract";
import {
  inviteRole,
  projectAccess,
  teamAccess,
  teamActor,
  teamDenied,
  teamMembership,
  teamRole,
  teamUnavailable,
} from "./teamAccess";

const membershipLimit = 50;
const projectLimit = 50;
const keyLimit = 50;
const invitationLife = 7 * 86_400_000;

const teamView = v.object({ id: v.id("teams"), name: v.string(), role: teamRole });
const invitation = v.object({
  team: v.id("teams"),
  teamName: v.string(),
  role: inviteRole,
  expires: v.number(),
});
const memberView = v.object({ account: v.id("accounts"), wallet: v.string(), role: teamRole });
const projectView = v.object({
  id: v.id("teamProjects"),
  team: v.id("teams"),
  name: v.string(),
  budget: v.number(),
  spent: v.number(),
  archived: v.boolean(),
});
const money = v.union(v.number(), v.null());
const keyView = v.object({
  id: v.id("keys"),
  name: v.string(),
  prefix: v.string(),
  cap: money,
  dailyCap: money,
  lifetime: v.number(),
  expires: money,
});
const usageView = v.object({
  id: v.id("usage"),
  time: v.number(),
  model: v.string(),
  keyName: v.string(),
  endpoint: v.optional(requestEndpoint),
  status: requestStatus,
  cost: v.number(),
});
const inviteView = v.object({
  wallet: v.string(),
  role: inviteRole,
  expires: v.number(),
});

const projectSummary = ({ _id: id, team, name, budget, spent, archived }: Doc<"teamProjects">) => ({
  id,
  team,
  name,
  budget,
  spent,
  archived,
});

function label(value: string) {
  const name = value.trim();
  if (!name || name.length > 60) throw new ConvexError("Names must be 1–60 characters.");
  return name;
}

function validateBudget(value: number) {
  if (!Number.isSafeInteger(value) || value < 10_000 || value > 100_000_000_000)
    throw new ConvexError("A budget must be between $0.01 and $100,000.");
}

function members(ctx: QueryCtx, team: Id<"teams">) {
  return ctx.db.query("teamMembers").withIndex("by_team_and_account", (q) => q.eq("team", team));
}

function memberTeams(ctx: QueryCtx, account: Id<"accounts">) {
  return ctx.db.query("teamMembers").withIndex("by_account", (q) => q.eq("account", account));
}

function activeInvites(ctx: QueryCtx, team: Id<"teams">, now: number) {
  return ctx.db
    .query("teamInvites")
    .withIndex("by_team_and_expires", (q) => q.eq("team", team).gt("expires", now));
}

function walletInvite(ctx: QueryCtx, team: Id<"teams">, wallet: string) {
  return ctx.db
    .query("teamInvites")
    .withIndex("by_team_and_wallet", (q) => q.eq("team", team).eq("wallet", wallet))
    .unique();
}

function projects(ctx: QueryCtx, team: Id<"teams">, archived: boolean) {
  return ctx.db
    .query("teamProjects")
    .withIndex("by_team_and_archived", (q) => q.eq("team", team).eq("archived", archived));
}

function activeKeys(ctx: QueryCtx, project: Id<"teamProjects">) {
  return ctx.db
    .query("keys")
    .withIndex("by_project_and_revoked", (q) => q.eq("project", project).eq("revoked", false));
}

function note(ctx: MutationCtx, team: Doc<"teams">, actor: Doc<"accounts">, summary: string) {
  return recordEvent(ctx, {
    account: team.owner,
    kind: "team",
    actor: actor.wallet,
    summary: team.name + " · " + summary,
  });
}

export const list = query({
  args: { ...auth, now: v.number() },
  returns: v.object({ teams: v.array(teamView), invitations: v.array(invitation) }),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const [memberships, invites] = await Promise.all([
      memberTeams(ctx, actor._id).take(membershipLimit),
      ctx.db
        .query("teamInvites")
        .withIndex("by_wallet_and_expires", (q) => q.eq("wallet", actor.wallet).gt("expires", args.now))
        .order("desc")
        .take(membershipLimit),
    ]);
    const teams = await Promise.all(
      memberships.map(async ({ team, role }) => {
        const record = await ctx.db.get("teams", team);
        return record ? { id: team, name: record.name, role } : null;
      }),
    );
    const invitations = await Promise.all(
      invites.map(async ({ team, role, inviter, expires }) => {
        const [record, issuer] = await Promise.all([
          ctx.db.get("teams", team),
          ctx.db.get("teamMembers", inviter),
        ]);
        if (
          !record ||
          !issuer ||
          issuer.team !== team ||
          issuer.role === "member" ||
          (role === "admin" && issuer.role !== "owner")
        )
          return null;
        return { team, teamName: record.name, role, expires };
      }),
    );
    return {
      teams: teams.filter((row) => row !== null),
      invitations: invitations.filter((row) => row !== null),
    };
  },
});

export const detail = query({
  args: { ...auth, team: v.id("teams"), now: v.number() },
  returns: v.object({
    team: teamView,
    members: v.array(memberView),
    invites: v.array(inviteView),
    projects: v.array(projectView),
  }),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team, member } = await teamAccess(ctx, actor, args.team);
    const [roster, pending, active, archived] = await Promise.all([
      members(ctx, team._id).take(membershipLimit),
      member.role === "member" ? [] : activeInvites(ctx, team._id, args.now).take(membershipLimit),
      projects(ctx, team._id, false).order("desc").take(projectLimit),
      projects(ctx, team._id, true).order("desc").take(projectLimit),
    ]);
    const teamMembers = await Promise.all(
      roster.map(async ({ account, role }) => {
        const row = await ctx.db.get("accounts", account);
        return row ? { account, wallet: row.wallet, role } : null;
      }),
    );
    return {
      team: { id: team._id, name: team.name, role: member.role },
      members: teamMembers.filter((row) => row !== null),
      invites: pending.map(({ wallet, role, expires }) => ({ wallet, role, expires })),
      projects: [...active, ...archived].map(projectSummary),
    };
  },
});

export const projectDetail = query({
  args: { ...auth, project: v.id("teamProjects") },
  returns: v.object({
    project: projectView,
    role: teamRole,
    keys: v.array(keyView),
    requests: v.array(usageView),
  }),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { project, member } = await projectAccess(ctx, actor, args.project);
    const [keys, rows] = await Promise.all([
      member.role === "member" ? [] : activeKeys(ctx, project._id).order("desc").take(keyLimit),
      ctx.db
        .query("usage")
        .withIndex("by_project", (q) => q.eq("project", project._id))
        .order("desc")
        .take(30),
    ]);
    return {
      project: projectSummary(project),
      role: member.role,
      keys: keys.map(({ _id: id, name, prefix, cap, dailyCap, lifetime, expires }) => ({
        id,
        name,
        prefix,
        cap,
        dailyCap,
        lifetime,
        expires,
      })),
      requests: rows.map(({ _id: id, _creationTime: time, model, keyName, endpoint, status, cost }) => ({
        id,
        time,
        model,
        keyName,
        endpoint,
        status,
        cost,
      })),
    };
  },
});

export const create = mutation({
  args: { ...auth, name: v.string() },
  returns: v.id("teams"),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    if ((await memberTeams(ctx, actor._id).take(membershipLimit)).length >= membershipLimit)
      throw new ConvexError("Team membership limit reached.");
    const id = await ctx.db.insert("teams", { name: label(args.name), owner: actor._id });
    await ctx.db.insert("teamMembers", { team: id, account: actor._id, role: "owner" });
    return id;
  },
});

export const invite = mutation({
  args: { ...auth, team: v.id("teams"), wallet: v.string(), role: inviteRole },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team, member } = await teamAccess(ctx, actor, args.team, true);
    if (args.role === "admin" && member.role !== "owner") throw new ConvexError(teamDenied);
    if (!base58Bytes(args.wallet, 32)) throw new ConvexError("Enter a Solana wallet address.");
    const target = await ctx.db
      .query("accounts")
      .withIndex("by_wallet", (q) => q.eq("wallet", args.wallet))
      .unique();
    if (target && (await teamMembership(ctx, team._id, target._id)))
      throw new ConvexError("This wallet is already a team member.");
    const now = Date.now();
    const existing = await walletInvite(ctx, team._id, args.wallet);
    if (existing && existing.role === "admin" && member.role !== "owner" && existing.expires > now)
      throw new ConvexError(teamDenied);
    if (
      (!existing || existing.expires <= now) &&
      (await activeInvites(ctx, team._id, now).take(membershipLimit)).length >= membershipLimit
    )
      throw new ConvexError("Pending invitation limit reached.");
    const fields = { role: args.role, expires: now + invitationLife, inviter: member._id };
    if (existing) await ctx.db.patch("teamInvites", existing._id, fields);
    else await ctx.db.insert("teamInvites", { team: team._id, wallet: args.wallet, ...fields });
    await note(ctx, team, actor, "Invited wallet as " + args.role);
    return null;
  },
});

export const respond = mutation({
  args: { ...auth, team: v.id("teams"), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const invite = await walletInvite(ctx, args.team, actor.wallet);
    const team = await ctx.db.get("teams", args.team);
    if (!team || !invite || invite.expires <= Date.now()) throw new ConvexError(teamUnavailable);
    if (args.accept) {
      const issuer = await ctx.db.get("teamMembers", invite.inviter);
      if (
        !issuer ||
        issuer.team !== team._id ||
        issuer.role === "member" ||
        (invite.role === "admin" && issuer.role !== "owner")
      )
        throw new ConvexError(teamUnavailable);
      const existing = await teamMembership(ctx, team._id, actor._id);
      if (!existing) {
        const [roster, memberships] = await Promise.all([
          members(ctx, team._id).take(membershipLimit),
          memberTeams(ctx, actor._id).take(membershipLimit),
        ]);
        if (roster.length >= membershipLimit || memberships.length >= membershipLimit)
          throw new ConvexError("Team membership limit reached.");
        await ctx.db.insert("teamMembers", { team: team._id, account: actor._id, role: invite.role });
        await note(ctx, team, actor, "Joined team as " + invite.role);
      }
    }
    await ctx.db.delete("teamInvites", invite._id);
    return null;
  },
});

export const cancelInvite = mutation({
  args: { ...auth, team: v.id("teams"), wallet: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team, member } = await teamAccess(ctx, actor, args.team, true);
    const invite = await walletInvite(ctx, team._id, args.wallet);
    if (!invite) return null;
    if (invite.role === "admin" && member.role !== "owner") throw new ConvexError(teamDenied);
    await ctx.db.delete("teamInvites", invite._id);
    await note(ctx, team, actor, "Canceled a wallet invitation");
    return null;
  },
});

export const changeMember = mutation({
  args: { ...auth, team: v.id("teams"), account: v.id("accounts"), role: v.union(inviteRole, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team, member } = await teamAccess(ctx, actor, args.team);
    const target = await teamMembership(ctx, team._id, args.account);
    if (!target) throw new ConvexError(teamUnavailable);
    if (target.role === "owner") throw new ConvexError(teamDenied);
    if (args.role === null) {
      if (
        target.account !== actor._id &&
        member.role !== "owner" &&
        (member.role !== "admin" || target.role !== "member")
      )
        throw new ConvexError(teamDenied);
      await ctx.db.delete("teamMembers", target._id);
      await note(ctx, team, actor, target.account === actor._id ? "Left team" : "Removed a team member");
    } else {
      if (member.role !== "owner") throw new ConvexError(teamDenied);
      if (target.role !== args.role) {
        // Credentials and invitations from a previous grant stay invalid after a promotion.
        await ctx.db.delete("teamMembers", target._id);
        await ctx.db.insert("teamMembers", { team: team._id, account: target.account, role: args.role });
        await note(ctx, team, actor, "Changed a team member role to " + args.role);
      }
    }
    return null;
  },
});

export const createProject = mutation({
  args: { ...auth, team: v.id("teams"), name: v.string(), budget: v.number() },
  returns: v.id("teamProjects"),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team } = await teamAccess(ctx, actor, args.team, true);
    const name = label(args.name);
    validateBudget(args.budget);
    if ((await projects(ctx, team._id, false).take(projectLimit)).length >= projectLimit)
      throw new ConvexError("Active project limit reached.");
    const id = await ctx.db.insert("teamProjects", {
      team: team._id,
      payer: team.owner,
      name,
      budget: args.budget,
      spent: 0,
      archived: false,
    });
    await note(ctx, team, actor, "Created project " + name);
    return id;
  },
});

export const updateProject = mutation({
  args: { ...auth, project: v.id("teamProjects"), name: v.string(), budget: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team, project } = await projectAccess(ctx, actor, args.project, true);
    if (project.archived) throw new ConvexError("This project is archived.");
    const name = label(args.name);
    validateBudget(args.budget);
    await ctx.db.patch("teamProjects", project._id, { name, budget: args.budget });
    await note(ctx, team, actor, "Updated project " + name);
    return null;
  },
});

export const archiveProject = mutation({
  args: { ...auth, project: v.id("teamProjects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team, project } = await projectAccess(ctx, actor, args.project, true);
    if (!project.archived) {
      await ctx.db.patch("teamProjects", project._id, { archived: true });
      await note(ctx, team, actor, "Archived project " + project.name);
    }
    return null;
  },
});

export const createProjectKey = mutation({
  args: {
    ...auth,
    project: v.id("teamProjects"),
    name: v.string(),
    prefix: v.string(),
    hash: v.string(),
    cap: money,
    dailyCap: money,
    expires: money,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team, project, member } = await projectAccess(ctx, actor, args.project, true);
    if (project.archived) throw new ConvexError("This project is archived.");
    const name = label(args.name);
    if (!/^[a-f0-9]{64}$/.test(args.hash) || !/^sonnely_live_[a-zA-Z0-9_-]{7}$/.test(args.prefix))
      throw new ConvexError("The API key credentials are malformed.");
    if (args.cap !== null) validateBudget(args.cap);
    if (args.dailyCap !== null) validateBudget(args.dailyCap);
    if (args.expires !== null && (!Number.isSafeInteger(args.expires) || args.expires <= Date.now()))
      throw new ConvexError("Choose a future key expiry.");
    const [keys, duplicate] = await Promise.all([
      activeKeys(ctx, project._id).take(keyLimit),
      ctx.db
        .query("keys")
        .withIndex("by_hash", (q) => q.eq("hash", args.hash))
        .first(),
    ]);
    if (keys.length >= keyLimit) throw new ConvexError("Project key limit reached.");
    if (duplicate) throw new ConvexError("That key is already registered.");
    await ctx.db.insert("keys", {
      account: project.payer,
      project: project._id,
      issuer: member._id,
      name,
      prefix: args.prefix,
      hash: args.hash,
      cap: args.cap,
      dailyCap: args.dailyCap,
      expires: args.expires,
      revoked: false,
      lifetime: 0,
    });
    await note(ctx, team, actor, "Created project API key " + name);
    return null;
  },
});

export const revokeProjectKey = mutation({
  args: { ...auth, project: v.id("teamProjects"), key: v.id("keys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await teamActor(ctx, args);
    const { team, project } = await projectAccess(ctx, actor, args.project, true);
    const key = await ctx.db.get("keys", args.key);
    if (!key || key.project !== project._id) throw new ConvexError(teamUnavailable);
    if (!key.revoked) {
      await ctx.db.patch("keys", key._id, { revoked: true });
      await note(ctx, team, actor, "Revoked project API key " + key.name);
    }
    return null;
  },
});
