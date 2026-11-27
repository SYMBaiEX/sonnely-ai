// spec/app/billing/deposits.md, "A finalized transfer is bound to wallet, asset, exact amounts and reference"
import { describe, expect, it, vi } from "vitest";
import bs58 from "bs58";
import { decompileTransactionMessage, getCompiledTransactionMessageDecoder, getTransactionDecoder, getBase64Encoder } from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  getTransferCheckedInstructionDataEncoder,
  getTransferInstructionDataEncoder,
} from "@solana-program/token";
import {
  PaymentPreparationRejected,
  mints,
  preparePaymentEnvelope,
  verifyPayment,
  type PaymentOrder,
} from "../src/api/billing/solana.ts";

const rpc = "https://rpc.example.test";
const genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const payer = "11111111111111111111111111111112";
const paymentSignature = bs58.encode(new Uint8Array(64).fill(17));
const order: PaymentOrder = {
  reference: "11111111111111111111111111111113",
  recipient: "11111111111111111111111111111114",
  mint: mints.mainnet,
  asset: "USDC",
  atomic: 5_000_000,
};

function jsonRpc(result: unknown, id: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

describe("Solana deposit verification", () => {
  it("requires the exact finalized network, signer, reference and amount", async () => {
    let reportedGenesis = genesis;
    let payerSigned = true;
    let received = order.atomic;
    let finalized = true;
    let checked = true;
    let transferReferencesOrder = true;
    const source = "11111111111111111111111111111115";
    const destination = "11111111111111111111111111111116";
    const otherSigner = "11111111111111111111111111111117";
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const batched = Array.isArray(payload) ? payload : [payload];
      const request = batched[0];
      const reply = (result: unknown) => {
        const one = jsonRpc(result, request.id);
        return Array.isArray(payload) ? Response.json([JSON.parse(JSON.stringify(one))].map(() => ({ jsonrpc: "2.0", id: request.id, result }))) : one;
      };
      if (request.method === "getGenesisHash") return reply(reportedGenesis);
      expect(request.method).toBe("getTransaction");
      expect(request.params[1].commitment ?? "finalized").toBe("finalized");
      expect(request.params[1]).toMatchObject({ encoding: "json", maxSupportedTransactionVersion: 1 });
      if (!finalized) return reply(null);
      const balance = (owner: string, amount: number, accountIndex: number) => ({
        owner,
        mint: mints.mainnet,
        programId: TOKEN_PROGRAM_ADDRESS,
        accountIndex,
        uiTokenAmount: { amount: String(amount), decimals: 6 },
      });
      const data = checked
        ? getTransferCheckedInstructionDataEncoder().encode({ amount: order.atomic, decimals: 6 })
        : getTransferInstructionDataEncoder().encode({ amount: order.atomic });
      const accounts = checked ? [2, 4, 3, 0] : [2, 3, 0];
      if (transferReferencesOrder) accounts.push(6);
      return reply({
          version: 0,
          blockTime: 1_799_999_999,
          meta: {
            err: null,
            loadedAddresses: { writable: [], readonly: [order.reference] },
            preTokenBalances: [balance(payer, order.atomic, 2), balance(order.recipient, 0, 3)],
            postTokenBalances: [balance(payer, 0, 2), balance(order.recipient, received, 3)],
          },
          transaction: {
            signatures: [paymentSignature],
            message: {
              accountKeys: [payerSigned ? payer : otherSigner, payerSigned ? otherSigner : payer, source, destination, mints.mainnet, TOKEN_PROGRAM_ADDRESS],
              header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 2 },
              instructions: [{ programIdIndex: 5, accounts, data: bs58.encode(Uint8Array.from(data)) }],
            },
          },
        });
    });

    reportedGenesis = genesis.slice(0, 30);
    await expect(verifyPayment(rpc, paymentSignature, payer, order, "mainnet")).rejects.toThrow("different network");
    reportedGenesis = genesis;
    await expect(verifyPayment(rpc, paymentSignature, payer, order, "mainnet")).resolves.toEqual({ signature: paymentSignature, blockTime: 1_799_999_999 });
    checked = false;
    await expect(verifyPayment(rpc, paymentSignature, payer, order, "mainnet")).resolves.toEqual({ signature: paymentSignature, blockTime: 1_799_999_999 });
    transferReferencesOrder = false;
    await expect(verifyPayment(rpc, paymentSignature, payer, order, "mainnet")).rejects.toThrow("transfer does not match");
    transferReferencesOrder = true;
    payerSigned = false;
    await expect(verifyPayment(rpc, paymentSignature, payer, order, "mainnet")).rejects.toThrow("request and wallet");
    payerSigned = true;
    received -= 1;
    await expect(verifyPayment(rpc, paymentSignature, payer, order, "mainnet")).rejects.toThrow("requested amount");
    received = order.atomic;
    finalized = false;
    await expect(verifyPayment(rpc, paymentSignature, payer, order, "mainnet")).rejects.toThrow("required confirmation");
    vi.unstubAllGlobals();
  });
});

