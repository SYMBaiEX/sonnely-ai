import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import * as Session from "../gen/app__session.effect.vibe";
import * as Admin from "../gen/app__admin.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as Deposits from "../gen/app__billing__deposits.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Support from "../gen/app__support.effect.vibe";
import * as Keyring from "../gen/app__gateway__keyring.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import * as WorkspaceKeys from "../gen/app__keys.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import * as Admin from "../gen/app__admin.effect.vibe";
import { billingApi } from "../src/api/billing.vibe";
import { teamsApi } from "../src/api/teams.vibe";
import { supportApi } from "../src/api/support.vibe";
import { gatewayApi } from "../src/api/gateway.vibe";
import { fleetMachineApi } from "../src/machines.vibe";
import { fleetLive } from "../src/fleet.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";

const walletA = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const walletB = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const walletOp = "4vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2d";
const tokenA = "row-security-session-a";
const tokenB = "row-security-session-b";
const tokenOp = "row-security-session-op";
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

function writeSessions(dir: string) {
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [
      { digest: sessionDigest(tokenA), nonce: "nonce", wallet: walletA, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
      { digest: sessionDigest(tokenB), nonce: "nonce", wallet: walletB, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
      { digest: sessionDigest(tokenOp), nonce: "nonce", wallet: walletOp, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
    ],
  }));
  writeFileSync(join(dir, "admin"), JSON.stringify({
    ops: { roster: [{ wallet: walletOp, role: "Support" }] },
    records: [],
    audit: [],
  }));
}

function seed(dir: string) {
  writeFileSync(join(dir, "billing-ledger"), JSON.stringify({
    balance: 4900,
    entries: [
      { wallet: walletA, kind: "Credit", detail: "deposit-a", amount: 5000 },
      { wallet: walletA, kind: "Reserve", detail: "run-a", amount: 100 },
    ],
  }));
  writeFileSync(join(dir, "billing-deposits"), JSON.stringify({
    intents: [{ reference: "ref-a", wallet: walletA, asset: "USDC", amount: 5, atomic: 5_000_000, createdAt: 1, expiresAt: 2, status: { tag: "Pending" } }],
  }));
  writeFileSync(join(dir, "teams"), JSON.stringify({
    teams: [{ id: "team-a", name: "A's team", members: [{ wallet: walletA, role: "Owner" }], invites: [], projects: [] }],
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
  }));
}

function makeApp() {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-row-security-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeSessions(dir);
  seed(dir);
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const apis = Layer.mergeAll(
    billingApi,
    teamsApi,
    supportApi,
    gatewayApi,
    fleetMachineApi("console__chat", { events: ["newChat", "send"] }),
  );
  const state = Layer.provideMerge(
    Layer.mergeAll(
      Ledger.stored("billing-ledger"),
      Deposits.stored("billing-deposits"),
      Teams.stored("teams"),
      Support.stored("support"),
      Session.stored("session"),
      Keyring.stored("keys"),
      Requests.stored("gateway-requests"),
      WorkspaceKeys.stored("workspace-keys"),
      Usage.stored("usage"),
      Admin.stored("admin"),
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
  return app.handler;
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

  // spec/app/teams.md, "A team, its members, invites and projects"
  it("shows teams only to their members", async () => {
    const handler = makeApp();
    const a = await (await get(handler, "/api/machines/teams", tokenA)).json() as { teams: unknown[] };
    const b = await (await get(handler, "/api/machines/teams", tokenB)).json() as { teams: unknown[] };
    expect({ a: a.teams.length, b: b.teams.length }).toEqual({ a: 1, b: 0 });
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
});
