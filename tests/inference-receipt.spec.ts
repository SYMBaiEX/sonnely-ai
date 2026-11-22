import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mock } from "node:test";
import { expect, test } from "@playwright/test";
import { Wallet } from "ethers";
import { NextRequest } from "next/server";
import { POST } from "../app/api/sonnely/v1/chat/completions/route";
import { api } from "../convex/_generated/api";
import { models } from "../lib/models";
import { requestCharge } from "../lib/pricing";
import { infer } from "../lib/inference";
import { readSse } from "../lib/sse";
import { backend, hash } from "../lib/server";

const model = models[0];
const messages = [{ role: "user", content: "Say hello in Japanese." }];
const completionId = "chatcmpl-receipt-test";
const body =
  JSON.stringify(
    {
      id: completionId,
      object: "chat.completion",
      created: 1,
      model: model.id,
      choices: [{ index: 0, message: { role: "assistant", content: "こんにちは" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 25 } },
    },
    null,
    2,
  ) + "\n";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function fundedKey(baseURL: string | undefined) {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Local Convex fixture");
  process.loadEnvFile(".env.local");
  if (!process.env.CONVEX_URL?.startsWith("http://127.0.0.1:")) throw new Error("Local Convex required");

  const { db, secret } = backend();
  const apiKey = "sonnely_live_" + randomBytes(32).toString("base64url");
  const auth = { secret, session: hash(randomUUID()) };
  await db.mutation(api.sonnely.signIn, {
    ...auth,
    wallet: randomUUID(),
    nonce: randomUUID(),
    referral: randomUUID(),
    expires: Date.now() + 60_000,
  });
  const reference = randomUUID();
  const balance = 10_000;
  await db.mutation(api.sonnely.createDeposit, {
    ...auth,
    reference,
    amount: balance,
    recipient: "fixture",
    mint: "fixture",
    cluster: "mainnet",
  });
  await db.mutation(api.sonnely.confirmDeposit, { ...auth, reference, signature: randomUUID() });
  await db.mutation(api.sonnely.createKey, {
    ...auth,
    hash: hash(apiKey),
    name: "Receipt test",
    prefix: apiKey.slice(0, 19),
    cap: null,
    dailyCap: null,
    expires: null,
  });
  return { db, auth, apiKey, balance };
}

test("opt-in receipts match wire bytes and the settled Convex charge", async ({ baseURL }) => {
  const { db, auth, apiKey, balance } = await fundedKey(baseURL);

  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NEAR_AI_API_KEY: "mock-provider-key",
    VERCEL_ENV: "",
    SONNELY_PUBLIC_INFERENCE: "false",
  };
  const originalFetch = globalThis.fetch;
  const inferenceId = randomUUID();
  const signer = Wallet.createRandom();
  let scenario: "provider_tee" | "gateway" | "tampered" | "forged" | "unavailable" = "provider_tee";
  let sentBody = "";
  let noAliasing: string | null = null;
  let evidenceFetches = 0;
  const providerFetch = mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.origin !== "https://cloud-api.near.ai") return originalFetch(input, init);
      if (url.pathname === "/v1/chat/completions") {
        noAliasing = new Headers(init?.headers).get("x-no-aliasing");
        sentBody = String(init?.body);
        return new Response(body, { headers: { "inference-id": inferenceId } });
      }
      if (
        url.pathname !== "/v1/signature/" + completionId ||
        url.searchParams.get("signing_algo") !== "ecdsa"
      ) {
        throw new Error("Unexpected provider URL");
      }
      evidenceFetches++;
      if (scenario === "unavailable") return Response.json({ error_code: "missing" }, { status: 404 });
      const signatureKind = scenario === "gateway" || scenario === "tampered" ? "gateway" : "provider_tee";
      const requestHash = sha(sentBody);
      const responseHash = scenario === "tampered" ? sha(body.trim()) : sha(body);
      const text =
        (signatureKind === "provider_tee" ? model.id + ":" : "") + requestHash + ":" + responseHash;
      const signature = await signer.signMessage(text);
      return Response.json({
        signature_kind: signatureKind,
        signing_algo: "ecdsa",
        signing_address: scenario === "forged" ? "a".repeat(40) : signer.address.slice(2),
        signature: signature.slice(2),
        text,
      });
    },
  );

  function submit(receipt?: string, key = apiKey) {
    return POST(
      new NextRequest("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
          ...(receipt ? { "X-Sonnely-Receipt": receipt } : {}),
        },
        body: JSON.stringify({ messages, model: model.id, max_tokens: 1 }),
      }),
    );
  }

  try {
    expect((await submit("v2")).status).toBe(400);
    expect((await submit("v1", "")).status).toBe(401);
    const ordinary = await submit();
    expect(ordinary.status).toBe(200);
    expect(noAliasing).toBeNull();
    expect(await ordinary.json()).not.toHaveProperty("sonnely_receipt");
    expect(evidenceFetches).toBe(0);

    const response = await submit("v1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(noAliasing).toBe("true");
    const receipt = (await response.json()).sonnely_receipt;
    const cost = requestCharge(model, 50, 25, 10);
    expect(receipt).toMatchObject({
      version: "v1",
      provider: "near-ai",
      requested_model: model.id,
      reported_model: model.id,
      provider_completion_id: completionId,
      billing_reference: inferenceId,
      charged_microusd: cost,
      cached_input_tokens: 25,
      upstream_request_sha256: sha(sentBody),
      upstream_response_sha256: sha(body),
      evidence: { status: "signature_matched", signature_kind: "provider_tee" },
    });
    expect(JSON.stringify(receipt)).not.toContain(messages[0].content);
    expect(JSON.stringify(receipt)).not.toContain("こんにちは");
    expect(JSON.stringify(receipt)).not.toContain(apiKey);

    for (const [nextScenario, expected] of [
      ["gateway", { status: "signature_matched", signature_kind: "gateway" }],
      ["tampered", { status: "payload_mismatch" }],
      ["forged", { status: "invalid_signature" }],
      ["unavailable", { status: "unavailable" }],
    ] as const) {
      scenario = nextScenario;
      const next = await submit("v1");
      expect(next.status).toBe(200);
      expect((await next.json()).sonnely_receipt.evidence).toMatchObject(expected);
    }
    expect(evidenceFetches).toBe(5);
    const account = await db.query(api.sonnely.consoleLive, { ...auth, since: 0 });
    expect(account?.balance).toBe(balance - cost * 6);
    expect(account?.rows.map(({ cost, status }) => ({ cost, status }))).toEqual(
      Array(6).fill({ cost, status: "complete" }),
    );
  } finally {
    providerFetch.mock.restore();
    process.env = originalEnv;
  }
});

