// spec/app/console/chat.md, "Story: Converse with a model": on staging a deterministic local
// responder, in production the inference gateway — production never fake-serves.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it, vi } from "vitest";
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
const chatModel = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
const cleanups: Array<() => void | Promise<void>> = [];

function makeApp(seed?: (dir: string) => void) {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-playground-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [
      { digest: sessionDigest(token), nonce: "nonce", wallet, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
    ],
  }));
  seed?.(dir);
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

function seedPlainChat(dir: string, plain: boolean) {
  writeFileSync(join(dir, encodeURIComponent("console:" + wallet)), JSON.stringify({ name: "", username: "", theme: "Dark", plain }));
  writeFileSync(join(dir, encodeURIComponent("console__chat:" + wallet)), JSON.stringify({
    threads: [{ id: "thread-plain", model: chatModel, messages: [{ role: "User", content: "hello", model: chatModel }] }],
    active: "thread-plain",
    model: chatModel,
  }));
  writeFileSync(join(dir, "playground-ledger"), JSON.stringify({
    balance: 100_000,
    entries: [{ wallet, kind: "Credit", detail: "seed", amount: 100_000 }],
  }));
}

function postChat(handler: (request: Request) => Promise<Response>, path: "reply" | "stream") {
  return handler(new Request("http://localhost/api/console/chat/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "sonnely_session=" + token },
    body: JSON.stringify({ id: "thread-plain", model: chatModel }),
  }));
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
  delete process.env.NEAR_AI_API_KEY;
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

  it("prepends the plain-writing instruction only when the workspace chooses it (spec/app/console/index.md, \"The plain-writing choice toggles\")", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    type CapturedChat = { stream?: boolean; messages: { role: string; content: string }[] };
    const calls: CapturedChat[] = [];
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as CapturedChat;
      calls.push(payload);
      if (payload.stream === true) {
        const sse = [
          `data: ${JSON.stringify({ id: "plain-stream", object: "chat.completion.chunk", created: 1, model: chatModel, choices: [{ index: 0, delta: { content: "hi" }, finish_reason: null }] })}\n\n`,
          `data: ${JSON.stringify({ id: "plain-stream", object: "chat.completion.chunk", created: 1, model: chatModel, choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } })}\n\n`,
          "data: [DONE]\n\n",
        ].join("");
        return Promise.resolve(new Response(sse, { status: 200, headers: { "content-type": "text/event-stream", "inference-id": crypto.randomUUID() } }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        id: "plain-reply",
        object: "chat.completion",
        created: 1,
        model: chatModel,
        choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
      }), { status: 200, headers: { "content-type": "application/json", "inference-id": crypto.randomUUID() } }));
    });
    const observations = [];
    for (const plain of [true, false]) {
      const handler = makeApp((dir) => seedPlainChat(dir, plain));
      for (const path of ["reply", "stream"] as const) {
        calls.length = 0;
        const response = await postChat(handler, path);
        if (path === "stream") await response.text();
        const sent = calls[0]?.messages ?? [];
        observations.push({ plain, path, status: response.status, first: sent[0], count: sent.length });
      }
    }
    const system = { role: "system", content: "Answer in concise, clear language." };
    const user = { role: "user", content: "hello" };
    expect(observations).toEqual([
      { plain: true, path: "reply", status: 200, first: system, count: 2 },
      { plain: true, path: "stream", status: 200, first: system, count: 2 },
      { plain: false, path: "reply", status: 200, first: user, count: 1 },
      { plain: false, path: "stream", status: 200, first: user, count: 1 },
    ]);
  });
});
