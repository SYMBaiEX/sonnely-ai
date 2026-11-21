import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { termsVersion } from "../lib/policy";
import { models } from "../lib/models";
import { markedUpRates, requestCharge } from "../lib/pricing";

const treasury = "X7D5MRGHootjNgKWSgG2Q79f2jHiHpSfduei8t9J4Hg";
const pilot = "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk";
const recipient = "8RFMcU7Ai7wtRsJTZbF9L8MsaiSZ1kefdDfNSCRZBDht";

test("10% rate card retains fractional cached prices and backs the charge", () => {
  expect(markedUpRates(models[0])).toEqual({ input: 0.33, cache: 0.0066, output: 1.32 });
  expect(markedUpRates(models[1])).toEqual({ input: 0.088, cache: 0.0132, output: 0.55 });
  expect(markedUpRates(models[2])).toEqual({ input: 0.187, cache: 0.0616, output: 1.21 });
  expect(requestCharge(models[0], 100_000, 50_000, 10_000)).toBe(30_030);
});

test("unprivileged HTTP clients cannot read finance or open a payout", async ({ request }) => {
  expect((await request.get("/api/sonnely/admin")).status()).toBe(401);
});

test("wallet roles, tenant isolation and payout reconciliation are enforced in Convex", async ({
  baseURL,
}) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Local Convex fixture");
  process.loadEnvFile(".env.local");
  const { backend, hash } = await import("../lib/server");
  const { api } = await import("../convex/_generated/api");
  if (!process.env.CONVEX_URL?.startsWith("http://127.0.0.1:")) throw new Error("Local Convex required");
  const { db, secret } = backend();
  async function walletSession(wallet: string) {
    const session = hash(randomUUID());
    await db.mutation(api.sonnely.signIn, {
      wallet,
      secret,
      session,
      nonce: randomUUID(),
      expires: Date.now() + 60_000,
      referral: randomUUID(),
    });
    return { secret, session };
  }
  const member = await walletSession(randomUUID());
  const separate = await walletSession(randomUUID());
  const checkout = {
    reference: randomUUID(),
    amount: 1_000_000,
    recipient: treasury,
    mint: "test-usdc",
    cluster: "mainnet",
  };
  await db.mutation(api.sonnely.createDeposit, { ...member, ...checkout });
  await expect(
    db.query(api.sonnely.depositDetails, { ...separate, reference: checkout.reference }),
  ).rejects.toThrow("Payment request unavailable");
  await expect(db.query(api.finance.overview, { ...member, since: 0 })).rejects.toThrow(
    "Administrator access required",
  );
  await expect(
    db.mutation(api.finance.openPayout, { ...member, reference: checkout.reference, mint: checkout.mint }),
  ).rejects.toThrow("Administrator access required");
  await expect(db.query(api.finance.overview, { ...member, secret: "wrong", since: 0 })).rejects.toThrow(
    "Unauthorized",
  );
  const admin = await walletSession(pilot);
  const treasuryAdmin = await walletSession(treasury);
  const role = (await db.query(api.sonnely.profile, admin))?.role;
  test.skip(role !== "admin", "Configure the local admin wallets to exercise the reconciliation fixture");
  expect((await db.query(api.sonnely.profile, treasuryAdmin))?.role).toBe("admin");

  await db.mutation(api.sonnely.confirmDeposit, {
    ...member,
    reference: checkout.reference,
    signature: randomUUID(),
  });
  await expect(
    db.mutation(api.sonnely.reserve, {
      ...member,
      model: models[0].id,
      cost: 1000,
      requireTerms: true,
    }),
  ).rejects.toThrow("Accept the current Sonnely terms");
  await db.mutation(api.sonnely.acceptTerms, { ...member, version: termsVersion });
  const held = await db.mutation(api.sonnely.reserve, {
    ...member,
    model: models[0].id,
    cost: 1000,
    requireTerms: true,
  });
  await db.mutation(api.sonnely.settle, {
    secret,
    id: held,
    input: 0,
    output: 0,
    cost: 0,
    status: "unreported",
  });
  const evidence = "Fixture provider receipt and usage check";
  const decision = { id: held, resolution: "settle" as const, charged: 250, evidence };
  await expect(db.mutation(api.creditRecovery.resolve, { ...member, ...decision })).rejects.toThrow(
    "Administrator access required",
  );
  await expect(
    db.mutation(api.creditRecovery.resolve, { ...admin, ...decision, charged: 1001 }),
  ).rejects.toThrow("final charge must fit");
  await db.mutation(api.creditRecovery.resolve, { ...admin, ...decision });
  await expect(db.mutation(api.creditRecovery.resolve, { ...admin, ...decision })).rejects.toThrow(
    "no longer held",
  );
  expect((await db.query(api.sonnely.profile, member))?.balance).toBe(999_750);
  expect((await db.query(api.creditRecovery.queue, { ...admin, now: Date.now() })).recent).toContainEqual(
    expect.objectContaining({ usage: held, held: 1000, charged: 250, evidence }),
  );
  const release = await db.mutation(api.sonnely.reserve, { ...member, model: models[0].id, cost: 1000 });
  await expect(
    db.mutation(api.creditRecovery.resolve, {
      ...admin,
      id: release,
      resolution: "release",
      charged: 0,
      evidence,
    }),
  ).rejects.toThrow("Wait five minutes");
  await db.mutation(api.sonnely.settle, {
    secret,
    id: release,
    input: 0,
    output: 0,
    cost: 0,
    status: "unreported",
  });
  await db.mutation(api.creditRecovery.resolve, {
    ...admin,
    id: release,
    resolution: "release",
    charged: 0,
    evidence,
  });
  expect((await db.query(api.sonnely.profile, member))?.balance).toBe(999_750);
  const providerRequest = randomUUID();
  const model = models[0];
  const id = await db.mutation(api.sonnely.reserve, { ...member, model: model.id, cost: 1000 });
  await db.mutation(api.sonnely.settle, {
    secret,
    id,
    input: 20,
    output: 20,
    cost: 110,
    status: "complete",
    providerRequest,
  });
  await expect(
    db.mutation(api.finance.reconcile, {
      ...member,
      costs: [{ requestId: providerRequest, costNanoUsd: 100_000 }],
    }),
  ).rejects.toThrow("Administrator access required");
  await expect(
    db.mutation(api.finance.reconcile, {
      ...admin,
      costs: [{ requestId: providerRequest, costNanoUsd: 100_000 }],
    }),
  ).resolves.toBe(1);
  await expect(
    db.mutation(api.finance.reconcile, {
      ...admin,
      costs: [{ requestId: providerRequest, costNanoUsd: 100_000 }],
    }),
  ).resolves.toBe(0);
  const reference = await db.mutation(api.finance.openPayout, {
    ...admin,
    reference: randomUUID(),
    mint: checkout.mint,
  });
  const order = await db.query(api.finance.payoutDetails, { ...admin, reference });
  expect(order.recipient).toBe(recipient);
  expect(order.amount).toBeGreaterThanOrEqual(10);
  const draft = { reference, observedHeight: 10, lastValidBlockHeight: 100, transaction: "fixture" };
  await expect(db.mutation(api.finance.savePayoutTransaction, { ...admin, ...draft })).rejects.toThrow(
    "Only the treasury wallet",
  );
  await expect(db.mutation(api.finance.savePayoutTransaction, { ...treasuryAdmin, ...draft })).resolves.toBe(
    "fixture",
  );
  await expect(
    db.mutation(api.finance.savePayoutTransaction, { ...treasuryAdmin, ...draft, transaction: "duplicate" }),
  ).resolves.toBe("fixture");
  const signature = randomUUID();
  await expect(
    db.mutation(api.finance.confirmPayout, { ...admin, reference, signature }),
  ).resolves.toBeNull();
  await expect(
    db.mutation(api.finance.confirmPayout, { ...admin, reference, signature }),
  ).resolves.toBeNull();
});