test("streams settle once from terminal usage, including after disconnect", async ({ baseURL }) => {
  const { db, auth, apiKey, balance } = await fundedKey(baseURL);
  const previous = process.env;
  process.env = {
    ...previous,
    NEAR_AI_API_KEY: "fixture-key",
    VERCEL_ENV: "",
    SONNELY_PUBLIC_INFERENCE: "false",
  };
  const encode = new TextEncoder();
  const originalFetch = globalThis.fetch;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const mockProvider = mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== "https://cloud-api.near.ai/v1/chat/completions") return originalFetch(url, init);
      expect(JSON.parse(String(init?.body))).toMatchObject({
        stream: true,
        stream_options: { include_usage: true },
      });
      return new Response(
        new ReadableStream({
          start(value) {
            controller = value;
          },
        }),
        {
          headers: { "Content-Type": "text/event-stream", "inference-id": randomUUID() },
        },
      );
    },
  );
  const tokenUsage = {
    prompt_tokens: 50,
    completion_tokens: 10,
    prompt_tokens_details: { cached_tokens: 25 },
  };
  const cost = requestCharge(model, 50, 25, 10);
  const frame = (payload: object) =>
    "data: " +
    JSON.stringify({
      id: completionId,
      object: "chat.completion.chunk",
      created: 1,
      model: "vendor-alias",
      ...payload,
    }) +
    "\r\n\r\n";
  const send = (value: string) => controller.enqueue(encode.encode(value));
  let finished: Promise<void>;
  async function begin(include_usage: boolean) {
    const response = await infer(
      {
        model: model.id,
        messages,
        stream: true,
        stream_options: { include_usage },
        max_tokens: 40,
      },
      { hash: hash(apiKey) },
      false,
      (job) => {
        finished = job;
      },
    );
    if (!(response instanceof Response) || !response.body) throw new Error("Expected a response stream.");
    return readSse(response.body);
  }
  const readRemaining = async (stream: AsyncGenerator<string>) => {
    const frames = [];
    for await (const value of stream) frames.push(value);
    return frames;
  };
  try {
    const response = await begin(true);
    const chunk = encode.encode(frame({ choices: [{ index: 0, delta: { content: "雪" } }] }));
    const split = chunk.indexOf(0xe9) + 1;
    controller.enqueue(chunk.subarray(0, split));
    controller.enqueue(chunk.subarray(split));
    const initial = await response.next();
    expect(JSON.parse(initial.value!)).toMatchObject({
      model: model.id,
      choices: [{ delta: { content: "雪" } }],
      usage: null,
    });
    const pending = await db.query(api.sonnely.consoleLive, { ...auth, since: 0 });
    expect(pending?.rows[0].status).toBe("pending");
    send(frame({ choices: [], usage: tokenUsage }) + "data: [DONE]\r\n\r\n");
    controller.close();
    const rest = await readRemaining(response);
    expect(rest).toHaveLength(2);
    expect(JSON.parse(rest[0])).toMatchObject({ usage: { ...tokenUsage, total_tokens: 60 } });
    expect(rest[1]).toBe("[DONE]");
    expect((await db.query(api.sonnely.consoleLive, { ...auth }))?.balance).toBe(balance - cost);

    const interrupted = await begin(false);
    send(frame({ choices: [{ index: 0, delta: { content: "First" }, finish_reason: null }] }));
    expect(JSON.parse((await interrupted.next()).value!)).not.toHaveProperty("usage");
    await interrupted.return(undefined);
    send(frame({ choices: [], usage: tokenUsage }) + "data: [DONE]\n\n");
    controller.close();
    await finished!;
    expect((await db.query(api.sonnely.consoleLive, { ...auth }))?.balance).toBe(balance - cost * 2);

    const incomplete = await begin(true);
    send(frame({ choices: [{ index: 0, delta: { content: "Partial" }, finish_reason: null }] }));
    controller.close();
    const frames = await readRemaining(incomplete);
    expect(frames).not.toContain("[DONE]");
    expect(JSON.parse(frames.at(-1)!)).toHaveProperty("error");
    const state = await db.query(api.sonnely.consoleLive, { ...auth, since: 0 });
    expect(state?.rows.filter((row) => row.status === "complete")).toHaveLength(2);
    expect(state?.rows.find((row) => row.status === "unreported")).toMatchObject({ input: 0, output: 0 });
  } finally {
    mockProvider.mock.restore();
    process.env = previous;
  }
});

