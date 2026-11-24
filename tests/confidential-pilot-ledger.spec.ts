import { randomBytes } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";
import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { mainnetMint } from "../lib/payments";
import { localFixtureWallets } from "./fixtures/wallets";

const url = process.env.SONNELY_TEST_LOCAL_CONVEX;
const secret = process.env.SONNELY_TEST_CONVEX_SECRET;
const base58 = getBase58Decoder();
const reference = () => base58.decode(randomBytes(32));
const signature = () => base58.decode(randomBytes(64));

test("the confidential pilot locks order and submission, credits once, and shares replay protection", async () => {
  test.skip(!url || !secret, "Requires the isolated local Convex deployment.");
  if (!url || !secret || new URL(url).hostname !== "127.0.0.1")
    throw new Error("The confidential ledger test must use a loopback Convex deployment.");
  const client = new ConvexHttpClient(url);
  const { admin: payer, treasury, profit: otherAdmin } = localFixtureWallets();
  async function signIn(wallet: string) {
    const auth = { secret: secret!, session: randomBytes(32).toString("hex") };
    await client.mutation(api.sonnely.signIn, {
      ...auth,
      wallet,
      nonce: randomBytes(20).toString("hex"),
      referral: randomBytes(8).toString("hex"),
      expires: Date.now() + 60_000,
    });
    return auth;
  }
  const [admin, other, member] = await Promise.all([signIn(payer), signIn(otherAdmin), signIn(reference())]);
  const pilot = api.confidentialPilot;
  const balance = () => client.query(api.sonnely.profile, admin).then((profile) => profile?.balance);
  const initialBalance = await balance();
  expect(initialBalance).toBeDefined();
  await expect(client.query(pilot.active, member)).rejects.toThrow("Administrator access required");
  await expect(client.mutation(pilot.open, { ...admin, treasury, reference: "invalid" })).rejects.toThrow(
    "Invalid confidential payment reference",
  );

  const publicReference = reference();
  await client.mutation(api.sonnely.createDeposit, {
    ...member,
    reference: publicReference,
    recipient: treasury,
    mint: mainnetMint,
    cluster: "mainnet",
    amount: 1_000_000,
  });
  await expect(
    client.mutation(pilot.open, { ...admin, treasury, reference: publicReference }),
  ).rejects.toThrow("Payment reference already exists");
  const opens = await Promise.all(
    [reference(), reference()].map((ref) =>
      client.mutation(pilot.open, { ...admin, treasury, reference: ref }, { skipQueue: true }),
    ),
  );
  const order = opens[0];
  expect(opens[1]).toEqual(order);
  expect(order).toMatchObject({ payer, treasury, status: "pending", amount: 10_000, mint: mainnetMint });
  await expect(client.query(pilot.details, { ...other, reference: order.reference })).rejects.toThrow(
    "Confidential payment order unavailable",
  );

  const orderAuth = { ...admin, reference: order.reference };
  const first = {
    signature: signature(),
    lastValidBlockHeight: 150,
    messageHash: randomBytes(32).toString("hex"),
  };
  const stage = (draft: typeof first) =>
    client.mutation(pilot.stage, { ...orderAuth, payer, treasury, ...draft });
  const finalize = (value: string) =>
    client.mutation(pilot.finalize, { ...orderAuth, payer, treasury, signature: value }, { skipQueue: true });
  await expect(finalize(first.signature)).rejects.toThrow("No matching confidential payment submission");
  expect((await stage(first)).submission).toEqual(first);
  expect((await stage(first)).submission).toEqual(first);
  await expect(stage({ ...first, messageHash: randomBytes(32).toString("hex") })).rejects.toThrow(
    "Recover the submitted confidential payment",
  );
  await expect(
    client.mutation(api.sonnely.confirmDeposit, {
      ...member,
      reference: publicReference,
      signature: first.signature,
    }),
  ).rejects.toThrow("Payment already recorded");

  await expect(client.mutation(pilot.release, { ...orderAuth, signature: signature() })).rejects.toThrow(
    "Confidential payment submission changed",
  );
  expect((await client.query(pilot.active, admin))?.submission).toEqual(first);
  expect(
    (await client.mutation(pilot.release, { ...orderAuth, signature: first.signature })).submission,
  ).toBeUndefined();
  await expect(finalize(first.signature)).rejects.toThrow("No matching confidential payment submission");

  await client.mutation(api.sonnely.confirmDeposit, {
    ...member,
    reference: publicReference,
    signature: first.signature,
  });
  await expect(stage(first)).rejects.toThrow("Payment already recorded");
  const second = { ...first, signature: signature(), lastValidBlockHeight: 300 };
  expect((await stage(second)).submission).toEqual(second);
  const settlements = await Promise.all([finalize(second.signature), finalize(second.signature)]);
  expect(settlements[0]).toEqual(settlements[1]);
  expect(settlements[0]).toMatchObject({ status: "finalized", signature: second.signature });
  expect(await client.query(pilot.active, admin)).toEqual(settlements[0]);
  expect(await balance()).toBe(initialBalance! + 10_000);
  await expect(client.mutation(pilot.release, { ...orderAuth, signature: second.signature })).rejects.toThrow(
    "Payment already recorded",
  );
});
