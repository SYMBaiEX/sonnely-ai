import { expect, test } from "@playwright/test";
import {
  TOKEN_PROGRAM_ADDRESS,
  getTransferCheckedInstructionDataEncoder,
  getTransferInstructionDataEncoder,
} from "@solana-program/token";
import bs58 from "bs58";
import { configuredProviders, managedProviderKey } from "../lib/managed-access";
import { billing, mainnetMint, verifyCluster, verifyPayment } from "../lib/payments";
import { getProviderCosts } from "../lib/provider-billing";

const rpc = "https://rpc.example.test";
const genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const payer = "11111111111111111111111111111112";
const paymentSignature = bs58.encode(new Uint8Array(64).fill(17));
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
  let checked = true;
  let transferReferencesOrder = true;
  let transferAuthority = 0;
  const source = "11111111111111111111111111111115";
  const destination = "11111111111111111111111111111116";
  const otherSigner = "11111111111111111111111111111117";
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === "getGenesisHash") return Response.json({ result: reportedGenesis });
      expect(request.method).toBe("getTransaction");
      expect(request.params[1].commitment ?? "finalized").toBe("finalized");
      expect(request.params[1]).toMatchObject({ encoding: "json", maxSupportedTransactionVersion: 1 });
      if (!finalized) return Response.json({ result: null });
      const balance = (owner: string, amount: number, accountIndex: number) => ({
        owner,
        mint: mainnetMint,
        programId: TOKEN_PROGRAM_ADDRESS,
        accountIndex,
        uiTokenAmount: { amount: String(amount), decimals: 6 },
      });
      const data = checked
        ? getTransferCheckedInstructionDataEncoder().encode({ amount: order.amount, decimals: 6 })
        : getTransferInstructionDataEncoder().encode({ amount: order.amount });
      const accounts = checked ? [2, 4, 3, transferAuthority] : [2, 3, transferAuthority];
      if (transferReferencesOrder) accounts.push(6);
      return Response.json({
        result: {
          version: 0,
          blockTime: 1_799_999_999,
          meta: {
            err: null,
            loadedAddresses: { writable: [], readonly: [order.reference] },
            preTokenBalances: [balance(payer, order.amount, 2), balance(order.recipient, 0, 3)],
            postTokenBalances: [balance(payer, 0, 2), balance(order.recipient, received, 3)],
          },
          transaction: {
            signatures: [paymentSignature],
            message: {
              accountKeys: [
                payerSigned ? payer : otherSigner,
                payerSigned ? otherSigner : payer,
                source,
                destination,
                mainnetMint,
                TOKEN_PROGRAM_ADDRESS,
              ],
              header: {
                numRequiredSignatures: 1,
                numReadonlySignedAccounts: 0,
                numReadonlyUnsignedAccounts: 2,
              },
              instructions: [{ programIdIndex: 5, accounts, data: bs58.encode(Uint8Array.from(data)) }],
            },
          },
        },
      });
    };

    reportedGenesis = genesis.slice(0, 30);
    await expect(verifyCluster(rpc, "mainnet")).rejects.toThrow("different network");
    reportedGenesis = genesis;
    await expect(verifyPayment(rpc, paymentSignature, payer, order)).resolves.toBeUndefined();
    checked = false;
    await expect(verifyPayment(rpc, paymentSignature, payer, order)).resolves.toBeUndefined();
    transferReferencesOrder = false;
    await expect(verifyPayment(rpc, paymentSignature, payer, order)).rejects.toThrow(
      "transfer does not match",
    );
    transferReferencesOrder = true;
    transferAuthority = 1;
    await expect(verifyPayment(rpc, paymentSignature, payer, order)).rejects.toThrow(
      "transfer does not match",
    );
    transferAuthority = 0;
    payerSigned = false;
    await expect(verifyPayment(rpc, paymentSignature, payer, order)).rejects.toThrow("request and wallet");
    payerSigned = true;
    received -= 1;
    await expect(verifyPayment(rpc, paymentSignature, payer, order)).rejects.toThrow("requested amount");
    finalized = false;
    await expect(verifyPayment(rpc, paymentSignature, payer, order)).rejects.toThrow("No successful payment");
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

