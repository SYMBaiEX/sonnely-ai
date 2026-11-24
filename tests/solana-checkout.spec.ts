import { randomBytes } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";
import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { mainnetMint } from "../lib/payments";

const url = process.env.SONNELY_TEST_LOCAL_CONVEX;
const secret = process.env.SONNELY_TEST_CONVEX_SECRET;
const fixtureAddress = () => getBase58Decoder().decode(randomBytes(32));

test("checkout reuses live drafts and credits a late settlement once after archiving", async () => {
  test.skip(!url || !secret, "Requires the isolated local Convex deployment.");
  if (!url || !secret || new URL(url).hostname !== "127.0.0.1")
    throw new Error("The checkout retry test must use a loopback Convex deployment.");
  const client = new ConvexHttpClient(url);
  const auth = { secret, session: randomBytes(32).toString("hex") };
  await client.mutation(api.sonnely.signIn, {
    ...auth,
    wallet: fixtureAddress(),
    nonce: randomBytes(20).toString("hex"),
    referral: randomBytes(8).toString("hex"),
    expires: Date.now() + 60_000,
  });
  const reference = fixtureAddress();
  await client.mutation(api.sonnely.createDeposit, {
    ...auth,
    reference,
    recipient: fixtureAddress(),
    mint: mainnetMint,
    cluster: "mainnet",
    amount: 5_000_000,
  });
  const args = { ...auth, reference };
  const save = (transaction: string, observedHeight: number, lastValidBlockHeight: number) =>
    client.mutation(api.sonnely.saveDepositTransaction, {
      ...args,
      transaction,
      observedHeight,
      lastValidBlockHeight,
    }, { skipQueue: true });
  const drafts = await Promise.all([save("first", 10, 20), save("second", 10, 20)]);
  expect(drafts[0]).toBe(drafts[1]);
  expect(await save("same-height", 20, 30)).toBe(drafts[0]);
  expect(await save("replacement", 21, 31)).toBe("replacement");
  expect((await client.query(api.sonnely.depositDetails, args)).checkoutTransaction).toEqual({
    transaction: "replacement",
    lastValidBlockHeight: 31,
  });
  await expect(client.mutation(api.sonnely.saveDepositTransaction, {
    ...args,
    session: randomBytes(32).toString("hex"),
    transaction: "wrong-account",
    observedHeight: 32,
    lastValidBlockHeight: 40,
  })).rejects.toThrow("Sign in with a Solana wallet");
  await client.mutation(api.sonnely.cancelDeposit, args);
  const archivedAt = (await client.query(api.sonnely.depositDetails, args)).archivedAt;
  expect(archivedAt).toBeGreaterThan(0);
  await client.mutation(api.sonnely.cancelDeposit, args);
  expect(await client.query(api.sonnely.history, auth)).toMatchObject([{ reference, archivedAt }]);
  await expect(save("archived", 32, 40)).rejects.toThrow("This payment request is archived");
  const signature = getBase58Decoder().decode(randomBytes(64));
  await client.mutation(api.sonnely.confirmDeposit, { ...args, signature });
  await client.mutation(api.sonnely.confirmDeposit, { ...args, signature });
  expect((await client.query(api.sonnely.profile, auth))?.balance).toBe(5_000_000);
  expect(await client.query(api.sonnely.history, auth)).toMatchObject([{ reference, signature, archivedAt }]);
});
