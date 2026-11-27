import { Readable } from "node:stream";
import { text as readStreamText } from "node:stream/consumers";
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Admin from "../gen/app__admin.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as WorkspaceKeys from "../gen/app__keys.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import * as Referrals from "../gen/app__admin__referrals.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import { inferChat, openMeter, settleMeter } from "../src/api/gateway.vibe";
import { callChatCandidates, chatSseResponse, keyStatusPayload, parseSpecialized, sliceTopResults, upstreamTimeouts, type ChatRoute, type StreamFinal } from "../src/api/gateway/providers.ts";

const wallet = "test-wallet";
const stateLayer = () =>
  Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceKeys.stored("inference-test-keys"),
      Teams.stored("inference-test-teams"),
      Ledger.stored("inference-test-ledger"),
      Usage.stored("inference-test-usage"),
      Requests.stored("inference-test-requests"),
      Admin.stored("inference-test-admin"),
      Referrals.stored("inference-test-referrals"),
    ),
    KeyValueStore.layerMemory,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEAR_AI_API_KEY;
  delete process.env.PHALA_AI_API_KEY;
  delete process.env.TINFOIL_API_KEY;
  delete process.env.VERCEL_ENV;
  delete process.env.SONNELY_PUBLIC_INFERENCE;
});

describe("gateway inference", () => {
  // spec/app/gateway/requests.md, "A served request": batch chat rows are marked apart from direct chat.
  it("marks a batch chat completion in the request ledger", async () => {
    const program = Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "key-batch", label: "Inference", prefix: "sonnely_live_batch", hash: "batch-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const response = yield* inferChat({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }] }, key, wallet, "batch-row-ref", false, "BatchChatCompletions");
      const requests = yield* Requests.Machine;
      return { status: response.status, endpoint: (yield* requests.get()).requests[0]?.endpoint };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    expect(result).toEqual({ status: 200, endpoint: "BatchChatCompletions" });
  });

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

  // spec/app/usage.md, "A pending request can fail or go under review": a stream dying after serving part of its answer captures only the prorated charge, never the whole reserve.
  it("captures a prorated charge under review when the stream dies after serving content", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":"upstream-partial","object":"chat.completion.chunk","created":1,"model":"deepseek-ai/DeepSeek-V4.1-Flash-1017","choices":[{"index":0,"delta":{"content":"partial answer here"},"finish_reason":null}]}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(upstream, { status: 200, headers: { "content-type": "text/event-stream", "inference-id": "inference-partial" } }))));
    const program = Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "key-partial", label: "Inference", prefix: "sonnely_live_partial", hash: "partial-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const response = yield* inferChat({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }], stream: true }, key, wallet, "partial-ref");
      const usage = yield* Usage.Machine;
      const requests = yield* Requests.Machine;
      return { response, ledger, usage, requests, keys };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    const body = result.response.body;
    if (body._tag !== "Raw" || !(body.body instanceof Readable)) throw new Error("expected a stream response");
    await readStreamText(body.body).catch(() => "");
    const state = await Effect.runPromise(Effect.gen(function* () {
      return {
        rows: (yield* result.usage.get()).rows,
        ledgerRows: (yield* result.ledger.get()).entries,
        requests: (yield* result.requests.get()).requests,
        key: (yield* result.keys.get()).keys[0],
      };
    }));
    const row = state.rows[0];
    const reserved = state.ledgerRows.find((entry) => entry.kind === "Reserve")?.amount ?? 0;
    expect(row?.status).toBe("Unreported");
    expect(row?.output).toBe(Math.ceil("partial answer here".length / 4));
    expect(row?.input).toBeGreaterThan(0);
    expect(row?.cost).toBeGreaterThan(0);
    expect(row?.cost).toBeLessThan(reserved);
    expect(state.key?.spent).toBe(row?.cost);
    expect(state.ledgerRows.some((entry) => entry.kind === "Charge" && entry.amount === row?.cost)).toBe(true);
    expect(state.requests[0]).toMatchObject({ ref: "partial-ref", status: "Complete", charged: row?.cost });
  });

  // spec/app/gateway/requests.md, "A request that cannot be served fails without a charge"
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

  // spec/app/gateway/requests.md, "A request that cannot be served fails without a charge"
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

  // spec/app/gateway/requests.md, "A request that cannot be served fails without a charge"
  it("fails closed with 503 and no reservation in production when no provider is configured", async () => {
    process.env.VERCEL_ENV = "production";
    const program = Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "key-prod", label: "Inference", prefix: "sonnely_live_prod", hash: "prod-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const response = yield* inferChat({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }] }, key, wallet, "prod-ref");
      const usage = yield* Usage.Machine;
      return { response, ledger, usage };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    const state = await Effect.runPromise(Effect.gen(function* () {
      return { ledgerRows: (yield* result.ledger.get()).entries, rows: (yield* result.usage.get()).rows };
    }));
    expect(result.response.status).toBe(503);
    expect(state.ledgerRows.some((entry) => entry.kind === "Reserve" || entry.kind === "Charge")).toBe(false);
    expect(state.rows).toHaveLength(0);
  });

  // spec/app/gateway/requests.md, "Story: Serve a metered completion"
  it("still serves a metered staging answer outside production when no provider is configured", async () => {
    delete process.env.VERCEL_ENV;
    const program = Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "key-staging", label: "Inference", prefix: "sonnely_live_staging", hash: "staging-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const response = yield* inferChat({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }] }, key, wallet, "staging-ref");
      return { response, ledger };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    const ledgerRows = await Effect.runPromise(Effect.gen(function* () {
      return (yield* result.ledger.get()).entries;
    }));
    expect(result.response.status).toBe(200);
    expect(result.response.headers["x-sonnely-provider"]).toBe("staging");
    expect(ledgerRows.some((entry) => entry.kind === "Charge" && entry.amount > 0)).toBe(true);
  });

  // spec/app/admin/index.md, "Only an active account can be suspended": suspension stops inference.
  it("refuses session-wallet inference with 403 for a suspended account and serves an active one", async () => {
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(
      JSON.stringify({
        id: "chatcmpl-provider",
        object: "chat.completion",
        created: 1,
        model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
        choices: [{ index: 0, message: { role: "assistant", content: "metered" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { "content-type": "application/json", "inference-id": crypto.randomUUID() } },
    )));
    const input = { model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hello" }] };
    const program = Effect.gen(function* () {
      const admin = yield* Admin.Machine;
      yield* admin.send({ type: "grant", wallet: "op-wallet", role: "Admin", at: 1 }, "op-wallet");
      yield* admin.send({ type: "register", id: wallet, subject: "User", at: 2 }, "op-wallet");
      yield* admin.send({ type: "register", id: "active-wallet", subject: "User", at: 2 }, "op-wallet");
      yield* admin.send({ type: "suspend", id: wallet, at: 3 }, "op-wallet");
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "deposit-suspended", amount: 100_000 });
      yield* ledger.send({ type: "credit", wallet: "active-wallet", detail: "deposit-active", amount: 100_000 });
      const suspended = yield* inferChat(input, undefined, wallet, "suspended-ref");
      const active = yield* inferChat(input, undefined, "active-wallet", "active-ref");
      return { suspended, active, ledger };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    const ledgerRows = await Effect.runPromise(Effect.gen(function* () {
      return (yield* result.ledger.get()).entries;
    }));
    expect(result.suspended.status).toBe(403);
    expect(result.active.status).toBe(200);
    expect(ledgerRows.some((entry) => entry.wallet === wallet && (entry.kind === "Reserve" || entry.kind === "Charge"))).toBe(false);
  });

  // spec/app/usage.md, "Rows are never removed and settled rows never change": a repeated settlement is a no-op, never a double refund.
  it("settles a meter exactly once when the settlement saga is retried", async () => {
    const program = Effect.gen(function* () {
      const keys = yield* WorkspaceKeys.Machine;
      yield* keys.send({ type: "create", id: "saga-key", label: "Inference", prefix: "sonnely_live_saga", hash: "saga-hash", project: "", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, now: 1 }, wallet);
      const ledger = yield* Ledger.Machine;
      yield* ledger.send({ type: "credit", wallet, detail: "saga-deposit", amount: 100_000 });
      const key = (yield* keys.get()).keys[0];
      if (!key) throw new Error("missing key");
      const opened = yield* openMeter("saga-ref", wallet, key, "ChatCompletions", "deepseek-ai/DeepSeek-V4.1-Flash-1017", false, 1_000);
      if ("refused" in opened) throw new Error("meter refused");
      const first = yield* settleMeter(opened.meter, 10, 5, -1, 200, 40);
      const second = yield* settleMeter(opened.meter, 10, 5, -1, 200, 40);
      const usage = yield* Usage.Machine;
      const requests = yield* Requests.Machine;
      return { first, second, keys, ledger, usage, requests };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
    const state = await Effect.runPromise(Effect.gen(function* () {
      return {
        key: (yield* result.keys.get()).keys[0],
        ledgerRows: (yield* result.ledger.get()).entries,
        rows: (yield* result.usage.get()).rows,
        requests: (yield* result.requests.get()).requests,
      };
    }));
    expect(result.first).toEqual({ served: true, charged: 200 });
    expect(result.second).toEqual({ served: true, charged: 200 });
    expect(state.key?.spent).toBe(200);
    expect(state.ledgerRows.filter((entry) => entry.kind === "Charge" && entry.amount === 200)).toHaveLength(1);
    expect(state.rows.filter((row) => row.id === "saga-ref" && row.status === "Complete")).toHaveLength(1);
    expect(state.requests[0]).toMatchObject({ ref: "saga-ref", status: "Complete", charged: 200 });
  });

  // spec/app/keys.md, "A key record and its lifetime": budgets in micro-USD with resets_at.
  it("serializes the documented key status budgets and expiry", () => {
    const payload = keyStatusPayload(
      { label: "Production", prefix: "sonnely_live_abc", status: "Active", cap: 50_000, dailyCap: 10_000, expiresAt: 1_800_000_000_000, spent: 7_000, dayKey: "2026-01-15", daySpent: 2_000 },
      Date.UTC(2026, 0, 15, 10, 30),
    );
    expect(payload).toEqual({
      prefix: "sonnely_live_abc",
      status: "Active",
      spendLimit: 50_000,
      spent: 7_000,
      name: "Production",
      expires_at_ms: 1_800_000_000_000,
      daily: { cap_microusd: 10_000, used_microusd: 2_000, remaining_microusd: 8_000, resets_at: "2026-01-16T00:00:00.000Z" },
      lifetime: { cap_microusd: 50_000, used_microusd: 7_000, remaining_microusd: 43_000 },
    });
  });

  // spec/app/keys.md, "A key record and its lifetime": unlimited caps and their remainders are null.
  it("serializes unlimited budgets and missing expiry as null and zeroes stale daily spend", () => {
    const payload = keyStatusPayload(
      { label: "Dev", prefix: "sonnely_live_dev", status: "Active", cap: 0, dailyCap: 0, expiresAt: 0, spent: 3_000, dayKey: "2026-01-14", daySpent: 2_000 },
      Date.UTC(2026, 0, 15, 10, 30),
    );
    expect(payload).toMatchObject({
      expires_at_ms: null,
      daily: { cap_microusd: null, used_microusd: 0, remaining_microusd: null },
      lifetime: { cap_microusd: null, remaining_microusd: null },
    });
  });

  // spec/app/gateway/requests.md, "Story: Serve a metered completion": Responses accepts instructions with stream/store false.
  it("accepts the documented Responses fields and rejects live streaming or storage", () => {
    const accepted = parseSpecialized("responses", { model: "tinfoil/gpt-oss-120b", input: "hello", instructions: "be brief", store: false, stream: false });
    const streaming = parseSpecialized("responses", { model: "tinfoil/gpt-oss-120b", input: "hello", stream: true });
    const storing = parseSpecialized("responses", { model: "tinfoil/gpt-oss-120b", input: "hello", store: true });
    expect([accepted.ok, streaming.ok, storing.ok]).toEqual([true, false, false]);
  });

  // spec/app/gateway/requests.md, "Story: Serve a metered completion": reranking optionally accepts top_n.
  it("accepts rerank top_n and slices results to it", () => {
    const parsed = parseSpecialized("rerank", { model: "Qwen/Qwen3-Reranker-0.6B", query: "q", documents: ["a", "b"], top_n: 1 });
    const sliced = sliceTopResults("rerank", { results: [{ index: 0 }, { index: 1 }], usage: { prompt_tokens: 1, completion_tokens: 0 } }, 1);
    expect([parsed.ok, (sliced.results as unknown[]).length, "usage" in sliced]).toEqual([true, 1, true]);
  });

});
