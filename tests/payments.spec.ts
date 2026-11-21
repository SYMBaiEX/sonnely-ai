import { expect, test } from "@playwright/test";
import { billing, mainnetMint, verifyCluster, verifyPayment } from "../lib/payments";

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

test("opening a mainnet payment requires inference, but confirming it does not", () => {
  const keys = ["SOLANA_TREASURY", "SOLANA_RPC_URL", "SOLANA_BILLING_CLUSTER", "NEAR_AI_API_KEY"] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    process.env.SOLANA_TREASURY = order.recipient;
    process.env.SOLANA_RPC_URL = rpc;
    process.env.SOLANA_BILLING_CLUSTER = "mainnet";
    delete process.env.NEAR_AI_API_KEY;
    expect(billing()).toMatchObject({ billingEnabled: false, paymentVerificationEnabled: true });
    process.env.NEAR_AI_API_KEY = "test-provider-key";
    expect(billing()).toMatchObject({ billingEnabled: true, paymentVerificationEnabled: true });
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
    await expect(verifyPayment(rpc, "example-signature", payer, order)).rejects.toThrow("No finalized");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
