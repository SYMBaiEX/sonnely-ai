import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/sonnely/usage-max/route";
import { api } from "../convex/_generated/api";
import { backend, hash } from "../lib/server";

test("UsageMax gets only the wallet owner's settled records, with stable opaque event keys", async ({
  baseURL,
}) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Local Convex fixture");
  process.loadEnvFile(".env.local");
  if (process.env.CONVEX_URL !== "http://127.0.0.1:3210") throw new Error("Local Convex required");
  const { db, secret } = backend();
  const origin = new URL(baseURL!).origin;
  const makeUrl = origin + "/api/sonnely/usage-max?days=7";
  const wallet = randomUUID();
  const token = randomUUID();
  const session = hash(token);
  const auth = { secret, session };
  await db.mutation(api.sonnely.signIn, {
    ...auth,
    wallet,
    nonce: randomUUID(),
    referral: randomUUID(),
    expires: Date.now() + 60_000,
  });
  const owner = await db.mutation(api.sonnely.reserve, { ...auth, model: "fixture-model", cost: 0 });
  await db.mutation(api.sonnely.settle, {
    secret,
    id: owner,
    status: "complete",
    input: 21,
    output: 12,
    cost: 0,
    providerRequest: "private-provider-request",
  });
  await db.mutation(api.sonnely.reserve, { ...auth, model: "pending-model", cost: 0 });
  const otherToken = randomUUID();
  await db.mutation(api.sonnely.signIn, {
    secret,
    session: hash(otherToken),
    wallet: randomUUID(),
    nonce: randomUUID(),
    referral: randomUUID(),
    expires: Date.now() + 60_000,
  });

  const cookies = (value: string) => ({ Cookie: "sonnely_session=" + value });
  expect((await GET(new NextRequest(makeUrl))).status).toBe(401);
  expect((await GET(new NextRequest(makeUrl, { headers: cookies(otherToken) }))).status).toBe(404);
  const downloaded = await GET(new NextRequest(makeUrl, { headers: cookies(token) }));
  expect(downloaded.status).toBe(200);
  expect(downloaded.headers.get("content-disposition")).toContain("sonnely-usagemax.json");
  const batch = await downloaded.json();
  expect(batch.events).toHaveLength(1);
  expect(batch.events[0]).toMatchObject({
    model: "fixture-model",
    totalTokens: 33,
    source: "sonnely",
    provider: "near-ai",
    costMicros: 0,
  });
  for (const privateValue of [owner, wallet, "pending-model", "private-provider-request"])
    expect(JSON.stringify(batch)).not.toContain(privateValue);

  const originalFetch = globalThis.fetch;
  const fingerprint: string[] = [];
  const collector = "umx_" + "a".repeat(64);
  const device = randomUUID();
  const mocked = mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input) !== "https://usagemax.com/api/v1/telemetry/llm") return originalFetch(input, init);
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer " + collector);
      expect(headers.get("x-usagemax-device-id")).toBe(device);
      expect(init?.redirect).toBe("error");
      expect(JSON.parse(String(init?.body))).toEqual(batch);
      fingerprint.push(headers.get("idempotency-key") ?? "");
      return Response.json({ ok: true }, { status: fingerprint.length === 1 ? 202 : 200 });
    },
  );
  try {
    const send = (origin: string) =>
      POST(
        new NextRequest(makeUrl, {
          method: "POST",
          headers: {
            ...cookies(token),
            Origin: origin,
            Host: new URL(makeUrl).host,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: collector, device, days: 7 }),
        }),
      );
    expect((await send("https://foreign.test")).status).toBe(403);
    expect(fingerprint).toHaveLength(0);
    expect(await (await send(origin)).json()).toEqual({ sent: 1 });
    expect(await (await send(origin)).json()).toEqual({ sent: 1 });
    expect(fingerprint).toEqual([fingerprint[0], fingerprint[0]]);
    expect(fingerprint[0]).toMatch(/^sonnely:[0-9a-f]{64}$/);
  } finally {
    mocked.mock.restore();
  }
});
