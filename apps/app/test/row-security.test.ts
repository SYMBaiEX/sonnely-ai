import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import * as Session from "../gen/app__session.effect.vibe";
import * as Admin from "../gen/app__admin.effect.vibe";
import * as Crm from "../gen/app__admin__crm.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as Deposits from "../gen/app__billing__deposits.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Support from "../gen/app__support.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import * as Referrals from "../gen/app__admin__referrals.effect.vibe";
import * as WorkspaceKeys from "../gen/app__keys.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import { adminApi } from "../src/api/admin.vibe";
import { billingApi } from "../src/api/billing.vibe";
import { keysApi } from "../src/api/keys.vibe";
import { teamsApi } from "../src/api/teams.vibe";
import { usageApi } from "../src/api/usage.vibe";
import { supportApi } from "../src/api/support.vibe";
import { gatewayApi } from "../src/api/gateway.vibe";
import { sessionApi } from "../src/api/session.vibe";
import { fleetMachineApi } from "../src/machines.vibe";
import { fleetLive } from "../src/fleet.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";

const walletA = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const walletB = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const walletOp = "4vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2d";
const walletAdm = "5vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2e";
const walletFin = "6vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2f";
const tokenA = "row-security-session-a";
const tokenB = "row-security-session-b";
const tokenOp = "row-security-session-op";
const tokenAdm = "row-security-session-adm";
const tokenFin = "row-security-session-fin";
const apiTokenA = "row-security-api-key-a";
const apiTokenB = "row-security-api-key-b";
const cleanups: Array<() => void | Promise<void>> = [];

function apiKey(id: string, token: string, wallet: string) {
  return {
    id,
    label: id,
    prefix: "sonnely_live_" + id,
    hash: createHash("sha256").update(token).digest("hex"),
    wallet,
    project: "",
    scopes: ["inference"],
    cap: 0,
    dailyCap: 0,
    expiresAt: 0,
    status: "Active",
    createdAt: 1,
    lastUsedAt: 0,
    spent: 0,
    dayKey: "",
    daySpent: 0,
  };
}

function usageRow(id: string, wallet: string, project: string): Usage.Row {
  return {
    id,
    time: 1,
    keyName: "project key",
    keyId: "key-project",
    project,
    wallet,
    model: "model-a",
    provider: "NearAI",
    input: 10,
    output: 5,
    cached: 0,
    cost: 100,
    providerMs: 20,
    status: "Complete",
  };
}

function writeSessions(dir: string, aExpiresIn = 60_000) {
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [
      { digest: sessionDigest(tokenA), nonce: "nonce", wallet: walletA, createdAt: 1, expiresAt: Date.now() + aExpiresIn, state: "LoginActive" },
      { digest: sessionDigest(tokenB), nonce: "nonce", wallet: walletB, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
      { digest: sessionDigest(tokenOp), nonce: "nonce", wallet: walletOp, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
      { digest: sessionDigest(tokenAdm), nonce: "nonce", wallet: walletAdm, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
      { digest: sessionDigest(tokenFin), nonce: "nonce", wallet: walletFin, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
    ],
  }));
  writeFileSync(join(dir, "admin"), JSON.stringify({
    ops: {
      roster: [
        { wallet: walletOp, role: "Support" },
        { wallet: walletAdm, role: "Admin" },
        { wallet: walletFin, role: "Finance" },
      ],
    },
    records: [],
    audit: [],
  }));
}

function seed(dir: string, finalizedDeposit = false) {
  writeFileSync(join(dir, "billing-ledger"), JSON.stringify({
    balance: 4900,
    entries: [
      { wallet: walletA, kind: "Credit", detail: "deposit-a", amount: 5000 },
      { wallet: walletA, kind: "Reserve", detail: "run-a", amount: 100 },
    ],
  }));
  writeFileSync(join(dir, "billing-deposits"), JSON.stringify({
    intents: [
      { reference: "ref-a", wallet: walletA, asset: "USDC", amount: 5, atomic: 5_000_000, createdAt: 1, expiresAt: 2, status: { tag: "Pending" } },
      ...(finalizedDeposit ? [{ reference: "ref-funded", wallet: walletA, asset: "USDC", amount: 5, atomic: 5_000_000, createdAt: 1, expiresAt: 2, status: { tag: "Finalized", signature: "signed" } }] : []),
    ],
  }));
  writeFileSync(join(dir, "teams"), JSON.stringify({
    releaseRefs: [],
    teams: [{
      id: "team-a",
      name: "A's team",
      members: [{ wallet: walletA, role: "Owner" }],
      invites: [],
      projects: [{ id: "proj-a", name: "A project", budget: 10000, spent: 0, archived: false }],
    }],
  }));
  writeFileSync(join(dir, "support"), JSON.stringify({
    tickets: [{
      id: "ticket-a", email: "a@x.com", topic: "billing", message: "help", state: "Open", openedAt: 1, updatedAt: 1,
      assignedTo: "", wallet: walletA,
      replies: [
        { author: "Staff", authorWallet: "op", visibility: "Internal", body: "internal note", time: 1 },
        { author: "Staff", authorWallet: "op", visibility: "Public", body: "public reply", time: 2 },
      ],
    }],
  }));
  writeFileSync(join(dir, encodeURIComponent("console__chat:" + walletA)), JSON.stringify({
    threads: [{ id: "thread-a", model: "m", messages: [{ role: "User", content: "secret prompt", model: "m" }] }],
    active: "thread-a",
    model: "m",
  }));
  writeFileSync(join(dir, "workspace-keys"), JSON.stringify({
    keys: [apiKey("key-a", apiTokenA, walletA), apiKey("key-b", apiTokenB, walletB)],
    refundRefs: [],
  }));
}

function makeAppWithDir(finalizedDeposit = false, usageRows: Usage.Row[] = [], aExpiresIn?: number) {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-row-security-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeSessions(dir, aExpiresIn);
  seed(dir, finalizedDeposit);
  writeFileSync(join(dir, "usage"), JSON.stringify({ rows: usageRows }));
  if (finalizedDeposit) {
    writeFileSync(join(dir, "admin-referrals"), JSON.stringify({
      codes: [{ code: "code-a", owner: walletB }],
      signups: [{ wallet: walletA, code: "code-a", stage: "SignedUp", joined: 1 }],
    }));
  }
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const apis = Layer.mergeAll(
    adminApi,
    billingApi,
    keysApi,
    teamsApi,
    usageApi,
    supportApi,
    gatewayApi,
    sessionApi,
    fleetMachineApi("console__chat", { events: ["newChat", "send"] }),
  );
  const state = Layer.provideMerge(
    Layer.mergeAll(
      Ledger.stored("billing-ledger"),
      Deposits.stored("billing-deposits"),
      Teams.stored("teams"),
      Support.stored("support"),
      Session.stored("session"),
      Requests.stored("gateway-requests"),
      WorkspaceKeys.stored("workspace-keys"),
      Usage.stored("usage"),
      Admin.stored("admin"),
      Crm.stored("admin-crm"),
      Referrals.stored("admin-referrals"),
      fleetLive,
    ),
    store(dir),
  );
  const appLayer = Layer.provideMerge(apis, state).pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
  );
  const app = HttpRouter.toWebHandler(appLayer);
  cleanups.push(() => app.dispose());
  return { handler: app.handler, dir };
}

