// spec/app/console/chat.md, "Story: Converse with a model": on staging a deterministic local
// responder, in production the inference gateway — production never fake-serves.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import * as Session from "../gen/app__session.effect.vibe";
import * as Admin from "../gen/app__admin.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as WorkspaceKeys from "../gen/app__keys.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import * as Referrals from "../gen/app__admin__referrals.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import { chatApi } from "../src/api/console/chat.vibe";
import { fleetLive } from "../src/fleet.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";

const wallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const token = "playground-session-token";
const cleanups: Array<() => void | Promise<void>> = [];

function makeApp() {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-playground-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [
      { digest: sessionDigest(token), nonce: "nonce", wallet, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
    ],
  }));
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const state = Layer.provideMerge(
    Layer.mergeAll(
      Session.stored("session"),
      WorkspaceKeys.stored("playground-keys"),
      Teams.stored("playground-teams"),
      Ledger.stored("playground-ledger"),
      Usage.stored("playground-usage"),
      Requests.stored("playground-requests"),
      Admin.stored("playground-admin"),
      Referrals.stored("playground-referrals"),
      fleetLive,
    ),
    store(dir),
  );
  const appLayer = Layer.provideMerge(chatApi, state).pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
  );
  const app = HttpRouter.toWebHandler(appLayer);
  cleanups.push(() => app.dispose());
  return app.handler;
}

function postEmbeddings(handler: (request: Request) => Promise<Response>) {
  return handler(new Request("http://localhost/api/console/playground/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "sonnely_session=" + token },
    body: JSON.stringify({ model: "Qwen/Qwen3-Embedding-0.6B", input: "hello" }),
  }));
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  delete process.env.NODE_ENV;
  delete process.env.VERCEL_ENV;
});

describe("playground inference honesty", () => {
  it("serves the deterministic staged answer outside production", async () => {
    const handler = makeApp();
    const response = await postEmbeddings(handler);
    const body = await response.json() as { object?: string };
    expect({ status: response.status, provider: response.headers.get("x-sonnely-provider"), object: body.object }).toEqual({
      status: 200,
      provider: "staging",
      object: "list",
    });
  });

  it("refuses honestly in production instead of fake-serving unmetered output", async () => {
    process.env.NODE_ENV = "production";
    const handler = makeApp();
    const response = await postEmbeddings(handler);
    const body = await response.text();
    expect({
      status: response.status,
      provider: response.headers.get("x-sonnely-provider"),
      staged: body.includes("deterministic output"),
    }).toEqual({
      status: 503,
      provider: null,
      staged: false,
    });
  });
});
