import { Readable } from "node:stream";
import { text as readStreamText } from "node:stream/consumers";
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as WorkspaceKeys from "../gen/app__keys.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import { inferChat } from "../src/api/gateway.vibe";
import { callChatCandidates, chatSseResponse, upstreamTimeouts, type ChatRoute, type StreamFinal } from "../src/api/gateway/providers.ts";

const wallet = "test-wallet";
const stateLayer = () =>
  Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceKeys.stored("inference-test-keys"),
      Teams.stored("inference-test-teams"),
      Ledger.stored("inference-test-ledger"),
      Usage.stored("inference-test-usage"),
      Requests.stored("inference-test-requests"),
    ),
    KeyValueStore.layerMemory,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEAR_AI_API_KEY;
  delete process.env.PHALA_AI_API_KEY;
  delete process.env.TINFOIL_API_KEY;
});

describe("gateway inference", () => {
  // spec/app/gateway/requests.md, "Story: Serve a metered completion"
  it("sends a NEAR-shaped upstream request and settles usage instead of the whole reserve", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    const calls: { url: string; authorization: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
        authorization: new Headers(init?.headers).get("authorization") ?? "",
        body: JSON.parse(typeof init?.body === "string" ? init.body : "") as Record<string, unknown>,
      });
      return Promise.resolve(new Response(
        JSON.stringify({
          id: "chatcmpl-provider",
          object: "chat.completion",
          created: 1,
          model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
          choices: [{ index: 0, message: { role: "assistant", content: "metered" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { "content-type": "application/json", "inference-id": crypto.randomUUID() } },
      ));
    });
    const program = Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send(
        {
          type: "create",
          id: "key-1",
          label: "Inference",
          prefix: "sonnely_live_test",
          hash: "key-hash",
          project: "",
          scopes: ["inference"],
          cap: 0,
          dailyCap: 0,
          expiresAt: 0,
          now: 1,
        },
        wallet,
      );
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const response = yield* inferChat(
        {
          model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
          messages: [{ role: "user", content: "hello" }],
          max_tokens: 32,
        },
        key,
        wallet,
        "request-ref",
      );
      const usage = yield* Usage.Machine;
      const rows = (yield* usage.get()).rows;
      const ledgerRows = (yield* ledger.get()).entries;
      const keyAfter = (yield* keys.get()).keys[0];
      return { response, rows, ledgerRows, keyAfter };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    expect(result.response.status).toBe(200);
    expect(calls[0]?.url).toBe("https://cloud-api.near.ai/v1/chat/completions");
    expect(calls[0]?.authorization).toBe("Bearer test-provider-key");
    expect(calls[0]?.body.model).toBe("deepseek-ai/DeepSeek-V4.1-Flash-1017");
    expect(calls[0]?.body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.status).toBe("Complete");
    expect(result.rows[0]?.input).toBe(10);
    expect(result.rows[0]?.output).toBe(5);
    expect(result.rows[0]?.cost).toBeGreaterThan(0);
    expect(result.keyAfter?.spent).toBe(result.rows[0]?.cost);
    expect(result.ledgerRows.some((entry) => entry.kind === "Reserve")).toBe(true);
    expect(result.ledgerRows.some((entry) => entry.kind === "Charge" && entry.amount === result.rows[0]?.cost)).toBe(true);
  });

  // spec/app/gateway/requests.md, "Story: Serve a metered completion"
  it("forwards OpenAI stream chunks and settles terminal usage once", async () => {
    const sse = [
      'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1,"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
      'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1,"choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1,"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    const body = new Response(sse).body;
    if (!body) throw new Error("missing stream");
    let final: StreamFinal | undefined;
    const streamed = chatSseResponse({
      upstream: body,
      model: "requested/model",
      includeUsage: true,
      rememberId: () => undefined,
      settle: (usage) => {
        final = usage;
        return Promise.resolve(undefined);
      },
    });
    const text = await streamed.response.text();
    await streamed.finished;
    expect(text).toContain('"model":"requested/model"');
    expect(text).toContain('"content":"hello"');
    expect(text).toContain('"prompt_tokens":3');
    expect(text).toContain("data: [DONE]");
    expect(final?.usage.prompt_tokens).toBe(3);
    expect(final?.usage.completion_tokens).toBe(2);
  });

  // spec/app/gateway/requests.md, "Story: Serve a metered completion"
  it("settles streamed terminal usage after the client consumes the stream", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":"upstream-stream","object":"chat.completion.chunk","created":1,"model":"deepseek-ai/DeepSeek-V4.1-Flash-1017","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"id":"upstream-stream","object":"chat.completion.chunk","created":1,"model":"deepseek-ai/DeepSeek-V4.1-Flash-1017","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(upstream, { status: 200, headers: { "content-type": "text/event-stream", "inference-id": "inference-stream" } }))));
    const program = Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "key-stream", label: "Inference", prefix: "sonnely_live_stream", hash: "stream-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const response = yield* inferChat({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }], stream: true, stream_options: { include_usage: true } }, key, wallet, "stream-ref");
      const usage = yield* Usage.Machine;
      const requests = yield* Requests.Machine;
      return { response, ledger, usage, requests, keys };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    const body = result.response.body;
    if (body._tag !== "Raw" || !(body.body instanceof Readable)) throw new Error("expected a stream response");
    const streamed = await readStreamText(body.body);
    const state = await Effect.runPromise(Effect.gen(function* () {
      return {
        rows: (yield* result.usage.get()).rows,
        ledgerRows: (yield* result.ledger.get()).entries,
        requests: (yield* result.requests.get()).requests,
        key: (yield* result.keys.get()).keys[0],
      };
    }));
    const cost = state.rows[0]?.cost ?? 0;
    expect(streamed).toContain('"content":"hi"');
    expect(streamed).toContain('"prompt_tokens":10');
    expect(streamed).toContain("data: [DONE]");
    expect(state.rows[0]).toMatchObject({ id: "stream-ref", input: 10, output: 2, status: "Complete" });
    expect(state.requests[0]).toMatchObject({ ref: "stream-ref", status: "Complete", charged: cost, emitted: 2 });
    expect(state.key?.spent).toBe(cost);
    expect(state.ledgerRows.some((entry) => entry.kind === "Charge" && entry.amount === cost)).toBe(true);
    expect(state.ledgerRows.some((entry) => entry.kind === "Release" && entry.amount > 0)).toBe(true);
  });

  // FACTORY-R1 A1: a hung provider must never hold a credit reserve open.
  it("aborts a chat candidate that never sends response headers", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
      }));
      const route: ChatRoute = {
        provider: "near-ai",
        key: "test-provider-key",
        upstreamModel: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
        privacyRoute: "private-tee",
        rate: { endpoint: "chat/completions", modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", input: 1, cache: -1, output: 1, request: -1, session: -1 },
        estimate: 1,
      };
      const attempt = callChatCandidates({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }] }, [route], "secret");
      const rejection = expect(attempt).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(upstreamTimeouts.headersMs);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  // FACTORY-R1 A1: a hung provider must never hold a credit reserve open.
  it("answers 502 and charges nothing when the provider never responds", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
      }));
      const program = Effect.gen(function* () {
        const keys = yield* WorkspaceKeys.Machine;
        yield* keys.send({ type: "create", id: "key-timeout", label: "Inference", prefix: "sonnely_live_timeout", hash: "timeout-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
        const ledger = yield* Ledger.Machine;
        yield* ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 });
        const key = (yield* keys.get()).keys[0];
        if (!key) throw new Error("missing key");
        const response = yield* inferChat({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }] }, key, wallet, "timeout-ref");
        return { response, ledger };
      });
      const running = Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
      await vi.advanceTimersByTimeAsync(upstreamTimeouts.headersMs);
      const result = await running;
      const ledgerRows = await Effect.runPromise(Effect.gen(function* () {
        return (yield* result.ledger.get()).entries;
      }));
      expect(result.response.status).toBe(502);
      expect(ledgerRows.some((entry) => entry.kind === "Charge" && entry.amount > 0)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

});