function makeApp() {
  return makeAppWithDir().handler;
}

function get(handler: (request: Request) => Promise<Response>, path: string, token?: string) {
  return handler(new Request("http://localhost" + path, token ? { headers: { cookie: "sonnely_session=" + token } } : {}));
}

const jobA = "123e4567-e89b-42d3-a456-426614174000";
const jobB = "123e4567-e89b-42d3-a456-426614174001";

function batchRead(handler: (request: Request) => Promise<Response>, token: string) {
  return handler(new Request("http://localhost/api/sonnely/batch", { headers: { authorization: "Bearer " + token } }));
}

function batchWrite(handler: (request: Request) => Promise<Response>, method: string, path: string, token: string, body?: unknown) {
  return handler(new Request("http://localhost" + path, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("row-level access", () => {
  // spec/app/billing/ledger.md, "The ledger is a balance over an append-only entry log"
  it("projects only the requesting wallet's ledger entries with their own balance", async () => {
    const handler = makeApp();
    const a = await (await get(handler, "/api/machines/billing-ledger", tokenA)).json() as { balance: number; entries: unknown[] };
    const b = await (await get(handler, "/api/machines/billing-ledger", tokenB)).json() as { balance: number; entries: unknown[] };
    const anon = await get(handler, "/api/machines/billing-ledger");
    expect({ aBalance: a.balance, aEntries: a.entries.length, bBalance: b.balance, bEntries: b.entries.length, anonStatus: anon.status }).toEqual({
      aBalance: 4900, aEntries: 2, bBalance: 0, bEntries: 0, anonStatus: 401,
    });
  });

  // spec/app/billing/deposits.md, "An intent binds a transfer to the credit it buys"
  it("projects only the requesting wallet's deposit intents", async () => {
    const handler = makeApp();
    const a = await (await get(handler, "/api/machines/billing-deposits", tokenA)).json() as { intents: unknown[] };
    const b = await (await get(handler, "/api/machines/billing-deposits", tokenB)).json() as { intents: unknown[] };
    expect({ a: a.intents.length, b: b.intents.length }).toEqual({ a: 1, b: 0 });
  });

  // spec/app/admin/referrals.md, "A referral's reward only moves forward"; spec/app/billing/deposits.md, "Story: Finalize a paid intent"
  it("marks a referred wallet funded when its finalized deposit is credited", async () => {
    const { handler, dir } = makeAppWithDir(true);
    const response = await handler(new Request("http://localhost/api/billing/deposits/confirm", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sonnely_session=" + tokenA },
      body: JSON.stringify({ reference: "ref-funded" }),
    }));
    const body = await response.json() as { ok?: boolean };
    const referrals = JSON.parse(readFileSync(join(dir, "admin-referrals"), "utf8")) as { signups: { stage: string }[] };
    const ledger = JSON.parse(readFileSync(join(dir, "billing-ledger"), "utf8")) as { entries: { kind: string; detail: string }[] };
    expect({
      status: response.status,
      ok: body.ok,
      stage: referrals.signups[0]?.stage,
      credited: ledger.entries.some((entry) => entry.kind === "Credit" && entry.detail === "ref-funded"),
    }).toEqual({ status: 200, ok: true, stage: "Funded", credited: true });
  });

  // spec/app/teams.md, "A team, its members, invites and projects"
  it("shows teams only to their members", async () => {
    const handler = makeApp();
    const a = await (await get(handler, "/api/machines/teams", tokenA)).json() as { teams: unknown[] };
    const b = await (await get(handler, "/api/machines/teams", tokenB)).json() as { teams: unknown[] };
    expect({ a: a.teams.length, b: b.teams.length }).toEqual({ a: 1, b: 0 });
  });

  // spec/app/usage.md, "Every usage row belongs to the wallet that metered it": teammates read
  // project rows together, while workspace rows stay with the wallet that metered them
  it("shows project usage to teammates without exposing workspace usage", async () => {
    const { handler } = makeAppWithDir(false, [
      usageRow("request-project", walletB, "proj-a"),
      usageRow("request-workspace", walletB, ""),
    ]);
    const inviteFirstAdmin = await postMachine(handler, "teams", { type: "invite", teamId: "team-a", actor: walletA, wallet: walletB, role: "Admin", expiresAt: 1000, now: 1 }, tokenA);
    const acceptFirstAdmin = await postMachine(handler, "teams", { type: "respond", teamId: "team-a", actor: walletB, accept: true, now: 2 }, tokenB);
    const inviteSecondAdmin = await postMachine(handler, "teams", { type: "invite", teamId: "team-a", actor: walletA, wallet: walletFin, role: "Admin", expiresAt: 1000, now: 3 }, tokenA);
    const acceptSecondAdmin = await postMachine(handler, "teams", { type: "respond", teamId: "team-a", actor: walletFin, accept: true, now: 4 }, tokenFin);
    const inviteMember = await postMachine(handler, "teams", { type: "invite", teamId: "team-a", actor: walletA, wallet: walletOp, role: "Member", expiresAt: 1000, now: 5 }, tokenA);
    const acceptMember = await postMachine(handler, "teams", { type: "respond", teamId: "team-a", actor: walletOp, accept: true, now: 6 }, tokenOp);
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
    const owner = await (await get(handler, "/api/machines/usage", tokenA)).json() as { rows: { id: string }[] };
    const firstAdmin = await (await get(handler, "/api/machines/usage", tokenB)).json() as { rows: { id: string }[] };
    const secondAdmin = await (await get(handler, "/api/machines/usage", tokenFin)).json() as { rows: { id: string }[] };
    const member = await (await get(handler, "/api/machines/usage", tokenOp)).json() as { rows: { id: string }[] };
    const outsider = await (await get(handler, "/api/machines/usage", tokenAdm)).json() as { rows: { id: string }[] };
    expect({
      setup: [inviteFirstAdmin.status, acceptFirstAdmin.status, inviteSecondAdmin.status, acceptSecondAdmin.status, inviteMember.status, acceptMember.status],
      owner: ids(owner.rows),
      firstAdmin: ids(firstAdmin.rows),
      secondAdmin: ids(secondAdmin.rows),
      member: ids(member.rows),
      outsider: ids(outsider.rows),
    }).toEqual({
      setup: [200, 200, 200, 200, 200, 200],
      owner: ["request-project"],
      firstAdmin: ["request-project", "request-workspace"],
      secondAdmin: ["request-project"],
      member: ["request-project"],
      outsider: [],
    });
  });

  // spec/app/support.md, "A ticket and its replies"
  it("shows tickets only to their owner and strips internal staff replies", async () => {
    const handler = makeApp();
    const a = await (await get(handler, "/api/machines/support", tokenA)).json() as { tickets: { replies: { visibility: string }[] }[] };
    const b = await (await get(handler, "/api/machines/support", tokenB)).json() as { tickets: unknown[] };
    expect({
      aTickets: a.tickets.length,
      aReplies: a.tickets[0]?.replies.map((r) => r.visibility),
      bTickets: b.tickets.length,
    }).toEqual({ aTickets: 1, aReplies: ["Public"], bTickets: 0 });
  });

  // spec/app/support.md, "A ticket and its replies": an operator reads the whole queue,
  // internal staff notes included
  it("shows an operator every ticket with internal replies", async () => {
    const handler = makeApp();
    const op = await (await get(handler, "/api/machines/support", tokenOp)).json() as { tickets: { wallet: string; replies: { visibility: string }[] }[] };
    expect({
      tickets: op.tickets.length,
      replies: op.tickets[0]?.replies.map((r) => r.visibility),
    }).toEqual({ tickets: 1, replies: ["Internal", "Public"] });
  });

  function post(handler: (request: Request) => Promise<Response>, body: unknown, token: string) {
    return handler(new Request("http://localhost/api/machines/support", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sonnely_session=" + token },
      body: JSON.stringify(body),
    }));
  }

  // spec/app/support.md, "The team can reply publicly or note internally"
  it("accepts a staff reply from an operator and forces the author to the operator wallet", async () => {
    const handler = makeApp();
    const spoofed = await post(handler, { type: "staffReply", id: "ticket-a", body: "looking into it", visibility: "Internal", author: walletA, now: 10 }, tokenOp);
    const state = await (await get(handler, "/api/machines/support", tokenOp)).json() as { tickets: { replies: { authorWallet: string; visibility: string }[] }[] };
    expect({
      status: spoofed.status,
      authors: state.tickets[0]?.replies.map((r) => r.authorWallet),
    }).toEqual({ status: 200, authors: ["op", "op", walletOp] });
  });

  // spec/app/support.md, "Story: Move a request through its states"
  // spec/app/support.md, "Story: Assign ownership": the staff events are the operator's alone
  it("refuses staff events from a customer and accepts them from an operator", async () => {
    const handler = makeApp();
    const customerReply = await post(handler, { type: "staffReply", id: "ticket-a", body: "sneaky", visibility: "Public", author: walletA, now: 10 }, tokenA);
    const customerState = await post(handler, { type: "setState", id: "ticket-a", status: "Resolved", now: 11 }, tokenA);
    const customerAssign = await post(handler, { type: "assignOwner", id: "ticket-a", wallet: walletA, now: 12 }, tokenA);
    const opState = await post(handler, { type: "setState", id: "ticket-a", status: "Resolved", now: 13 }, tokenOp);
    const opAssign = await post(handler, { type: "assignOwner", id: "ticket-a", wallet: walletOp, now: 14 }, tokenOp);
    const state = await (await get(handler, "/api/machines/support", tokenOp)).json() as { tickets: { state: string; assignedTo: string; replies: unknown[] }[] };
    expect({
      customerStatuses: [customerReply.status, customerState.status, customerAssign.status],
      opStatuses: [opState.status, opAssign.status],
      ticket: state.tickets[0] ? { state: state.tickets[0].state, assignedTo: state.tickets[0].assignedTo, replies: state.tickets[0].replies.length } : undefined,
    }).toEqual({
      customerStatuses: [403, 403, 403],
      opStatuses: [200, 200],
      ticket: { state: "Resolved", assignedTo: walletOp, replies: 2 },
    });
  });

  // spec/app/support.md, "Story: Open a request": customer events are unchanged —
  // a signed-in wallet opens and replies on its own request
  it("still lets a customer open and reply with the wallet bound to the session", async () => {
    const handler = makeApp();
    const opened = await post(handler, { type: "open", id: "ticket-b", email: "b@x.com", topic: "Billing", message: "help me", wallet: walletOp, now: 20 }, tokenB);
    const replied = await post(handler, { type: "reply", id: "ticket-b", body: "more detail", now: 21 }, tokenB);
    const state = await (await get(handler, "/api/machines/support", tokenB)).json() as { tickets: { id: string; wallet: string }[] };
    expect({
      statuses: [opened.status, replied.status],
      tickets: state.tickets.map((t) => ({ id: t.id, wallet: t.wallet })),
    }).toEqual({
      statuses: [200, 200],
      tickets: [{ id: "ticket-b", wallet: walletB }],
    });
  });

  // spec/app/console/chat.md, "The playground is the threads, the open one and the chosen model"
  it("keeps each wallet's chat threads in its own machine instance", async () => {
    const handler = makeApp();
    const a = await (await get(handler, "/api/machines/console__chat", tokenA)).json() as { threads: unknown[] };
    const b = await (await get(handler, "/api/machines/console__chat", tokenB)).json() as { threads: unknown[] };
    const anon = await get(handler, "/api/machines/console__chat");
    expect({ a: a.threads.length, b: b.threads.length, anonStatus: anon.status }).toEqual({ a: 1, b: 0, anonStatus: 401 });
  });

  // spec/app/console/chat.md, "Story: Converse with a model"
  it("writes to a wallet's own instance without touching another wallet's", async () => {
    const handler = makeApp();
    const write = await handler(new Request("http://localhost/api/machines/console__chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sonnely_session=" + tokenB },
      body: JSON.stringify({ type: "send", id: "thread-b", model: "m", text: "hello" }),
    }));
    const a = await (await get(handler, "/api/machines/console__chat", tokenA)).json() as { threads: { id: string }[] };
    const b = await (await get(handler, "/api/machines/console__chat", tokenB)).json() as { threads: { id: string }[] };
    expect({
      writeOk: write.status,
      aIds: a.threads.map((t) => t.id),
      bIds: b.threads.map((t) => t.id),
    }).toEqual({ writeOk: 200, aIds: ["thread-a"], bIds: ["thread-b"] });
  });

  // spec/app/gateway/batch.md, "Story: Run a resumable batch"
  it("keeps each wallet's batch job in its own instance", async () => {
    const handler = makeApp();
    const created = await batchWrite(handler, "POST", "/api/sonnely/batch", apiTokenA, { id: jobA, filename: "a.jsonl", customIds: ["row-1", "row-2"] });
    const a = await (await batchRead(handler, apiTokenA)).json() as { tag: string; job?: { id: string; rows: { status: string }[] } };
    const b = await (await batchRead(handler, apiTokenB)).json() as { tag: string };
    const anon = await handler(new Request("http://localhost/api/sonnely/batch"));
    expect({
      created: created.status,
      aTag: a.tag,
      aId: a.job?.id,
      aRows: a.job?.rows.map((row) => row.status),
      bTag: b.tag,
      anonStatus: anon.status,
    }).toEqual({ created: 200, aTag: "Running", aId: jobA, aRows: ["Queued", "Queued"], bTag: "Empty", anonStatus: 401 });
  });

  // spec/app/gateway/batch.md, "Story: Run a resumable batch"
  it("writes to a wallet's own batch instance without touching another wallet's", async () => {
    const handler = makeApp();
    await batchWrite(handler, "POST", "/api/sonnely/batch", apiTokenA, { id: jobA, filename: "a.jsonl", customIds: ["row-1"] });
    const clearedByB = await batchWrite(handler, "DELETE", "/api/sonnely/batch", apiTokenB);
    const interruptedByB = await batchWrite(handler, "POST", "/api/sonnely/batch/interrupt", apiTokenB, { customId: "row-1" });
    const createdByB = await batchWrite(handler, "POST", "/api/sonnely/batch", apiTokenB, { id: jobB, filename: "b.jsonl", customIds: ["row-9"] });
    const a = await (await batchRead(handler, apiTokenA)).json() as { tag: string; job?: { id: string; rows: { customId: string }[] } };
    const b = await (await batchRead(handler, apiTokenB)).json() as { tag: string; job?: { id: string; rows: { customId: string }[] } };
    expect({
      clearedByB: clearedByB.status,
      interruptedByB: interruptedByB.status,
      createdByB: createdByB.status,
      aId: a.job?.id,
      aRows: a.job?.rows.map((row) => row.customId),
      bId: b.job?.id,
      bRows: b.job?.rows.map((row) => row.customId),
    }).toEqual({ clearedByB: 409, interruptedByB: 409, createdByB: 200, aId: jobA, aRows: ["row-1"], bId: jobB, bRows: ["row-9"] });
  });

  // spec/app/gateway/batch.md, "Story: Run a resumable batch"
  it("resolves the console session wallet to the same batch instance as its bearer key", async () => {
    const handler = makeApp();
    const created = await handler(new Request("http://localhost/api/sonnely/batch", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sonnely_session=" + tokenA },
      body: JSON.stringify({ id: jobA, filename: "a.jsonl", customIds: ["row-1"] }),
    }));
    const sessionView = await (await get(handler, "/api/sonnely/batch", tokenA)).json() as { tag: string; job?: { id: string } };
    const bearerView = await (await batchRead(handler, apiTokenA)).json() as { tag: string; job?: { id: string } };
    const otherSession = await (await get(handler, "/api/sonnely/batch", tokenB)).json() as { tag: string };
    expect({
      created: created.status,
      sessionTag: sessionView.tag,
      sessionId: sessionView.job?.id,
      bearerTag: bearerView.tag,
      bearerId: bearerView.job?.id,
      otherTag: otherSession.tag,
    }).toEqual({ created: 200, sessionTag: "Running", sessionId: jobA, bearerTag: "Running", bearerId: jobA, otherTag: "Empty" });
  });

  function postMachine(handler: (request: Request) => Promise<Response>, machine: string, body: unknown, token: string) {
    return handler(new Request("http://localhost/api/machines/" + machine, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sonnely_session=" + token },
      body: JSON.stringify(body),
    }));
  }

  function keyEvent(overrides: Record<string, unknown> = {}) {
    return {
      type: "create",
      id: "key-new",
      label: "CI key",
      prefix: "sonnely_live_newkey",
      hash: "new-hash",
      project: "",
      scopes: ["inference"],
      cap: 0,
      dailyCap: 0,
      expiresAt: 0,
      now: 1,
      ...overrides,
    };
  }

  // spec/app/support.md, "Every ticket stays well formed and uniquely identified": a write that
  // the rules refuse answers the refusal alone — never the raw state another wallet's rows live in
  it("answers a refused write without the machine state, however the event is shaped", async () => {
    const handler = makeApp();
    const duplicateOpen = await postMachine(handler, "support", { type: "open", id: "ticket-a", email: "b@x.com", topic: "Billing", message: "help", wallet: walletB, now: 30 }, tokenB);
    const duplicateKey = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-a", prefix: "sonnely_live_key-a", hash: "hash-a" }), tokenB);
    const duplicateTeam = await postMachine(handler, "teams", { type: "createTeam", id: "team-a", name: "copycat", actor: walletB, now: 31 }, tokenB);
    const malformedKey = await postMachine(handler, "workspace-keys", { type: "create", id: "x" }, tokenB);
    const bodies = await Promise.all([duplicateOpen, duplicateKey, duplicateTeam, malformedKey].map(async (r) => JSON.stringify(await r.json())));
    expect({
      statuses: [duplicateOpen.status, duplicateKey.status, duplicateTeam.status, malformedKey.status],
      leak: bodies.some((body) => body.includes(walletA) || body.includes("internal note") || body.includes("team-a") || body.includes("hash-a") || body.includes('"state"')),
    }).toEqual({ statuses: [409, 409, 409, 400], leak: false });
  });

  // spec/app/teams.md, "A team, its members, invites and projects": a write that succeeds answers
  // the same projection a read does — the wallet's own rows, never another workspace's
  it("answers an accepted write with the requesting wallet's projected rows only", async () => {
    const handler = makeApp();
    const created = await postMachine(handler, "teams", { type: "createTeam", id: "team-b", name: "B's team", actor: walletB, now: 32 }, tokenB);
    const body = JSON.stringify(await created.json());
    const keyCreated = await postMachine(handler, "workspace-keys", keyEvent(), tokenB);
    const keyBody = JSON.stringify(await keyCreated.json());
    expect({
      status: created.status,
      teamsLeak: body.includes("team-a") || body.includes(walletA),
      teamsOwn: body.includes("team-b"),
      keyStatus: keyCreated.status,
      keyLeak: keyBody.includes("key-a") || keyBody.includes(walletA),
      keyOwn: keyBody.includes("key-new"),
    }).toEqual({ status: 200, teamsLeak: false, teamsOwn: true, keyStatus: 200, keyLeak: false, keyOwn: true });
  });

  // spec/app/admin/referrals.md, "Story: Invite a wallet"; spec/app/admin/crm.md, "Customer profiles are keyed by wallet":
  // the customer-facing events answer the wallet's own rows even when they succeed
  it("answers referral and profile writes with the wallet's own rows only", async () => {
    const handler = makeApp();
    await postMachine(handler, "admin-referrals", { type: "issueCode", code: "code-b", wallet: walletB }, tokenB);
    const issued = await postMachine(handler, "admin-referrals", { type: "issueCode", code: "code-a", wallet: walletA }, tokenA);
    const issuedBody = JSON.stringify(await issued.json());
    const saved = await postMachine(handler, "admin-crm", { type: "saveProfile", wallet: walletB, name: "B", username: "", joined: 1, onboarding: "pending", termsVersion: "", termsAcceptedAt: 0, inviter: "", now: 1 }, tokenB);
    const savedBody = JSON.stringify(await saved.json());
    const refused = await postMachine(handler, "admin-referrals", { type: "issueCode", code: "code-a2", wallet: walletA }, tokenA);
    const refusedBody = JSON.stringify(await refused.json());
    expect({
      issuedStatus: issued.status,
      issuedLeak: issuedBody.includes("code-b"),
      issuedOwn: issuedBody.includes("code-a"),
      savedStatus: saved.status,
      savedLeak: savedBody.includes(walletA),
      refusedLeak: refusedBody.includes("code-b") || refusedBody.includes('"state"'),
    }).toEqual({ issuedStatus: 200, issuedLeak: false, issuedOwn: true, savedStatus: 200, savedLeak: false, refusedLeak: false });
  });

  // spec/app/admin/operators.md, "Operator roles": roster membership is not a capability —
  // support cannot grant, suspend or adjust; finance cannot grant; only the admin role moderates
  it("refuses role-crossing privileged writes while allowing each role its own", async () => {
    const handler = makeApp();
    const supportGrant = await postMachine(handler, "admin", { type: "grant", wallet: walletOp, role: "Admin", at: 40 }, tokenOp);
    const supportSuspend = await postMachine(handler, "admin", { type: "suspend", id: walletA, at: 41 }, tokenOp);
    const supportNote = await postMachine(handler, "admin-crm", { type: "addNote", id: "note-1", account: walletA, actor: walletOp, note: "support snooping", now: 42 }, tokenOp);
    const supportAdjust = await handler(new Request("http://localhost/api/admin/adjust", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sonnely_session=" + tokenOp },
      body: JSON.stringify({ id: "adj-1", activityId: "act-1", account: walletA, delta: 1000, reason: "support should not adjust" }),
    }));
    const financeGrant = await postMachine(handler, "admin", { type: "grant", wallet: walletFin, role: "Admin", at: 43 }, tokenFin);
    const financeAdjust = await handler(new Request("http://localhost/api/admin/adjust", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sonnely_session=" + tokenFin },
      body: JSON.stringify({ id: "adj-2", activityId: "act-2", account: walletA, delta: 1000, reason: "finance goodwill credit" }),
    }));
    const adminNote = await postMachine(handler, "admin-crm", { type: "addNote", id: "note-2", account: walletA, actor: walletAdm, note: "admin review complete", now: 44 }, tokenAdm);
    expect({
      support: [supportGrant.status, supportSuspend.status, supportNote.status, supportAdjust.status],
      finance: [financeGrant.status, financeAdjust.status],
      adminNoteStatus: adminNote.status,
    }).toEqual({ support: [403, 403, 403, 403], finance: [403, 200], adminNoteStatus: 200 });
  });

  // spec/app/support.md, "The customer can reply on their request": a reply reaches only a ticket
  // the session wallet itself opened
  it("refuses a customer reply on another wallet's ticket", async () => {
    const handler = makeApp();
    const hostile = await post(handler, { type: "reply", id: "ticket-a", body: "intruder", now: 50 }, tokenB);
    const own = await post(handler, { type: "reply", id: "ticket-a", body: "more detail", now: 51 }, tokenA);
    const state = await (await get(handler, "/api/machines/support", tokenOp)).json() as { tickets: { replies: { author: string }[] }[] };
    expect({
      hostileStatus: hostile.status,
      ownStatus: own.status,
      replies: state.tickets[0]?.replies.length,
    }).toEqual({ hostileStatus: 403, ownStatus: 200, replies: 3 });
  });

  // spec/app/keys.md, "Story: Issue a key": project keys are project resources, so an ordinary
  // member cannot create one while an admin and the owner can
  it("lets only team owners and admins create project keys", async () => {
    const handler = makeApp();
    const inviteAdmin = await postMachine(handler, "teams", { type: "invite", teamId: "team-a", actor: walletA, wallet: walletB, role: "Admin", expiresAt: 1000, now: 1 }, tokenA);
    const acceptAdmin = await postMachine(handler, "teams", { type: "respond", teamId: "team-a", actor: walletB, accept: true, now: 2 }, tokenB);
    const inviteMember = await postMachine(handler, "teams", { type: "invite", teamId: "team-a", actor: walletA, wallet: walletFin, role: "Member", expiresAt: 1000, now: 3 }, tokenA);
    const acceptMember = await postMachine(handler, "teams", { type: "respond", teamId: "team-a", actor: walletFin, accept: true, now: 4 }, tokenFin);
    const member = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-member", prefix: "sonnely_live_member", hash: "member-hash", project: "proj-a" }), tokenFin);
    const admin = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-admin", prefix: "sonnely_live_admin", hash: "admin-hash", project: "proj-a" }), tokenB);
    const owner = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-owner", prefix: "sonnely_live_owner", hash: "owner-hash", project: "proj-a" }), tokenA);
    expect({
      setup: [inviteAdmin.status, acceptAdmin.status, inviteMember.status, acceptMember.status],
      member: member.status,
      admin: admin.status,
      owner: owner.status,
    }).toEqual({ setup: [200, 200, 200, 200], member: 403, admin: 200, owner: 200 });
  });

  // spec/app/keys.md, "Story: Revoke a key": the key owner can revoke it, and owners and admins
  // of the project team can revoke project keys as project resources
  it("lets key owners and project team managers revoke project keys", async () => {
    const handler = makeApp();
    const inviteAdmin = await postMachine(handler, "teams", { type: "invite", teamId: "team-a", actor: walletA, wallet: walletB, role: "Admin", expiresAt: 1000, now: 1 }, tokenA);
    const acceptAdmin = await postMachine(handler, "teams", { type: "respond", teamId: "team-a", actor: walletB, accept: true, now: 2 }, tokenB);
    const selfKey = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-self", prefix: "sonnely_live_self", hash: "self-hash", project: "proj-a" }), tokenB);
    const adminKey = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-admin-controlled", prefix: "sonnely_live_adminctl", hash: "admin-controlled-hash", project: "proj-a" }), tokenB);
    const ownerKey = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-owner-controlled", prefix: "sonnely_live_ownerctl", hash: "owner-controlled-hash", project: "proj-a" }), tokenA);
    const foreign = await postMachine(handler, "workspace-keys", { type: "revoke", id: "key-admin-controlled" }, tokenFin);
    const byOwner = await postMachine(handler, "workspace-keys", { type: "revoke", id: "key-admin-controlled" }, tokenA);
    const byAdmin = await postMachine(handler, "workspace-keys", { type: "revoke", id: "key-owner-controlled" }, tokenB);
    const bySelf = await postMachine(handler, "workspace-keys", { type: "revoke", id: "key-self" }, tokenB);
    const visible = await (await get(handler, "/api/machines/workspace-keys", tokenB)).json() as { keys: { id: string; status: string; project: string }[] };
    expect({
      setup: [inviteAdmin.status, acceptAdmin.status, selfKey.status, adminKey.status, ownerKey.status],
      revocation: [foreign.status, byOwner.status, byAdmin.status, bySelf.status],
      visible: visible.keys.map((key) => ({ id: key.id, status: key.status, project: key.project })),
    }).toEqual({
      setup: [200, 200, 200, 200, 200],
      revocation: [403, 200, 200, 200],
      visible: [
        { id: "key-b", status: "Active", project: "" },
        { id: "key-self", status: "Revoked", project: "proj-a" },
        { id: "key-admin-controlled", status: "Revoked", project: "proj-a" },
        { id: "key-owner-controlled", status: "Revoked", project: "proj-a" },
      ],
    });
  });

  // spec/app/teams.md, "Members can leave; an owner can remove anyone but an owner": removal and
  // demotion revoke only the target wallet's keys scoped to that team's projects
  it("revokes project keys when their creator is demoted or removed", async () => {
    const handler = makeApp();
    const inviteAdmin = await postMachine(handler, "teams", { type: "invite", teamId: "team-a", actor: walletA, wallet: walletB, role: "Admin", expiresAt: 1000, now: 1 }, tokenA);
    const acceptAdmin = await postMachine(handler, "teams", { type: "respond", teamId: "team-a", actor: walletB, accept: true, now: 2 }, tokenB);
    const workspaceKey = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-workspace", prefix: "sonnely_live_workspace", hash: "workspace-hash", project: "" }), tokenB);
    const demotedKey = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-demoted", prefix: "sonnely_live_demoted", hash: "demoted-hash", project: "proj-a" }), tokenB);
    const demote = await postMachine(handler, "teams", { type: "changeRole", teamId: "team-a", actor: walletA, wallet: walletB, role: "Member" }, tokenA);
    const afterDemotion = await (await get(handler, "/api/machines/workspace-keys", tokenB)).json() as { keys: { id: string; status: string }[] };
    const promote = await postMachine(handler, "teams", { type: "changeRole", teamId: "team-a", actor: walletA, wallet: walletB, role: "Admin" }, tokenA);
    const removedKey = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-removed", prefix: "sonnely_live_removed", hash: "removed-hash", project: "proj-a" }), tokenB);
    const remove = await postMachine(handler, "teams", { type: "removeMember", teamId: "team-a", actor: walletA, wallet: walletB }, tokenA);
    const afterRemoval = await (await get(handler, "/api/machines/workspace-keys", tokenB)).json() as { keys: { id: string; status: string }[] };
    const statuses = (rows: { id: string; status: string }[]) => Object.fromEntries(rows.map((row) => [row.id, row.status]));
    expect({
      setup: [inviteAdmin.status, acceptAdmin.status, workspaceKey.status, demotedKey.status, demote.status, promote.status, removedKey.status, remove.status],
      afterDemotion: statuses(afterDemotion.keys),
      afterRemoval: statuses(afterRemoval.keys),
    }).toEqual({
      setup: [200, 200, 200, 200, 200, 200, 200, 200],
      afterDemotion: { "key-b": "Active", "key-workspace": "Active", "key-demoted": "Revoked" },
      afterRemoval: { "key-b": "Active", "key-workspace": "Active", "key-demoted": "Revoked", "key-removed": "Revoked" },
    });
  });

  // spec/app/keys.md, "Story: Issue a key": a project-scoped key names only a project of a team
  // the wallet belongs to
  it("refuses a key scoped to another workspace's project", async () => {
    const handler = makeApp();
    const hostile = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-hostile", prefix: "sonnely_live_hostile", hash: "hostile-hash", project: "proj-a" }), tokenB);
    const own = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-own", prefix: "sonnely_live_ownproj", hash: "own-hash", project: "proj-a" }), tokenA);
    const unknown = await postMachine(handler, "workspace-keys", keyEvent({ id: "key-unknown", prefix: "sonnely_live_unknown", hash: "unknown-hash", project: "proj-missing" }), tokenA);
    expect({ hostile: hostile.status, own: own.status, unknown: unknown.status }).toEqual({ hostile: 403, own: 200, unknown: 403 });
  });

  // spec/app/admin/index.md, "Accounts are registered once": serving a wallet registers it, so an
  // operator can suspend and reinstate the account end to end
  // spec/app/admin/index.md, "What the admin reads elsewhere": the join is the shell's
  // operator-only read over the store itself — platform-wide rows, not the operator's own.
  it("answers the admin overview with the platform-wide join for operators only", async () => {
    const handler = makeApp();
    const customer = await get(handler, "/api/admin/overview", tokenA);
    const support = await get(handler, "/api/admin/overview", tokenOp);
    const admin = await get(handler, "/api/admin/overview", tokenAdm);
    const body = await admin.text();
    const joined = JSON.parse(body);
    expect({
      customerStatus: customer.status,
      supportStatus: support.status,
      adminStatus: admin.status,
      keysBothWallets: (joined.keys?.keys ?? []).map((row: { id: string }) => row.id).sort(),
      ledgerCoversA: (joined.billing?.entries ?? []).some((row: { wallet: string }) => row.wallet === walletA),
      ticketsJoined: (joined.support?.tickets ?? []).map((row: { id: string }) => row.id),
      registryPresent: joined.registry != undefined && Array.isArray(joined.registry?.ops?.roster),
      depositsJoined: (joined.deposits?.intents ?? []).some((row: { reference: string }) => row.reference === "ref-a"),
    }).toEqual({
      customerStatus: 403,
      supportStatus: 200,
      adminStatus: 200,
      keysBothWallets: ["key-a", "key-b"],
      ledgerCoversA: true,
      ticketsJoined: ["ticket-a"],
      registryPresent: true,
      depositsJoined: true,
    });
  });

