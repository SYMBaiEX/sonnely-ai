// spec/app/console/chat.md, "Story: Converse with a model"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import * as Session from "../gen/app__session.effect.vibe";
import { fleetMachineApi } from "../src/machines.vibe";
import { fleetLive } from "../src/fleet.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";

const walletA = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const tokenA = "console-chat-session-a";
const cleanups: Array<() => void | Promise<void>> = [];

function makeApp() {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-console-chat-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [
      { digest: sessionDigest(tokenA), nonce: "nonce", wallet: walletA, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
    ],
  }));
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const apis = Layer.mergeAll(
    fleetMachineApi("console__chat", { events: ["newChat", "pickModel", "send", "reply", "edit", "open", "remove", "clearAll"] }),
  );
  const state = Layer.provideMerge(
    Layer.mergeAll(Session.stored("session"), fleetLive),
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

function post(handler: (request: Request) => Promise<Response>, body: unknown) {
  return handler(new Request("http://localhost/api/machines/console__chat", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "sonnely_session=" + tokenA },
    body: JSON.stringify(body),
  }));
}

function readState(handler: (request: Request) => Promise<Response>) {
  return handler(new Request("http://localhost/api/machines/console__chat", {
    headers: { cookie: "sonnely_session=" + tokenA },
  })).then((response) => response.json() as Promise<{ active: string; threads: { id: string; messages: { role: string; content: string }[] }[] }>);
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("console chat turns", () => {
  // spec/app/console/chat.md, "Sending takes one turn at a time": the answer to a send can die
  // before any reply arrives — a dropped stream, a stopped answer with nothing streamed, a closed
  // tab. The question is still waiting, so the next send re-asks it rather than being refused.
  it("re-asks an unanswered turn instead of deadlocking the thread", async () => {
    const handler = makeApp();
    const first = await post(handler, { type: "send", id: "thread-x", model: "m", text: "hello" });
    const again = await post(handler, { type: "send", id: "thread-x", model: "m", text: "are you there" });
    const state = await readState(handler);
    expect({
      first: first.status,
      again: again.status,
      messages: state.threads[0]?.messages.map((m) => [m.role, m.content]),
    }).toEqual({
      first: 200,
      again: 200,
      messages: [["User", "are you there"]],
    });
  });

  // spec/app/console/chat.md, "Every thread alternates a user turn with an assistant turn"
  it("appends a new user turn once the model has answered", async () => {
    const handler = makeApp();
    await post(handler, { type: "send", id: "thread-x", model: "m", text: "hello" });
    await post(handler, { type: "reply", id: "thread-x", model: "m", text: "hi there" });
    const next = await post(handler, { type: "send", id: "thread-x", model: "m", text: "how are you" });
    const state = await readState(handler);
    expect({
      next: next.status,
      messages: state.threads[0]?.messages.map((m) => [m.role, m.content]),
    }).toEqual({
      next: 200,
      messages: [["User", "hello"], ["Assistant", "hi there"], ["User", "how are you"]],
    });
  });

  // spec/app/console/chat.md, "An earlier user message can be edited and sent again":
  // retrying after a failure edits the waiting question and the thread keeps alternating.
  it("keeps alternation when an edit re-asks the last user message", async () => {
    const handler = makeApp();
    await post(handler, { type: "send", id: "thread-x", model: "m", text: "hello" });
    await post(handler, { type: "reply", id: "thread-x", model: "m", text: "hi there" });
    await post(handler, { type: "send", id: "thread-x", model: "m", text: "how are you" });
    const retried = await post(handler, { type: "edit", id: "thread-x", index: 2, text: "how are you" });
    const answered = await post(handler, { type: "reply", id: "thread-x", model: "m", text: "well" });
    const state = await readState(handler);
    expect({
      retried: retried.status,
      answered: answered.status,
      messages: state.threads[0]?.messages.map((m) => [m.role, m.content]),
    }).toEqual({
      retried: 200,
      answered: 200,
      messages: [["User", "hello"], ["Assistant", "hi there"], ["User", "how are you"], ["Assistant", "well"]],
    });
  });

  // spec/app/console/chat.md, "Story: Erase what the workspace keeps"
  it("erases the whole server-side history on clearAll, and again on an empty one", async () => {
    const handler = makeApp();
    await post(handler, { type: "send", id: "thread-x", model: "m", text: "hello" });
    await post(handler, { type: "reply", id: "thread-x", model: "m", text: "hi there" });
    await post(handler, { type: "send", id: "thread-y", model: "m", text: "second conversation" });
    const cleared = await post(handler, { type: "clearAll" });
    const state = await readState(handler);
    const again = await post(handler, { type: "clearAll" });
    expect({
      cleared: cleared.status,
      threads: state.threads.length,
      active: state.active,
      again: again.status,
    }).toEqual({
      cleared: 200,
      threads: 0,
      active: "",
      again: 200,
    });
  });
});