test("prepares unsigned, simulated SOL and USDC transfers with indexed references", async () => {
  const { preparePaymentEnvelope, paymentEnvelopeResponse } = await import("../lib/payment-transaction");
  const {
    AccountRole,
    address,
    decompileTransactionMessage,
    getTransactionDecoder,
    getCompiledTransactionMessageDecoder,
  } = await import("@solana/kit");
  const { getTransferSolInstructionDataDecoder, SYSTEM_PROGRAM_ADDRESS } =
    await import("@solana-program/system");
  const fetchOriginal = globalThis.fetch;
  try {
    let simulationError: unknown = null;
    let includeDataSize = true;
    const simulated: Array<{ encoded: string; replaceRecentBlockhash?: boolean }> = [];
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const reply = (value: unknown) =>
        Response.json({ jsonrpc: "2.0", id: request.id, result: { context: { slot: 123 }, value } });
      if (request.method === "getLatestBlockhash")
        return reply({ blockhash: payer, lastValidBlockHeight: 123 });
      expect(request.method).toBe("simulateTransaction");
      expect(request.params[1]).toMatchObject({ sigVerify: false, encoding: "base64" });
      simulated.push({
        encoded: request.params[0],
        replaceRecentBlockhash: request.params[1].replaceRecentBlockhash,
      });
      return reply(
        simulationError
          ? { err: simulationError }
          : {
              err: null,
              unitsConsumed: 40_000,
              ...(includeDataSize && { loadedAccountsDataSize: 32_700 }),
            },
      );
    };
    for (const version of [0, 1] as const) {
      const { transaction: encoded, lastValidBlockHeight } = await preparePaymentEnvelope(
        rpc,
        payer,
        order,
        version,
      );
      expect(lastValidBlockHeight).toBe(123);
      expect(paymentEnvelopeResponse(encoded, version)).toEqual({ transaction: encoded });
      expect(() => paymentEnvelopeResponse(encoded, version === 0 ? 1 : 0)).toThrow("still active");
      const tx = getTransactionDecoder().decode(Buffer.from(encoded, "base64"));
      expect(Object.entries(tx.signatures)).toEqual([[payer, null]]);
      const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
      if (compiled.version !== version) throw new Error("Unexpected transaction version");
      const message = decompileTransactionMessage(compiled);
      if (message.version === 1)
        expect(message.config).toMatchObject({
          computeUnitLimit: 46_000,
          loadedAccountsDataSizeLimit: 64 * 1024,
        });
      const [createAta, transfer] = message.instructions;
      expect(Array.from(createAta.data ?? [])).toEqual([1]);
      expect(Array.from(transfer.data ?? [])).toEqual([12, 64, 75, 76, 0, 0, 0, 0, 0, 6]);
      expect(transfer.accounts?.at(-1)).toMatchObject({
        address: address(order.reference),
        role: AccountRole.READONLY,
      });
      expect(simulated.at(-1)?.encoded).toBe(encoded);
    }
    expect(simulated.map((request) => Boolean(request.replaceRecentBlockhash))).toEqual([false, true, false]);
    const sol = { lamports: 5_000_000, expiresAt: Date.now() + 60_000, priceUsd: "1000" };
    const { transaction: native } = await preparePaymentEnvelope(rpc, payer, { ...order, sol });
    const nativeTx = getTransactionDecoder().decode(Buffer.from(native, "base64"));
    const nativeMessage = decompileTransactionMessage(
      getCompiledTransactionMessageDecoder().decode(nativeTx.messageBytes),
    );
    expect(nativeMessage.version).toBe(1);
    expect(nativeMessage.instructions).toHaveLength(1);
    const [nativeTransfer] = nativeMessage.instructions;
    expect(nativeTransfer.programAddress).toBe(SYSTEM_PROGRAM_ADDRESS);
    expect(nativeTransfer.accounts?.at(-1)).toMatchObject({
      address: address(order.reference),
      role: AccountRole.READONLY,
    });
    expect(getTransferSolInstructionDataDecoder().decode(nativeTransfer.data!).amount).toBe(
      BigInt(sol.lamports),
    );
    expect(simulated.at(-1)?.encoded).toBe(native);

    includeDataSize = false;
    await expect(preparePaymentEnvelope(rpc, payer, order)).rejects.toThrow("could not prepare the payment");
    simulationError = { InstructionError: [1, { Custom: 1 }] };
    await expect(preparePaymentEnvelope(rpc, payer, order)).rejects.toThrow("Your wallet needs 5.00 USDC");
    simulationError = "InsufficientFundsForFee";
    await expect(preparePaymentEnvelope(rpc, payer, order)).rejects.toThrow("Your wallet needs more SOL");
    simulationError = { InstructionError: [0, { Custom: 1 }] };
    await expect(preparePaymentEnvelope(rpc, payer, order, 0)).rejects.toThrow("did not pass simulation");
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

test("native SOL credits require the exact referenced system transfer before quote expiry", async () => {
  const fetchOriginal = globalThis.fetch;
  const sol = { lamports: 50_000_000, expiresAt: 1_800_000_000_000, priceUsd: "100" };
  const data = Buffer.alloc(12);
  data.writeUInt32LE(2, 0);
  data.writeBigUInt64LE(BigInt(sol.lamports), 4);
  const message = {
    accountKeys: [payer, order.recipient, order.reference, "11111111111111111111111111111111"],
    header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 2 },
    instructions: [{ programIdIndex: 3, accounts: [0, 1, 2], data: bs58.encode(data) }],
  };
  const result = {
    version: 1,
    blockTime: 1_799_999_999,
    meta: { err: null },
    transaction: { message, signatures: [paymentSignature] },
  };
  globalThis.fetch = async (_url, init) => {
    const { params } = JSON.parse(String(init?.body));
    expect(params[1].commitment ?? "finalized").toBe("finalized");
    expect(params[1]).toMatchObject({
      encoding: "json",
      maxSupportedTransactionVersion: 1,
    });
    return Response.json({ result });
  };
  try {
    await expect(
      verifyPayment(rpc, paymentSignature, payer, { ...order, sol }, "finalized", false),
    ).resolves.toBeUndefined();
    await expect(
      verifyPayment(
        rpc,
        paymentSignature,
        payer,
        { ...order, sol: { ...sol, lamports: 1 } },
        "finalized",
        false,
      ),
    ).rejects.toThrow(/does not match/);
    message.instructions[0].accounts = [0, 1, 3];
    await expect(
      verifyPayment(rpc, paymentSignature, payer, { ...order, sol }, "finalized", false),
    ).rejects.toThrow(/does not match/);
    message.instructions[0].accounts = [0, 1, 2];
    result.blockTime = 1_800_000_001;
    await expect(
      verifyPayment(rpc, paymentSignature, payer, { ...order, sol }, "finalized", false),
    ).rejects.toThrow(/expired/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("SOL quotes round up to whole lamports and reject stale prices", async () => {
  const { quoteSolPayment, solDecimal } = await import("../lib/sol-quote");
  const fetchOriginal = globalThis.fetch;
  let observed = Date.now();
  globalThis.fetch = async () => Response.json({ price: "73.125", time: new Date(observed).toISOString() });
  try {
    const quote = await quoteSolPayment(5_000_000);
    expect(quote.lamports).toBe(68_376_069);
    expect(solDecimal(quote.lamports)).toBe("0.068376069");
    expect(quote.expiresAt).toBeGreaterThan(observed + 299_000);
    observed -= 61_000;
    await expect(quoteSolPayment(5_000_000)).rejects.toThrow(/fresh SOL\/USD price/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