// spec/app/admin/index.md, "Accounts are registered once": the shell registers a workspace at first sight, and moderation then works end to end.
  it("registers a wallet the first time it is served and moderates it end to end", async () => {
    const handler = makeApp();
    await get(handler, "/api/machines/teams", tokenB);
    const seen = await (await get(handler, "/api/machines/admin", tokenAdm)).json() as { records: { id: string; status: string }[] };
    const suspended = await postMachine(handler, "admin", { type: "suspend", id: walletB, at: 60 }, tokenAdm);
    const duringSuspension = await (await get(handler, "/api/machines/admin", tokenAdm)).json() as { records: { id: string; status: string }[] };
    const reinstated = await postMachine(handler, "admin", { type: "reinstate", id: walletB, at: 61 }, tokenAdm);
    const after = await (await get(handler, "/api/machines/admin", tokenAdm)).json() as { records: { id: string; status: string }[] };
    expect({
      registered: seen.records.some((row) => row.id === walletB && row.status === "Active"),
      suspendStatus: suspended.status,
      during: duringSuspension.records.find((row) => row.id === walletB)?.status,
      reinstateStatus: reinstated.status,
      after: after.records.find((row) => row.id === walletB)?.status,
    }).toEqual({ registered: true, suspendStatus: 200, during: "Suspended", reinstateStatus: 200, after: "Active" });
  });

  function readToEnd(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number) {
    const collected: string[] = [];
    const decoder = new TextDecoder();
    const reading = (async () => {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return "done";
        collected.push(decoder.decode(chunk.value, { stream: true }));
      }
    })();
    const expiry = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));
    return Promise.race([reading, expiry]).then((outcome) => ({ outcome, text: collected.join("") }));
  }

  // spec/app/session.md, "Only an active session can sign out": signing out ends the streams the
  // session opened — the connection closes and no further frame crosses it
  it("terminates a wallet's machine stream when its session signs out", async () => {
    const handler = makeApp();
    const stream = await get(handler, "/api/machines/console__chat/stream", tokenA);
    expect(stream.status).toBe(200);
    const reader = stream.body!.getReader();
    const first = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))]);
    const opening = first && !first.done ? new TextDecoder().decode(first.value) : "";
    await handler(new Request("http://localhost/api/session/signout", {
      method: "POST",
      headers: { cookie: "sonnely_session=" + tokenA },
    }));
    const rest = await readToEnd(reader, 5000);
    expect({
      openedLive: opening.includes("secret prompt"),
      outcome: rest.outcome,
      deliveredAfterSignOut: rest.text,
    }).toEqual({ openedLive: true, outcome: "done", deliveredAfterSignOut: "" });
  }, 15_000);

  // spec/app/session.md, "Expiry closes open challenges and active sessions": a session that
  // expires mid-stream ends delivery — another wallet's writes never reach the expired stream
  it("ends delivery on a stream whose session expires while open", async () => {
    const { handler } = makeAppWithDir(false, [], 900);
    const stream = await get(handler, "/api/machines/stream", tokenA);
    expect(stream.status).toBe(200);
    const reader = stream.body!.getReader();
    const first = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))]);
    const opening = first && !first.done ? new TextDecoder().decode(first.value) : "";
    await new Promise((resolve) => setTimeout(resolve, 1400));
    await postMachine(handler, "teams", { type: "createTeam", id: "team-b-expiry", name: "B expiry team", actor: walletB, now: 70 }, tokenB);
    const rest = await readToEnd(reader, 5000);
    expect({
      openedLive: opening.includes("data: "),
      outcome: rest.outcome,
      leak: rest.text.includes("team-b-expiry"),
    }).toEqual({ openedLive: true, outcome: "done", leak: false });
  }, 15_000);
});