describe("server-prepared deposits", () => {
  function stubPreparationRpc(err: unknown = null) {
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === "getLatestBlockhash") {
        return jsonRpc(
          { context: { slot: 10 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 123 } },
          request.id,
        );
      }
      expect(request.method).toBe("simulateTransaction");
      return jsonRpc({ context: { slot: 10 }, value: err === null ? { err, logs: [], unitsConsumed: 40_000, loadedAccountsDataSize: 32_700 } : { err, logs: [] } }, request.id);
    });
  }

  it("builds a v0 SOL transfer for the payer, recipient and reference", async () => {
    stubPreparationRpc();
    const solOrder: PaymentOrder = { ...order, asset: "SOL", atomic: 123_456 };
    const prepared = await preparePaymentEnvelope(rpc, payer, solOrder, 0);
    expect(prepared.lastValidBlockHeight).toBe(123);
    const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(prepared.transaction));
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    expect(message.version).toBe(0);
    expect(message.staticAccounts[0]).toBe(payer);
    expect(message.staticAccounts).toContain(order.recipient);
    expect(message.staticAccounts).toContain(order.reference);
    vi.unstubAllGlobals();
  });


  it("builds a v1 USDC transfer with resource limits and the payment reference", async () => {
    stubPreparationRpc();
    const prepared = await preparePaymentEnvelope(rpc, payer, order, 1);
    const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(prepared.transaction));
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    expect(message.version).toBe(1);
    expect(message.staticAccounts[0]).toBe(payer);
    expect(message.staticAccounts).toContain(order.reference);
    expect(decompileTransactionMessage(message).instructions.length).toBeGreaterThanOrEqual(2);
    vi.unstubAllGlobals();
  });

  it("turns an insufficient USDC simulation into a wallet-balance error", async () => {
    stubPreparationRpc({ InstructionError: [1, { Custom: 1 }] });
    await expect(preparePaymentEnvelope(rpc, payer, order, 0)).rejects.toBeInstanceOf(PaymentPreparationRejected);
    await expect(preparePaymentEnvelope(rpc, payer, order, 0)).rejects.toThrow("needs 5 USDC");
    vi.unstubAllGlobals();
  });
});

describe("NEAR Intents server quotes", () => {
  it("binds prepared quotes to the echoed request and deposit details", async () => {
    const { quoteIntentFunding } = await import("../src/api/billing/intents.ts");
    const wallet = payer;
    const amount = "1.5";
    const amountIn = "1500000000";
    const deadline = new Date(Date.now() + 10 * 60_000).toISOString();
    const quoteRequest = {
      dry: false,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: "nep141:sol.omft.near",
      depositType: "ORIGIN_CHAIN",
      destinationAsset: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
      amount: amountIn,
      recipient: wallet,
      recipientType: "DESTINATION_CHAIN",
      refundTo: wallet,
      refundType: "ORIGIN_CHAIN",
    };
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body));
      expect(init?.headers).toMatchObject({ Authorization: "Bearer token-fixture" });
      return Response.json({
        quoteRequest: { ...quoteRequest, deadline: sent.deadline },
        quote: {
          amountIn,
          amountOut: "1490000",
          minAmountOut: "1480000",
          depositAddress: order.recipient,
          deadline,
        },
      });
    });
    const quote = await quoteIntentFunding(wallet, { asset: "sol", amount, prepare: true }, "token-fixture", "mainnet");
    expect(quote).toMatchObject({ amountOut: "1490000", depositAddress: order.recipient, recipient: wallet });
    expect("amountIn" in quote).toBe(false);
    vi.unstubAllGlobals();
  });

  it("refuses a prepared quote whose echoed request or input amount changed", async () => {
    const { quoteIntentFunding, IntentQuoteRejected } = await import("../src/api/billing/intents.ts");
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body));
      return Response.json({
        quoteRequest: { ...sent, recipient: order.recipient },
        quote: { amountIn: sent.amount, amountOut: "1", minAmountOut: "1", depositAddress: order.recipient, deadline: sent.deadline },
      });
    });
    await expect(quoteIntentFunding(payer, { asset: "sol", amount: "1", prepare: true }, "token-fixture", "mainnet")).rejects.toBeInstanceOf(
      IntentQuoteRejected,
    );
    vi.unstubAllGlobals();
  });
});
