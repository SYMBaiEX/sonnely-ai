import { expect, test } from "@playwright/test";
import {
  Sonnely,
  SonnelyError,
  type CompletionRequest,
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

test("TypeScript errors expose duplicate, rate-limit, and interrupted stream diagnostics", async () => {
  let calls = 0;
  const responses = [
    Response.json(
      { error: { message: "This Idempotency-Key already started a request." } },
      { status: 409, headers: { "X-Sonnely-Request-Id": requestId } },
    ),
    new Response("Rate limit", { status: 429, headers: { "Retry-After": "60" } }),
    new Response('data: {"error":{"message":"Settlement is pending.","code":502}}\n\n', {
      headers: { "X-Sonnely-Request-Id": requestId },
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
  });
  await expect(readStream(client.stream(request))).rejects.toMatchObject({
    status: 502,
    message: "Settlement is pending.",
    requestId,
  });
  await expect(readStream(client.stream(request))).rejects.toMatchObject({
    status: 502,
    message: "The stream ended before Sonnely confirmed settlement.",
    requestId,
  });
  expect(calls).toBe(4);
});
