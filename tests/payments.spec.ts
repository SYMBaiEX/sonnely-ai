import { expect, test } from "@playwright/test";
import { configuredProviders, managedProviderKey } from "../lib/managed-access";
import { billing, mainnetMint, verifyCluster, verifyPayment } from "../lib/payments";
import { getProviderCosts } from "../lib/provider-billing";

const rpc = "https://rpc.example.test";
const genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const payer = "11111111111111111111111111111112";
const order = {
  reference: "11111111111111111111111111111113",
  recipient: "11111111111111111111111111111114",
  mint: mainnetMint,
  cluster: "mainnet",
  amount: 5_000_000,
};

test("mainnet checkout can use another provider while NEAR is paused", () => {
  const keys = [
    "SOLANA_TREASURY",
    "SOLANA_RPC_URL",
    "SOLANA_BILLING_CLUSTER",
    "NEAR_AI_API_KEY",
    "PHALA_AI_API_KEY",
    "TINFOIL_API_KEY",
    "SONNELY_PAUSED_PROVIDERS",
    "VERCEL_ENV",
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    delete process.env.VERCEL_ENV;
    process.env.SOLANA_TREASURY = order.recipient;
    process.env.SOLANA_RPC_URL = rpc;
    process.env.SOLANA_BILLING_CLUSTER = "mainnet";
    process.env.NEAR_AI_API_KEY = "near-fixture";
    process.env.PHALA_AI_API_KEY = "phala-fixture";
    delete process.env.TINFOIL_API_KEY;
    process.env.SONNELY_PAUSED_PROVIDERS = "near-ai";
    expect(configuredProviders()).toEqual(["phala"]);
    expect(billing()).toMatchObject({ billingEnabled: true, paymentVerificationEnabled: true });

    process.env.SONNELY_PAUSED_PROVIDERS = "near-ai,phala";
    expect(configuredProviders()).toEqual([]);
    expect(billing()).toMatchObject({ billingEnabled: false, paymentVerificationEnabled: true });
  } finally {
    keys.forEach((key, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("payment verification requires the exact network, finalized transfer, signer and amount", async () => {
  const fetchOriginal = globalThis.fetch;
  let reportedGenesis = genesis;
  let payerSigned = true;
  let received = order.amount;
  let finalized = true;
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === "getGenesisHash") return Response.json({ result: reportedGenesis });
      expect(request.method).toBe("getTransaction");
      expect(request.params[1].commitment).toBe("finalized");
      if (!finalized) return Response.json({ result: null });
      const balance = (owner: string, amount: number, accountIndex: number) => ({
        owner,
        mint: mainnetMint,
        accountIndex,
        uiTokenAmount: { amount: String(amount), decimals: 6 },
      });
      return Response.json({
        result: {
          meta: {
            err: null,
            preTokenBalances: [balance(payer, order.amount, 0), balance(order.recipient, 0, 1)],
            postTokenBalances: [balance(payer, 0, 0), balance(order.recipient, received, 1)],
          },
          transaction: {
            message: {
              accountKeys: [
                { pubkey: payer, signer: payerSigned, writable: true },
                { pubkey: order.reference, signer: false, writable: false },
              ],
            },
          },
        },
      });
    };

    reportedGenesis = genesis.slice(0, 30);
    await expect(verifyCluster(rpc, "mainnet")).rejects.toThrow("different network");
    reportedGenesis = genesis;
    await expect(verifyPayment(rpc, "example-signature", payer, order)).resolves.toBeUndefined();
    payerSigned = false;
    await expect(verifyPayment(rpc, "example-signature", payer, order)).rejects.toThrow("request and wallet");
    payerSigned = true;
    received -= 1;
    await expect(verifyPayment(rpc, "example-signature", payer, order)).rejects.toThrow("requested amount");
    finalized = false;
    await expect(verifyPayment(rpc, "example-signature", payer, order)).rejects.toThrow(
      "No successful payment",
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("production requires public enablement even if the old pilot variable is set", () => {
  const keys = [
    "VERCEL_ENV",
    "SONNELY_PUBLIC_INFERENCE",
    "SONNELY_PILOT_WALLET",
    "NEAR_AI_API_KEY",
    "SONNELY_PAUSED_PROVIDERS",
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    process.env.VERCEL_ENV = "production";
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    process.env.SONNELY_PILOT_WALLET = payer;
    delete process.env.SONNELY_PAUSED_PROVIDERS;
    delete process.env.SONNELY_PUBLIC_INFERENCE;
    expect(managedProviderKey()).toBeUndefined();

    process.env.SONNELY_PUBLIC_INFERENCE = "true";
    expect(managedProviderKey()).toBe("test-provider-key");
  } finally {
    keys.forEach((key, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("NEAR still returns billed costs with new NEAR inference paused", async () => {
  const fetchOriginal = globalThis.fetch;
  const env = process.env;
  const requestId = "e1205616-64f4-48ad-806f-3d1bf421925e";
  try {
    process.env = { ...env, NEAR_AI_API_KEY: "near-fixture", SONNELY_PAUSED_PROVIDERS: "near-ai" };
    expect(managedProviderKey("near-ai")).toBeUndefined();
    globalThis.fetch = async (url, init) => {
      expect(url).toBe("https://cloud-api.near.ai/v1/billing/costs");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer near-fixture");
      return Response.json({ requests: [{ requestId, costNanoUsd: 100 }] });
    };
    await expect(getProviderCosts([requestId])).resolves.toEqual([{ requestId, costNanoUsd: 100 }]);
  } finally {
    process.env = env;
    globalThis.fetch = fetchOriginal;
  }
});

test("prepares an unsigned, simulated USDC transfer with an indexed reference", async () => {
  const { preparePayment } = await import("../lib/payment-transaction");
  const { address, getTransactionDecoder, getCompiledTransactionMessageDecoder } =
    await import("@solana/kit");
  const fetchOriginal = globalThis.fetch;
  try {
    let simulationError: unknown = null;
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === "getLatestBlockhash")
        return Response.json({ result: { value: { blockhash: payer, lastValidBlockHeight: 123 } } });
      expect(request.method).toBe("simulateTransaction");
      expect(request.params[1]).toMatchObject({ sigVerify: false, encoding: "base64" });
      return Response.json({ result: { value: { err: simulationError } } });
    };
    for (const version of ["legacy", 0] as const) {
      const encoded = await preparePayment(rpc, payer, order, version);
      const tx = getTransactionDecoder().decode(Buffer.from(encoded, "base64"));
      expect(Object.entries(tx.signatures)).toEqual([[payer, null]]);
      const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
      if (message.version !== version) throw new Error("Unexpected transaction version");
      const [createAta, transfer] = message.instructions;
      expect(Array.from(createAta.data ?? [])).toEqual([1]);
      expect(Array.from(transfer.data ?? [])).toEqual([12, 64, 75, 76, 0, 0, 0, 0, 0, 6]);
      const referenceIndex = message.staticAccounts.indexOf(address(order.reference));
      expect(transfer.accountIndices?.at(-1)).toBe(referenceIndex);
      expect(referenceIndex).toBeGreaterThanOrEqual(
        message.staticAccounts.length - message.header.numReadonlyNonSignerAccounts,
      );
    }
    simulationError = { InstructionError: [1, { Custom: 1 }] };
    await expect(preparePayment(rpc, payer, order, "legacy")).rejects.toThrow("Your wallet needs 5.00 USDC");
    simulationError = "InsufficientFundsForFee";
    await expect(preparePayment(rpc, payer, order, "legacy")).rejects.toThrow("Your wallet needs more SOL");
    simulationError = { InstructionError: [0, { Custom: 1 }] };
    await expect(preparePayment(rpc, payer, order, "legacy")).rejects.toThrow("did not pass simulation");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("USDC checkout accepts fractional amounts without a five-dollar minimum", async () => {
  const { creditBalance, creditDecimal, parseCreditAmount } = await import("../lib/credit-amount");
  expect(parseCreditAmount("0.000001")).toBe(1);
  expect(parseCreditAmount(0.000001)).toBe(1);
  expect(parseCreditAmount(".125")).toBe(125_000);
  expect(parseCreditAmount("1000.000001")).toBe(1_000_000_001);
  expect(parseCreditAmount("0.0000001")).toBeNull();
  expect(parseCreditAmount("0")).toBeNull();
  expect(parseCreditAmount("-5")).toBeNull();
  expect(parseCreditAmount("9007199254.740992")).toBeNull();
  expect(creditDecimal(1)).toBe("0.000001");
  expect(creditBalance(4_998_674)).toBe("$4.998674");
});
