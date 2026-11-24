import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { expect, test } from "@playwright/test";
import { getBase58Decoder } from "@solana/kit";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { confidentialUsdcMint } from "../lib/confidential-payment-types";
import { localFixtureWallets } from "./fixtures/wallets";

const url = process.env.SONNELY_TEST_LOCAL_CONVEX;
const secret = process.env.SONNELY_TEST_CONVEX_SECRET;
const base58 = getBase58Decoder();
const reference = () => base58.decode(randomBytes(32));
const signature = () => base58.decode(randomBytes(64));

test("native confidential payments preserve late receipts and credit exactly once across payment rails", async () => {
  test.skip(!url || !secret, "Requires the isolated local Convex deployment.");
  if (!url || !secret || new URL(url).hostname !== "127.0.0.1")
    throw new Error("The payment ledger test must use a loopback Convex deployment.");
  const client = new ConvexHttpClient(url);
  const { admin: adminWallet, profit: pilotWallet, treasury } = localFixtureWallets();
  const payer = reference();
  const native = api.confidentialPayments;
  const amount = 5_654_321;

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

  const [admin, pilotAdmin, member, other] = await Promise.all([
    signIn(adminWallet),
    signIn(pilotWallet),
    signIn(payer),
    signIn(reference()),
  ]);
  const since = Date.now();
  const finance = () => client.query(api.finance.overview, { ...admin, since });
  const daily = async () => {
    const { days } = await client.query(api.analytics.daily, { ...admin, days: 7 });
    return days.reduce(
      (total, day) => ({ count: total.count + day.deposits, micros: total.micros + day.depositUsd }),
      { count: 0, micros: 0 },
    );
  };
  const [startingFinance, startingDaily] = await Promise.all([finance(), daily()]);
  const balance = () => client.query(api.sonnely.profile, member).then((profile) => profile?.balance);
  const open = (ref = reference()) =>
    client.mutation(native.open, { ...member, reference: ref, treasury, amount }, { skipQueue: true });
  const publicReference = reference();
  const publicOrder = {
    ...other,
    reference: publicReference,
    recipient: treasury,
    mint: confidentialUsdcMint,
    cluster: "mainnet",
    amount,
  };
  await client.mutation(api.sonnely.createDeposit, publicOrder);
  await expect(open(publicReference)).rejects.toThrow("Payment reference already exists");
  await expect(client.query(native.queue, member)).rejects.toThrow("Administrator access required");
  await expect(client.query(native.history, { ...member, secret: "invalid" })).rejects.toThrow(
    "Unauthorized",
  );
  await expect(
    client.mutation(native.open, { ...member, reference: reference(), treasury, amount: 0.1 }),
  ).rejects.toThrow("Invalid confidential payment amount");
  await expect(
    client.mutation(native.open, { ...member, reference: reference(), treasury: reference(), amount }),
  ).rejects.toThrow("Confidential payment treasury is unavailable");
  const pilot = await client.mutation(api.confidentialPilot.open, {
    ...pilotAdmin,
    reference: reference(),
    treasury,
  });
  await expect(open(pilot.reference)).rejects.toThrow("Payment reference already exists");

  const [first, retry] = await Promise.all([open(), open()]);
  expect(first).toEqual(retry);
  expect(first).toMatchObject({
    payer,
    treasury,
    amount,
    status: "awaiting_payment",
    mint: confidentialUsdcMint,
  });
  const firstRef = { reference: first.reference };
  await expect(client.query(native.details, { ...other, ...firstRef })).rejects.toThrow(
    "Confidential payment order unavailable",
  );
  await expect(client.mutation(api.sonnely.createDeposit, { ...publicOrder, ...firstRef })).rejects.toThrow(
    "Payment reference already exists",
  );
  await expect(
    client.mutation(native.open, { ...member, reference: reference(), treasury, amount: amount + 1 }),
  ).rejects.toThrow("Finish or cancel the existing confidential payment");

  const firstReceipt = { signature: signature(), slot: 12345, blockTime: Math.ceil(first.createdAt / 1000) };
  await setTimeout(Math.max(0, (firstReceipt.blockTime + 1) * 1000 - Date.now()));
  expect(await client.mutation(native.cancel, { ...member, ...firstRef })).toMatchObject({
    status: "cancelled",
  });
  const second = await open();
  expect(second.reference).not.toEqual(first.reference);
  await expect(
    client.mutation(native.record, {
      ...member,
      ...firstRef,
      ...firstReceipt,
      blockTime: firstReceipt.blockTime - 1,
    }),
  ).rejects.toThrow("outside the confidential payment window");
  const recorded = await client.mutation(native.record, { ...member, ...firstRef, ...firstReceipt });
  expect(recorded).toMatchObject({
    ...firstReceipt,
    status: "under_review",
    reviewReason: "details-encrypted",
  });
  expect(await client.query(native.active, member)).toEqual(second);
  expect(await client.query(native.history, other)).toEqual([]);
  expect(await client.query(native.queue, admin)).toMatchObject({
    payments: expect.arrayContaining([recorded]),
  });
  expect(await balance()).toBe(0);
  expect(await finance()).toMatchObject({
    deposits: startingFinance.deposits,
    depositMicros: startingFinance.depositMicros,
  });

  const confirmPublic = (value: string) =>
    client.mutation(api.sonnely.confirmDeposit, { ...other, reference: publicReference, signature: value });
  await expect(confirmPublic(firstReceipt.signature)).rejects.toThrow("Payment already recorded");
  const stagePilot = (value: string) =>
    client.mutation(api.confidentialPilot.stage, {
      ...pilotAdmin,
      reference: pilot.reference,
      payer: pilotWallet,
      treasury,
      signature: value,
      messageHash: randomBytes(32).toString("hex"),
      lastValidBlockHeight: 100,
    });
  await expect(stagePilot(firstReceipt.signature)).rejects.toThrow("Payment already recorded");

  const approval = { ...firstRef, signature: firstReceipt.signature, action: "approve" as const };
  await expect(client.mutation(native.resolve, { ...member, ...approval })).rejects.toThrow(
    "Administrator access required",
  );
  const settled = await Promise.all(
    [admin, admin].map((auth) =>
      client.mutation(native.resolve, { ...auth, ...approval }, { skipQueue: true }),
    ),
  );
  expect(settled[0]).toMatchObject({ ...firstReceipt, status: "credited" });
  expect(settled[0]).toEqual(settled[1]);
  expect(await balance()).toBe(amount);

  const secondRef = { reference: second.reference };
  const secondReceipt = { slot: 12346, blockTime: Math.ceil(second.createdAt / 1000) };
  const secondArgs = { ...member, ...secondRef, ...secondReceipt };
  const publicSignature = signature();
  await confirmPublic(publicSignature);
  await expect(client.mutation(native.record, { ...secondArgs, signature: publicSignature })).rejects.toThrow(
    "Payment already recorded",
  );
  const pilotSignature = signature();
  await stagePilot(pilotSignature);
  await expect(client.mutation(native.record, { ...secondArgs, signature: pilotSignature })).rejects.toThrow(
    "Payment already recorded",
  );
  await client.mutation(api.confidentialPilot.release, {
    ...pilotAdmin,
    reference: pilot.reference,
    signature: pilotSignature,
  });
  const incorrectSignature = signature();
  await client.mutation(native.record, {
    ...secondArgs,
    signature: incorrectSignature,
    reviewReason: "amount-mismatch",
  });
  const resolve = { ...admin, ...secondRef, signature: incorrectSignature };
  await expect(client.mutation(native.resolve, { ...resolve, action: "approve" })).rejects.toThrow(
    "The verified payment does not match this order",
  );
  await expect(client.mutation(native.resolve, { ...resolve, action: "reject" })).rejects.toThrow(
    "Record a rejection reason",
  );
  const third = await open();
  const thirdReceipt = { signature: signature(), slot: 12347, blockTime: Math.ceil(third.createdAt / 1000) };
  const thirdArgs = { ...member, reference: third.reference, ...thirdReceipt };
  await expect(
    client.mutation(native.record, { ...thirdArgs, signature: incorrectSignature }),
  ).rejects.toThrow("Payment already recorded");
  expect(
    await client.mutation(native.resolve, {
      ...resolve,
      action: "reject",
      reason: "The received amount differs.",
    }),
  ).toMatchObject({
    ...secondReceipt,
    signature: incorrectSignature,
    status: "rejected",
    reason: "The received amount differs.",
  });
  await expect(stagePilot(incorrectSignature)).rejects.toThrow("Payment already recorded");
  expect(await balance()).toBe(amount);

  await client.mutation(native.record, thirdArgs);
  const verified = await Promise.all(
    [true, true].map((verified) =>
      client.mutation(native.record, { ...thirdArgs, verified }, { skipQueue: true }),
    ),
  );
  expect(verified[0]).toMatchObject({ ...thirdReceipt, status: "credited" });
  expect(verified[0]).toEqual(verified[1]);
  expect(await balance()).toBe(amount * 2);
  expect(await finance()).toMatchObject({
    deposits: startingFinance.deposits + 3,
    depositMicros: startingFinance.depositMicros + amount * 3,
    finance: { availableMicros: startingFinance.finance.availableMicros },
  });
  expect(await daily()).toEqual({
    count: startingDaily.count + 3,
    micros: startingDaily.micros + amount * 3,
  });
  const found = await client.query(api.crm.customers, {
    ...admin,
    search: payer,
    page: { cursor: null, numItems: 1 },
  });
  expect(found.page).toMatchObject([{ wallet: payer, funded: true }]);
  const customer = await client.query(api.crm.customer, { ...admin, id: found.page[0].id });
  expect(customer).toMatchObject({
    funded: true,
    stats: { totalDeposits: amount * 2 },
    deposits: [
      { reference: third.reference, signature: thirdReceipt.signature },
      { reference: first.reference, signature: firstReceipt.signature },
    ],
  });
});
