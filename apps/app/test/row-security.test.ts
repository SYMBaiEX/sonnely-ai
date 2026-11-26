import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import * as Session from "../gen/app__session.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as Deposits from "../gen/app__billing__deposits.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Support from "../gen/app__support.effect.vibe";
import { billingApi } from "../src/api/billing.vibe";
import { teamsApi } from "../src/api/teams.vibe";
import { supportApi } from "../src/api/support.vibe";
import { fleetMachineApi } from "../src/machines.vibe";
import { fleetLive } from "../src/fleet.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";

const walletA = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const walletB = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const tokenA = "row-security-session-a";
const tokenB = "row-security-session-b";
const cleanups: Array<() => void | Promise<void>> = [];

function writeSessions(dir: string) {
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [
      { digest: sessionDigest(tokenA), nonce: "nonce", wallet: walletA, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
      { digest: sessionDigest(tokenB), nonce: "nonce", wallet: walletB, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
    ],
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
    fleetMachineApi("console__chat", { events: ["newChat", "send"] }),
  );
  const state = Layer.provideMerge(
    Layer.mergeAll(
      Ledger.stored("billing-ledger"),
      Deposits.stored("billing-deposits"),
      Teams.stored("teams"),
      Support.stored("support"),
      Session.stored("session"),
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
});