test("Phala is pinned, fail-closed, and metered separately in Convex", async ({ baseURL }) => {
  const { db, auth, apiKey, balance } = await fundedKey(baseURL);
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NEAR_AI_API_KEY: "near-test-key",
    PHALA_AI_API_KEY: "phala-test-key",
    VERCEL_ENV: "",
    SONNELY_PUBLIC_INFERENCE: "false",
  };
  const originalFetch = globalThis.fetch;
  const upstreamModel = "deepseek/deepseek-v4.1-flash-1017";
  const receiptId = "rcpt-fixture";
  const phalaBody = JSON.stringify({
    ...JSON.parse(body),
    model: upstreamModel,
    usage: { prompt_tokens: 50, completion_tokens: 10, cost: 0.000027 },
  });
  let sent = "";
  let target = "phala-777";
  let calls = 0;
  let nearCalls = 0;
  const mocked = mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.origin === "https://cloud-api.near.ai") {
        nearCalls++;
        return new Response(null, { status: 500 });
      }
      if (url.origin !== "https://inference.phala.com") return originalFetch(input, init);
      if (url.pathname === "/v1/chat/completions") {
        calls++;
        sent = String(init?.body);
        return new Response(phalaBody, { headers: { "x-receipt-id": receiptId } });
      }
      expect(url.pathname).toBe("/v1/aci/receipts/" + receiptId);
      return Response.json({
        api_version: "aci/1",
        receipt_id: receiptId,
        chat_id: completionId,
        model: upstreamModel,
        workload_keyset_digest: "sha256:" + "a".repeat(64),
        event_log: [
          { type: "request.received", body_hash: "sha256:" + sha(sent) },
          { type: "route.selected", target_route_id: target + ":" + upstreamModel },
          {
            type: "upstream.verified",
            result: "verified",
            required: true,
            session_id: "fixture",
            model_id: upstreamModel,
          },
          { type: "response.returned", body_hash: "sha256:" + sha(phalaBody) },
        ],
      });
    },
  );

  function submit(overrides: Record<string, unknown> = {}) {
    return POST(
      new NextRequest("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
          "X-Sonnely-Receipt": "v1",
        },
        body: JSON.stringify({
          messages,
          model: model.id,
          max_tokens: 32,
          provider: { only: ["phala"] },
          ...overrides,
        }),
      }),
    );
  }

  try {
    expect((await submit({ max_cost_microusd: 1 })).status).toBe(400);
    expect((await submit({ model: models[1].id })).status).toBe(404);
    expect(calls).toBe(0);
    const ok = await submit({ max_cost_microusd: 1_000 });
    expect(ok.status).toBe(200);
    expect(JSON.parse(sent)).toMatchObject({
      model: upstreamModel,
      provider: { only: ["phala"], allow_fallbacks: false, aci_verified: true },
    });
    const cost = requestCharge(model, 50, 0, 10);
    const result = await ok.json();
    expect(result.usage).not.toHaveProperty("cost");
    expect(result.sonnely_receipt).toMatchObject({
      provider: "phala",
      requested_model: model.id,
      charged_microusd: cost,
      billing_reference: "phala:" + receiptId,
      evidence: { status: "aci_payload_matched", operator_route: "phala-777:" + upstreamModel },
    });

    target = "near-ai-777";
    expect((await submit()).status).toBe(502);
    expect(nearCalls).toBe(0);
    const account = await db.query(api.sonnely.consoleLive, { ...auth, since: 0 });
    expect(account?.balance).toBe(balance - cost);
    expect(account?.rows).toHaveLength(2);
    expect(account?.rows).toContainEqual(
      expect.objectContaining({ provider: "phala", status: "complete", cost }),
    );
    expect(account?.rows).toContainEqual(
      expect.objectContaining({ provider: "phala", status: "failed", cost: 0 }),
    );
  } finally {
    mocked.mock.restore();
    process.env = originalEnv;
  }
});

