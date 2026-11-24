import { randomBytes } from "node:crypto";
import { isAddress } from "@solana/kit";
import { ConvexError } from "convex/values";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { teamDenied, teamUnavailable } from "@/convex/teamAccess";
import { parseCreditAmount } from "@/lib/credit-amount";
import {
  backend,
  ensureSameOrigin,
  errorResponse,
  hash,
  json,
  readBody,
  sessionHash,
  SonnelyError,
} from "@/lib/server";

const entityId = <T extends "teams" | "teamProjects" | "accounts" | "keys">() =>
  z
    .string()
    .regex(/^[a-z0-9]{20,64}$/)
    .transform((value) => value as Id<T>);
const team = entityId<"teams">();
const project = entityId<"teamProjects">();
const name = z.string().trim().min(1).max(60);
const role = z.enum(["admin", "member"]);
const wallet = z.string().trim().refine(isAddress);
const budget = z
  .string()
  .max(18)
  .transform((value, ctx) => {
    const parsed = parseCreditAmount(value);
    if (parsed === null || parsed < 10_000 || parsed > 100_000_000_000) {
      ctx.addIssue({ code: "custom", message: "A budget must be between $0.01 and $100,000." });
      return z.NEVER;
    }
    return parsed;
  });
const credentials = {
  cap: budget.nullable(),
  dailyCap: budget.nullable(),
  expiresOn: z.iso.date().nullable(),
};
const operation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), name }),
  z.strictObject({ action: z.literal("invite"), team, wallet, role }),
  z.strictObject({ action: z.literal("respond"), team, accept: z.boolean() }),
  z.strictObject({ action: z.literal("cancel-invite"), team, wallet }),
  z.strictObject({
    action: z.literal("change-member"),
    team,
    account: entityId<"accounts">(),
    role: role.nullable(),
  }),
  z.strictObject({ action: z.literal("create-project"), team, name, budget }),
  z.strictObject({ action: z.literal("update-project"), project, name, budget }),
  z.strictObject({ action: z.literal("archive-project"), project }),
  z.strictObject({ action: z.literal("create-key"), project, name, ...credentials }),
  z.strictObject({ action: z.literal("revoke-key"), project, key: entityId<"keys">() }),
]);

function teamError(error: unknown) {
  if (error instanceof ConvexError && (error.data === teamUnavailable || error.data === teamDenied)) {
    return errorResponse(new SonnelyError(error.data, error.data === teamDenied ? 403 : 404));
  }
  return errorResponse(error);
}

export async function GET(request: NextRequest) {
  try {
    const session = sessionHash(request);
    const { db, secret } = backend();
    const auth = { session, secret };
    const params = request.nextUrl.searchParams;
    const now = Date.now();
    if (params.has("project")) {
      return json(
        await db.query(api.teams.projectDetail, { ...auth, project: project.parse(params.get("project")) }),
      );
    }
    if (params.has("team")) {
      return json(await db.query(api.teams.detail, { ...auth, team: team.parse(params.get("team")), now }));
    }
    return json(await db.query(api.teams.list, { ...auth, now }));
  } catch (error) {
    return teamError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const session = sessionHash(request);
    const { db, secret } = backend();
    const args = { session, secret };
    const input = operation.parse(await readBody(request, 4_096));
    switch (input.action) {
      case "create":
        return json({ id: await db.mutation(api.teams.create, { ...args, name: input.name }) }, 201);
      case "invite":
        await db.mutation(api.teams.invite, {
          ...args,
          team: input.team,
          wallet: input.wallet,
          role: input.role,
        });
        break;
      case "respond":
        await db.mutation(api.teams.respond, { ...args, team: input.team, accept: input.accept });
        break;
      case "cancel-invite":
        await db.mutation(api.teams.cancelInvite, { ...args, team: input.team, wallet: input.wallet });
        break;
      case "change-member":
        await db.mutation(api.teams.changeMember, {
          ...args,
          team: input.team,
          account: input.account,
          role: input.role,
        });
        break;
      case "create-project":
        return json(
          {
            id: await db.mutation(api.teams.createProject, {
              ...args,
              team: input.team,
              name: input.name,
              budget: input.budget,
            }),
          },
          201,
        );
      case "update-project":
        await db.mutation(api.teams.updateProject, {
          ...args,
          project: input.project,
          name: input.name,
          budget: input.budget,
        });
        break;
      case "archive-project":
        await db.mutation(api.teams.archiveProject, { ...args, project: input.project });
        break;
      case "create-key": {
        const token = "sonnely_live_" + randomBytes(32).toString("base64url");
        await db.mutation(api.teams.createProjectKey, {
          ...args,
          project: input.project,
          name: input.name,
          prefix: token.slice(0, 20),
          hash: hash(token),
          cap: input.cap,
          dailyCap: input.dailyCap,
          expires: input.expiresOn === null ? null : Date.parse(input.expiresOn + "T00:00:00Z"),
        });
        return json({ key: token }, 201);
      }
      case "revoke-key":
        await db.mutation(api.teams.revokeProjectKey, { ...args, project: input.project, key: input.key });
        break;
    }
    return json({ ok: true });
  } catch (error) {
    return teamError(error);
  }
}
