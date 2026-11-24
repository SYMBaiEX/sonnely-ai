import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { getBase58Decoder } from "@solana/kit";
import { api } from "../convex/_generated/api";

const url = process.env.SONNELY_TEST_LOCAL_CONVEX;
const secret = process.env.SONNELY_TEST_CONVEX_SECRET;

test("request logs expose the signed-in account's metadata and support combined filters", async () => {
  test.skip(!url || !secret, "Requires the isolated local Convex deployment.");
  if (!url || !secret || new URL(url).hostname !== "127.0.0.1")
    throw new Error("The request log integration test must use a loopback Convex deployment.");
  const db = new ConvexHttpClient(url);
  async function signIn() {
    const wallet = getBase58Decoder().decode(randomBytes(32));
    const auth = { secret: secret!, session: randomBytes(32).toString("hex") };
    await db.mutation(api.sonnely.signIn, {
      ...auth,
      wallet,
      nonce: randomBytes(20).toString("hex"),
      referral: randomBytes(8).toString("hex"),
      expires: Date.now() + 60_000,
    });
    return { wallet, auth };
  }
  const [owner, other] = await Promise.all([signIn(), signIn()]);
  const since = Date.now();
  const cursor = null;
  const legacy = await db.mutation(api.sonnely.reserve, {
    ...owner.auth,
    model: "Embedding model",
    cost: 0,
  });
  const hash = randomBytes(32).toString("hex");
  await db.mutation(api.sonnely.createKey, {
    ...owner.auth,
    name: "Integration key",
    hash,
    prefix: "fixture-",
    cap: null,
    dailyCap: null,
    expires: null,
  });
  const id = await db.mutation(api.sonnely.reserve, {
    secret,
    hash,
    model: "Chat model",
    provider: "phala",
    endpoint: "chat/completions",
    cost: 0,
  });
  await db.mutation(api.sonnely.settle, {
    secret,
    id,
    input: 18,
    output: 4,
    cost: 0,
    providerRequest: "phala:fixture",
    providerStatus: 200,
    providerReportedCostNano: 40,
    outcome: "complete",
    usageMaxDetails: {
      stream: true,
      firstTokenAt: since + 32,
      usage: { inputTokens: 18, outputTokens: 4, cacheReadTokens: 6, reasoningTokens: 2 },
      timing: {
        requestAt: since,
        reservationAt: since + 2,
        providerAt: since + 9,
        providerDoneAt: since + 67,
        settlementAt: since + 71,
      },
    },
    status: "complete",
  });

  const filters = {
    ...owner.auth,
    since,
    cursor,
    provider: "phala",
    model: "Chat model",
    keyName: "Integration key",
    status: "complete",
  } as const;
  const page = await db.query(api.requestLogs.list, filters);
  expect(page.wallet).toBe(owner.wallet);
  expect(page.nextCursor).toBeNull();
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({
    id,
    provider: "phala",
    keyName: "Integration key",
    endpoint: "chat/completions",
    providerRequest: "phala:fixture",
    providerStatus: 200,
    cachedTokens: 6,
    reasoningTokens: 2,
    durationMs: 71,
    providerDurationMs: 58,
    timeToFirstTokenMs: 32,
    stream: true,
  });
  expect(page.rows[0]).not.toHaveProperty("providerReportedCostNano");
  expect(page.rows[0]).not.toHaveProperty("usageMaxDetails");
  expect(await db.query(api.requestLogs.details, { ...owner.auth, id })).toEqual(page.rows[0]);
  expect(await db.query(api.requestLogs.details, { ...other.auth, id })).toBeNull();
  expect(await db.query(api.requestLogs.details, { ...owner.auth, id: "not-a-request-id" })).toBeNull();
  await expect(db.query(api.requestLogs.details, { ...owner.auth, id, secret: "bad" })).rejects.toThrow(
    "Unauthorized.",
  );
  await expect(db.query(api.requestLogs.list, { secret, session: "bad", since, cursor })).rejects.toThrow(
    "Sign in with a Solana wallet.",
  );
  expect((await db.query(api.requestLogs.list, { ...other.auth, since, cursor })).rows).toEqual([]);
  expect((await db.query(api.requestLogs.list, { ...filters, status: "failed" })).rows).toEqual([]);
  const near = await db.query(api.requestLogs.list, { ...owner.auth, since, cursor, provider: "near-ai" });
  expect(near.rows).toHaveLength(1);
  expect(near.rows[0]).toMatchObject({ id: legacy, provider: "near-ai", status: "pending" });
  expect(near.rows[0]).not.toHaveProperty("endpoint");
});
