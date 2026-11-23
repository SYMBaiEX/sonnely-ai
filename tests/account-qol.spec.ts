import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("key edits, session control, and draft cancel stay scoped to the owning account", async ({
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

  await db.mutation(api.sonnely.createKey, {
    ...member,
    name: "fixture",
    prefix: "sonnely_live_fixture",
    hash: randomUUID(),
    cap: null,
    dailyCap: null,
    expires: null,
  });
  const [created] = await db.query(api.sonnely.listKeys, member);
  const expires = Date.now() + 86_400_000;
  await db.mutation(api.sonnely.updateKey, {
    ...member,
    id: created.id,
    name: "renamed",
    cap: 2_500_000,
    dailyCap: 500_000,
    expires,
  });
  const [updated] = await db.query(api.sonnely.listKeys, member);
  expect(updated).toMatchObject({
    name: "renamed",
    cap: 2_500_000,
    dailyCap: 500_000,
    expires,
    todaySpent: 0,
  });
  await expect(
    db.mutation(api.sonnely.updateKey, {
      ...separate,
      id: created.id,
      name: "stolen",
      cap: null,
      dailyCap: null,
      expires: null,
    }),
  ).rejects.toThrow("Key unavailable");
  await expect(
    db.mutation(api.sonnely.updateKey, {
      ...member,
      id: created.id,
      name: "renamed",
      cap: 5_000,
      dailyCap: null,
      expires: null,
    }),
  ).rejects.toThrow("caps");

  const wallet = randomUUID();
  const first = await walletSession(wallet);
  const second = await walletSession(wallet);
  const listed = await db.query(api.sonnely.listSessions, first);
  expect(listed).toHaveLength(2);
  expect(listed.filter((row) => row.current)).toHaveLength(1);
  expect(await db.mutation(api.sonnely.signOutOthers, first)).toBe(1);
  await expect(db.query(api.sonnely.listSessions, second)).rejects.toThrow("Sign in");
  const remaining = await db.query(api.sonnely.listSessions, first);
  expect(remaining).toHaveLength(1);
  expect(remaining[0].current).toBe(true);

  const draft = randomUUID();
  const signed = randomUUID();
  for (const reference of [draft, signed])
    await db.mutation(api.sonnely.createDeposit, {
      ...member,
      reference,
      recipient: "fixture",
      mint: "fixture",
      cluster: "mainnet",
      amount: 1_000_000,
    });
  await expect(db.mutation(api.sonnely.cancelDeposit, { ...separate, reference: draft })).rejects.toThrow(
    "unavailable",
  );
  await db.mutation(api.sonnely.confirmDeposit, {
    ...member,
    reference: signed,
    signature: randomUUID(),
  });
  await expect(db.mutation(api.sonnely.cancelDeposit, { ...member, reference: signed })).rejects.toThrow(
    "finalized",
  );
  await db.mutation(api.sonnely.cancelDeposit, { ...member, reference: draft });
  await expect(db.query(api.sonnely.depositDetails, { ...member, reference: draft })).rejects.toThrow(
    "unavailable",
  );
});
