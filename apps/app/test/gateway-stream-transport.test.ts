import { createServer, type RequestListener, type Server } from "node:http";
import { Effect, Layer, Scope } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { NodeHttpServer } from "@effect/platform-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Admin from "../gen/app__admin.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as WorkspaceKeys from "../gen/app__keys.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import { inferChat, inferSpecialized } from "../src/api/gateway.vibe";
import { chatSseNodeResponse, chatSseResponse, upstreamTimeouts, type StreamFinal } from "../src/api/gateway/providers.ts";

const wallet = "stream-transport-wallet";

const stateLayer = () =>
  Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceKeys.stored("stream-transport-keys"),
      Teams.stored("stream-transport-teams"),
      Ledger.stored("stream-transport-ledger"),
      Usage.stored("stream-transport-usage"),
      Requests.stored("stream-transport-requests"),
      Admin.stored("stream-transport-admin"),
    ),
    KeyValueStore.layerMemory,
  );

const listen = (listener: RequestListener) =>
  new Promise<Server>((resolve) => {
    const server = createServer(listener);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

const close = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });

const sseUpstream = (events: string[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEAR_AI_API_KEY;
  delete process.env.PHALA_AI_API_KEY;
  delete process.env.TINFOIL_API_KEY;
});

describe("gateway stream transport", () => {
  // spec/app/gateway/requests.md, "Story: Serve a metered completion"
  it("serves a live provider stream through the Node HTTP server", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://cloud-api.near.ai/v1/chat/completions") {
        return Promise.resolve(new Response(sseUpstream([
          'data: {"id":"node-stream","object":"chat.completion.chunk","created":1,"choices":[{"index":0,"delta":{"content":"transport"},"finish_reason":null}]}\n\n',
          'data: {"id":"node-stream","object":"chat.completion.chunk","created":1,"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n',
          "data: [DONE]\n\n",
        ]), { status: 200, headers: { "content-type": "text/event-stream" } }));
      }
      return realFetch(input, init);
    });
    const program = Effect.scoped(Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "transport-key", label: "Inference", prefix: "sonnely_live_transport", hash: "transport-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "transport-deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const app = inferChat({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }], stream: true, stream_options: { include_usage: true } }, key, wallet, "transport-ref");
      const scope = yield* Scope.Scope;
      const handler = yield* NodeHttpServer.makeHandler(app, { scope });
      const server = yield* Effect.acquireRelease(
        Effect.promise(() => listen((request, response) => handler(request, response))),
        (open) => Effect.promise(() => close(open)),
      );
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error("missing server address");
      const response = yield* Effect.promise(() => globalThis.fetch(`http://127.0.0.1:${address.port}/`, { headers: { accept: "text/event-stream" } }));
      const text = yield* Effect.promise(() => response.text());
      return { status: response.status, text };
    }));
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    expect(result.status).toBe(200);
    expect(result.text).toContain("data: [DONE]");
    expect(result.text).toContain('"content":"transport"');
    expect(result.text).toContain('"prompt_tokens":4');
  });

  // spec/app/gateway/requests.md, "Story: Serve a metered completion"
  it("cancels upstream and settles an incomplete stream once when the client disconnects", async () => {
    const encoder = new TextEncoder();
    let upstreamCancels = 0;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":"cancelled-stream","object":"chat.completion.chunk","created":1,"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n'));
      },
      cancel() {
        upstreamCancels += 1;
      },
    });
    const settlements: Array<StreamFinal | undefined> = [];
    const streamed = chatSseNodeResponse({
      upstream,
      model: "requested/model",
      includeUsage: true,
      rememberId: () => undefined,
      settle: (usage) => {
        settlements.push(usage);
        return Promise.resolve(undefined);
      },
    });
    const firstChunk = new Promise<unknown>((resolve) => streamed.body.once("data", resolve));
    streamed.body.resume();
    await firstChunk;
    streamed.body.destroy();
    await streamed.finished;
    expect(upstreamCancels).toBeGreaterThan(0);
    expect(settlements).toEqual([undefined]);
  });

  // spec/app/gateway/requests.md, "Story: Serve a metered completion"
  it("emits one SSE error and settles incomplete usage once when upstream fails mid-stream", async () => {
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":"failed-stream","object":"chat.completion.chunk","created":1,"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n'));
        controller.error(new Error("upstream reset"));
      },
    });
    const settlements: Array<StreamFinal | undefined> = [];
    const streamed = chatSseResponse({
      upstream,
      model: "requested/model",
      includeUsage: true,
      rememberId: () => undefined,
      settle: (usage) => {
        settlements.push(usage);
        return Promise.resolve(undefined);
      },
    });
    const text = await streamed.response.text();
    await streamed.finished;
    expect(text).toContain('"type":"sonnely_error"');
    expect(text).toContain('"code":502');
    expect(settlements).toEqual([undefined]);
  });

  // FACTORY-R1 A1: a stream that goes silent must not hold the reserve open.
  it("kills an upstream stream that sends no chunk within the idle timeout", async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      let upstreamCancels = 0;
      const upstream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"id":"idle-stream","object":"chat.completion.chunk","created":1,"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n'));
        },
        cancel() {
          upstreamCancels += 1;
        },
      });
      const settlements: Array<StreamFinal | undefined> = [];
      const streamed = chatSseResponse({
        upstream,
        model: "requested/model",
        includeUsage: true,
        rememberId: () => undefined,
        settle: (usage) => {
          settlements.push(usage);
          return Promise.resolve(undefined);
        },
      });
      const reading = streamed.response.text();
      await vi.advanceTimersByTimeAsync(upstreamTimeouts.streamIdleMs + 1_000);
      const text = await reading;
      await streamed.finished;
      expect(text).toContain('"type":"sonnely_error"');
      expect(upstreamCancels).toBeGreaterThan(0);
      expect(settlements).toEqual([undefined]);
    } finally {
      vi.useRealTimers();
    }
  });

  // spec/app/docs/index.md, "Request references and retries": a repeat answers 409 without reserving again.
  it("deduplicates specialized endpoint retries by Idempotency-Key", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://cloud-api.near.ai/v1/embeddings") {
        return Promise.resolve(new Response(
          JSON.stringify({ object: "list", data: [{ object: "embedding", embedding: [0.5], index: 0 }], usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ));
      }
      return realFetch(input, init);
    });
    const program = Effect.scoped(Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "idem-key", label: "Inference", prefix: "sonnely_live_idem", hash: "idem-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "idem-deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const app = inferSpecialized("embeddings", "Embeddings", "Qwen/Qwen3-Embedding-0.6B", { model: "Qwen/Qwen3-Embedding-0.6B", input: "hello" }, key, "", "initial-ref");
      const scope = yield* Scope.Scope;
      const handler = yield* NodeHttpServer.makeHandler(app, { scope });
      const server = yield* Effect.acquireRelease(
        Effect.promise(() => listen((request, response) => handler(request, response))),
        (open) => Effect.promise(() => close(open)),
      );
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error("missing server address");
      const post = (idempotencyKey: string) => globalThis.fetch(`http://127.0.0.1:${address.port}/`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ model: "Qwen/Qwen3-Embedding-0.6B", input: "hello" }),
      });
      const usage = yield* Usage.Machine;
      const first = yield* Effect.promise(() => post("retry-token-abc"));
      yield* Effect.promise(() => first.text());
      const second = yield* Effect.promise(() => post("retry-token-abc"));
      const secondBody = yield* Effect.promise(() => second.json() as Promise<{ error?: { message?: string; param?: unknown; code?: unknown } }>);
      const third = yield* Effect.promise(() => post("retry-token-other"));
      yield* Effect.promise(() => third.text());
      return {
        statuses: { first: first.status, second: second.status, third: third.status },
        firstRef: first.headers.get("x-sonnely-request-id"),
        secondRef: second.headers.get("x-sonnely-request-id"),
        secondError: secondBody.error,
        usage,
      };
    }));
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    const rows = await Effect.runPromise(Effect.gen(function* () {
      return (yield* result.usage.get()).rows;
    }));
    expect(result.statuses).toEqual({ first: 200, second: 409, third: 200 });
    expect(rows).toHaveLength(2);
    expect(result.secondRef).toBe(result.firstRef);
    expect(result.secondError).toMatchObject({ param: null, code: null });
  });

  // spec/app/docs/index.md, "Embeddings, decisions, images, and audio": every endpoint accepts max_cost_microusd.
  it("enforces max_cost_microusd on multipart endpoints", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    let upstreamCalls = 0;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://cloud-api.near.ai/v1/images/edits") {
        upstreamCalls += 1;
        return Promise.resolve(new Response(
          JSON.stringify({ created: 1, data: [{ b64_json: "aGVsbG8=" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ));
      }
      return realFetch(input, init);
    });
    const program = Effect.scoped(Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "multipart-key", label: "Inference", prefix: "sonnely_live_multipart", hash: "multipart-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "multipart-deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const app = inferSpecialized("images/edits", "ImageEdits", "black-forest-labs/FLUX.2-klein-4B", undefined, key, "", "multipart-ref");
      const scope = yield* Scope.Scope;
      const handler = yield* NodeHttpServer.makeHandler(app, { scope });
      const server = yield* Effect.acquireRelease(
        Effect.promise(() => listen((request, response) => handler(request, response))),
        (open) => Effect.promise(() => close(open)),
      );
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error("missing server address");
      const post = (maxCost?: string) => {
        const form = new FormData();
        form.set("model", "black-forest-labs/FLUX.2-klein-4B");
        form.set("prompt", "make it brighter");
        form.set("image", new File([new Uint8Array([1, 2, 3])], "pixel.png", { type: "image/png" }));
        if (maxCost !== undefined) form.set("max_cost_microusd", maxCost);
        return globalThis.fetch(`http://127.0.0.1:${address.port}/`, { method: "POST", body: form });
      };
      const under = yield* Effect.promise(() => post("100"));
      yield* Effect.promise(() => under.text());
      const invalid = yield* Effect.promise(() => post("abc"));
      yield* Effect.promise(() => invalid.text());
      const over = yield* Effect.promise(() => post("100000"));
      yield* Effect.promise(() => over.text());
      return { under: under.status, invalid: invalid.status, over: over.status };
    }));
    const statuses = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    expect(statuses).toEqual({ under: 400, invalid: 400, over: 200 });
    expect(upstreamCalls).toBe(1);
  });

  // spec/app/docs/index.md, "Embeddings, decisions, images, and audio": reranking optionally accepts top_n.
  it("serves rerank requests with top_n and slices the results", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://cloud-api.near.ai/v1/rerank") {
        return Promise.resolve(new Response(
          JSON.stringify({ object: "list", results: [{ index: 0, relevance_score: 0.9 }, { index: 1, relevance_score: 0.4 }], usage: { prompt_tokens: 9, completion_tokens: 0, total_tokens: 9 } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ));
      }
      return realFetch(input, init);
    });
    const program = Effect.scoped(Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "rerank-key", label: "Inference", prefix: "sonnely_live_rerank", hash: "rerank-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "rerank-deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const app = inferSpecialized("rerank", "Rerank", "Qwen/Qwen3-Reranker-0.6B", { model: "Qwen/Qwen3-Reranker-0.6B", query: "q", documents: ["a", "b"], top_n: 1 }, key, "", "rerank-ref");
      const scope = yield* Scope.Scope;
      const handler = yield* NodeHttpServer.makeHandler(app, { scope });
      const server = yield* Effect.acquireRelease(
        Effect.promise(() => listen((request, response) => handler(request, response))),
        (open) => Effect.promise(() => close(open)),
      );
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error("missing server address");
      const response = yield* Effect.promise(() => globalThis.fetch(`http://127.0.0.1:${address.port}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "Qwen/Qwen3-Reranker-0.6B", query: "q", documents: ["a", "b"], top_n: 1 }),
      }));
      const body = yield* Effect.promise(() => response.json() as Promise<{ results?: unknown[] }>);
      return { status: response.status, results: body.results?.length };
    }));
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    expect(result).toEqual({ status: 200, results: 1 });
  });
});