test("idempotent API retries return the original request reference without a second charge", async ({
  baseURL,
}) => {
  const { db, auth, apiKey, balance } = await fundedKey(baseURL);
  const previous = process.env.NEAR_AI_API_KEY;
  process.env.NEAR_AI_API_KEY = "fixture-key";
  const originalFetch = globalThis.fetch;
  const id = randomUUID();
  let calls = 0;
  const provider = mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== "https://cloud-api.near.ai/v1/chat/completions") return originalFetch(url, init);
      calls++;
      return new Response(body, { headers: { "Content-Type": "application/json", "inference-id": id } });
    },
  );
  function submit() {
    return POST(
      new NextRequest("http://127.0.0.1/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
          "Idempotency-Key": id,
        },
        body: JSON.stringify({ model: model.id, messages, max_tokens: 40 }),
      }),
    );
  }
  try {
    const replies = await Promise.all([submit(), submit()]);
    const accepted = replies.find(({ status }) => status === 200);
    const duplicate = replies.find(({ status }) => status === 409);
    expect(accepted).toBeDefined();
    expect(duplicate).toBeDefined();
    expect(duplicate!.headers.get("x-sonnely-request-id")).toBe(
      accepted!.headers.get("x-sonnely-request-id"),
    );
    expect(calls).toBe(1);
    const snapshot = await db.query(api.sonnely.consoleLive, { ...auth, since: 0 });
    expect(snapshot?.rows).toHaveLength(1);
    expect(snapshot?.balance).toBe(balance - requestCharge(model, 50, 25, 10));
  } finally {
    provider.mock.restore();
    if (previous === undefined) delete process.env.NEAR_AI_API_KEY;
    else process.env.NEAR_AI_API_KEY = previous;
  }
});
