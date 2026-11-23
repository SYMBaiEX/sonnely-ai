import { localFixtureWallets } from "./fixtures/wallets";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { models } from "../lib/models";

test("admin account actions adjust balances, suspend inference, revoke keys, and reset sessions", async ({
  baseURL,
  request,
}) => {
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

  const admin = await signIn(adminWallet);
  const guestWallet = randomUUID();
  const guest = await signIn(guestWallet);
  const paging = { cursor: null, numItems: 30 };
  const account = (await db.query(api.crm.customers, { ...admin.auth, search: guestWallet, page: paging }))
    .page[0].id;
  const detail = () => db.query(api.crm.customer, { ...admin.auth, id: account });

  await expect(
    db.mutation(api.adminActions.adjustBalance, {
      ...guest.auth,
      account,
      delta: 100_000,
      reason: "member attempt",
    }),
  ).rejects.toThrow("Administrator access required");
  await expect(
    db.mutation(api.adminActions.setSuspended, { ...guest.auth, account, suspended: true }),
  ).rejects.toThrow("Administrator access required");
  await expect(db.mutation(api.adminActions.resetSessions, { ...guest.auth, account })).rejects.toThrow(
    "Administrator access required",
  );
  expect(
    (
      await request.post("/api/sonnely/admin-adjust-balance", {
        data: { account, delta: 100_000, reason: "unauthenticated attempt" },
        headers: { origin: baseURL! },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/sonnely/admin-reset-sessions", {
        data: { account },
        headers: { origin: baseURL!, cookie: "sonnely_session=" + guest.token },
      })
    ).status(),
  ).toBe(403);

  await expect(
    db.mutation(api.adminActions.adjustBalance, {
      ...admin.auth,
      account,
      delta: 2_000_000_000,
      reason: "exceeds the adjustment cap",
    }),
  ).rejects.toThrow();
  await expect(
    db.mutation(api.adminActions.adjustBalance, {
      ...admin.auth,
      account,
      delta: -500_000,
      reason: "would overdraw the balance",
    }),
  ).rejects.toThrow();
  await db.mutation(api.adminActions.adjustBalance, {
    ...admin.auth,
    account,
    delta: 500_000,
    reason: "goodwill credit for the outage",
  });
  expect(await detail()).toMatchObject({
    customer: { balance: 500_000 },
    suspended: false,
    adjustments: [{ delta: 500_000, balanceAfter: 500_000, adminWallet }],
  });

  await db.mutation(api.sonnely.createKey, {
    ...guest.auth,
    name: "fixture key",
    prefix: "sonnely_live_fixture",
    hash: "fixture-" + randomUUID(),
    cap: null,
    dailyCap: null,
    expires: null,
  });
  const keyId = (await db.query(api.sonnely.listKeys, guest.auth))[0].id;
  await db.mutation(api.adminActions.revokeKey, { ...admin.auth, id: keyId });
  expect((await db.query(api.sonnely.listKeys, guest.auth))[0].revoked).toBe(true);
  expect((await detail())?.keys).toMatchObject([{ id: keyId, revoked: true }]);

  await db.mutation(api.adminActions.setSuspended, {
    ...admin.auth,
    account,
    suspended: true,
    note: "abuse investigation",
  });
  expect(await detail()).toMatchObject({ suspended: true, flags: ["suspended"] });
  await expect(
    db.mutation(api.sonnely.reserve, { ...guest.auth, model: models[0].id, cost: 300 }),
  ).rejects.toThrow("suspended");
  await db.mutation(api.adminActions.setSuspended, { ...admin.auth, account, suspended: false });
  expect((await detail())?.suspended).toBe(false);
  expect(
    await db.mutation(api.sonnely.reserve, { ...guest.auth, model: models[0].id, cost: 300 }),
  ).toBeTruthy();
  expect((await detail())?.customer.balance).toBe(499_700);

  expect((await db.query(api.sonnely.profile, guest.auth))?.wallet).toBe(guestWallet);
  await db.mutation(api.adminActions.resetSessions, { ...admin.auth, account });
  expect(await db.query(api.sonnely.profile, guest.auth)).toBeNull();
});
