import { localFixtureWallets } from "./fixtures/wallets";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Id } from "../convex/_generated/dataModel";
import { models } from "../lib/models";

test("admin analytics rolls daily activity into series and leaderboards", async ({ baseURL, request }) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Local Convex fixture");
  process.loadEnvFile(".env.local");
  if (!process.env.CONVEX_URL?.startsWith("http://127.0.0.1:")) throw new Error("Local Convex required");
  const { backend, hash } = await import("../lib/server");
  const { api } = await import("../convex/_generated/api");
  const { db, secret } = backend();
  const adminWallet = localFixtureWallets().admin;

  async function signIn(wallet: string) {
    const token = randomUUID();
    const auth = { secret, session: hash(token) };
    await db.mutation(api.sonnely.signIn, {
      ...auth,
      wallet,
      nonce: randomUUID(),
      expires: Date.now() + 60_000,
      referral: randomUUID().replaceAll("-", "").slice(0, 16),
    });
    return { auth, token };
  }
  async function deposit(auth: { secret: string; session: string }, amount: number) {
    const reference = randomUUID();
    await db.mutation(api.sonnely.createDeposit, {
      ...auth,
      reference,
      recipient: adminWallet,
      mint: "test-usdc",
      cluster: "mainnet",
      amount,
    });
    await db.mutation(api.sonnely.confirmDeposit, { ...auth, reference, signature: randomUUID() });
  }
  async function settle(id: Id<"usage">, status: "complete" | "failed", cost: number) {
    await db.mutation(api.sonnely.settle, { secret, id, input: 12, output: 24, cost, status });
  }

  const admin = await signIn(adminWallet);
  const before = await db.query(api.analytics.daily, { ...admin.auth, days: 7 });
  expect(before.days).toHaveLength(7);
  const today = new Date().toISOString().slice(0, 10);
  expect(before.days[6].day).toBe(today);
  expect(before.days[0].day).toBe(new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const prior = before.days[6];

  const guestWallet = randomUUID();
  const whaleWallet = randomUUID();
  const guest = await signIn(guestWallet);
  const whale = await signIn(whaleWallet);

  await expect(db.query(api.analytics.daily, { ...guest.auth, days: 30 })).rejects.toThrow(
    "Administrator access required",
  );
  expect((await request.get("/api/sonnely/admin-crm?view=analytics&days=7")).status()).toBe(401);

  await deposit(guest.auth, 5_000_000);
  await deposit(whale.auth, 500_000_000);

  const complete = await db.mutation(api.sonnely.reserve, {
    ...guest.auth,
    model: models[0].id,
    cost: 1_500_000,
  });
  await settle(complete, "complete", 1_000_000);
  const failed = await db.mutation(api.sonnely.reserve, {
    ...guest.auth,
    model: models[0].id,
    cost: 300,
  });
  await settle(failed, "failed", 0);
  await db.mutation(api.sonnely.reserve, { ...guest.auth, model: models[0].id, cost: 200 });

  for (let index = 0; index < 2; index++) {
    const id = await db.mutation(api.sonnely.reserve, {
      ...whale.auth,
      model: models[1].id,
      provider: "phala",
      cost: 250_000_000,
    });
    await settle(id, "complete", 200_000_000);
  }

  const after = await db.query(api.analytics.daily, { ...admin.auth, days: 7 });
  const bucket = after.days.find((day) => day.day === today);
  expect(bucket).toBeDefined();
  expect(bucket!.requests - prior.requests).toBe(5);
  expect(bucket!.completed - prior.completed).toBe(3);
  expect(bucket!.failed - prior.failed).toBe(1);
  expect(bucket!.held - prior.held).toBe(1);
  expect(bucket!.spend - prior.spend).toBe(401_000_000);
  expect(bucket!.signups - prior.signups).toBeGreaterThanOrEqual(2);
  expect(bucket!.deposits - prior.deposits).toBe(2);
  expect(bucket!.depositUsd - prior.depositUsd).toBe(505_000_000);

  expect(after.topCustomers[0]).toMatchObject({ wallet: whaleWallet, spend: 400_000_000, requests: 2 });
  const guestRow = after.topCustomers.findIndex((row) => row.wallet === guestWallet);
  const whaleRow = after.topCustomers.findIndex((row) => row.wallet === whaleWallet);
  expect(whaleRow).toBeGreaterThanOrEqual(0);
  expect(guestRow).toBeGreaterThan(whaleRow);
  expect(after.topCustomers[guestRow]).toMatchObject({ spend: 1_000_000, requests: 3 });

  expect(after.topModels[0]).toMatchObject({ model: models[1].id, spend: 400_000_000, requests: 2 });
  expect(after.topModels.find((row) => row.model === models[0].id)).toMatchObject({
    spend: 1_000_000,
    requests: 3,
  });

  const split = Object.fromEntries(after.providerSplit.map((row) => [row.provider, row.requests]));
  const priorSplit = Object.fromEntries(before.providerSplit.map((row) => [row.provider, row.requests]));
  expect((split["phala"] ?? 0) - (priorSplit["phala"] ?? 0)).toBe(2);
  expect((split["near-ai"] ?? 0) - (priorSplit["near-ai"] ?? 0)).toBe(3);

  const http = await request.get("/api/sonnely/admin-crm?view=analytics&days=7", {
    headers: { cookie: "sonnely_session=" + admin.token },
  });
  expect(http.status()).toBe(200);
  const payload = await http.json();
  expect(payload.days).toHaveLength(7);
  expect(payload.topCustomers[0].wallet).toBe(whaleWallet);
});
