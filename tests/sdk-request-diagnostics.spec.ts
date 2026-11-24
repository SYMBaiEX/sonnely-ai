import { expect, test } from "@playwright/test";
import {
  Sonnely,
  SonnelyError,
  type CompletionRequest,
  type ModelList,
  type ResponseMetadata,
} from "../sdk/typescript/src/index";

const request: CompletionRequest = {
  model: "z-ai/glm-5.3-flash",
  messages: [{ role: "user", content: "Say hello." }],
};
const requestId = "fixture-request";
const fixtureKey = "fixture-key";

async function readStream(stream: AsyncIterable<unknown>) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

test("TypeScript completion and stream forward idempotency keys and expose request IDs", async () => {
  const sent: RequestInit[] = [];
  const onResponse = (metadata: ResponseMetadata) => observed.push(metadata);
  const observed: ResponseMetadata[] = [];
  const completion = { id: "provider-id", sonnely_request_id: requestId };
  const chunk = { id: "provider-id", choices: [] };
  const client = new Sonnely({
    apiKey: fixtureKey,
    fetch: async (_, init) => {
      sent.push(init!);
      const headers = { "X-Sonnely-Request-Id": requestId };
      return JSON.parse(String(init?.body)).stream
        ? new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers })
        : Response.json(completion, { headers });
    },
  });

  const result = await client.complete(request, { idempotencyKey: "example-complete", onResponse });
  expect(result).toEqual(completion);
  expect(result.sonnely_request_id).toBe(requestId);
  expect(await readStream(client.stream(request, { idempotencyKey: "example-stream", onResponse }))).toEqual([
    chunk,
  ]);
  expect(sent.map(({ headers }) => new Headers(headers).get("Idempotency-Key"))).toEqual([
    "example-complete",
    "example-stream",
  ]);
  expect(observed).toEqual(Array(2).fill({ requestId, retryAfter: null }));
});

test("TypeScript forwards ordered failover and exposes the serving provider and model capabilities", async () => {
  const model = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
  const route = {
    provider: "phala",
    provider_name: "Phala",
    upstream_model: model,
    private_failover: true,
    capabilities: { tools: true, structured_outputs: false },
    price_usd_per_million: { input: 0.3, cache: 0.1, output: 0.8 },
  } as const;
  const catalog: ModelList = {
    object: "list",
    data: [
      {
        id: model,
        object: "model",
        created: 0,
        owned_by: "near-ai",
        tier: "confidential",
        privacy_route: "private-tee",
        routes: [route],
      },
    ],
  };
  const sent: CompletionRequest["provider"][] = [];
  const observed: ResponseMetadata[] = [];
  const client = new Sonnely({
    apiKey: fixtureKey,
    fetch: async (url, init) => {
      if (String(url).endsWith("/models")) return Response.json(catalog);
      const body = JSON.parse(String(init?.body));
      sent.push(body.provider);
      const headers = { "X-Sonnely-Request-Id": requestId, "X-Sonnely-Provider": "phala" };
      return body.stream
        ? new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n', { headers })
        : Response.json({ sonnely_provider: "phala" }, { headers });
    },
  });
  const onResponse = (metadata: ResponseMetadata) => observed.push(metadata);
  const result = await client.complete(
    {
      ...request,
      model,
      provider: { only: ["tinfoil", "near-ai", "phala"], allow_fallbacks: true },
    },
    { onResponse },
  );
  expect(result.sonnely_provider).toBe("phala");
  await readStream(
    client.stream(
      {
        ...request,
        model,
        provider: { only: ["tinfoil", "phala"], allow_fallbacks: true },
      },
      { onResponse },
    ),
  );
  expect(sent).toEqual([
    { only: ["tinfoil", "near-ai", "phala"], allow_fallbacks: true },
    { only: ["tinfoil", "phala"], allow_fallbacks: true },
  ]);
  expect(observed).toEqual(Array(2).fill({ requestId, retryAfter: null, provider: "phala" }));
  expect((await client.models()).data[0]?.routes[0]).toEqual(route);
});

test("TypeScript errors expose duplicate, rate-limit, and interrupted stream diagnostics", async () => {
  let calls = 0;
  const responses = [
    Response.json(
      { error: { message: "This Idempotency-Key already started a request." } },
      { status: 409, headers: { "X-Sonnely-Request-Id": requestId } },
    ),
    new Response("Rate limit", { status: 429, headers: { "Retry-After": "60" } }),
    new Response('data: {"error":{"message":"Settlement is pending.","code":502}}\n\n', {
      headers: { "X-Sonnely-Request-Id": requestId, "X-Sonnely-Provider": "tinfoil" },
    }),
    new Response("data: {}\n\n", { headers: { "X-Sonnely-Request-Id": requestId } }),
  ];
  const client = new Sonnely({ apiKey: fixtureKey, fetch: async () => responses[calls++] });

  await expect(client.complete(request, { idempotencyKey: "example-conflict" })).rejects.toMatchObject({
    name: "SonnelyError",
    status: 409,
    requestId,
    retryAfter: null,
  } satisfies Partial<SonnelyError>);
  expect(calls).toBe(1);
  await expect(client.complete(request)).rejects.toMatchObject({
    status: 429,
    requestId: null,
    retryAfter: "60",
    provider: null,
  });
  await expect(readStream(client.stream(request))).rejects.toMatchObject({
    status: 502,
    message: "Settlement is pending.",
    requestId,
    provider: "tinfoil",
  });
  await expect(readStream(client.stream(request))).rejects.toMatchObject({
    status: 502,
    message: "The stream ended before Sonnely confirmed settlement.",
    requestId,
  });
  expect(calls).toBe(4);
});
