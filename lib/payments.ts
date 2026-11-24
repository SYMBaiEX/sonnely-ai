import { z } from "zod";
import {
  address as solanaAddress,
  createSolanaRpc,
  getBase58Encoder,
  getBase64Encoder,
  isAddress,
  isSignature,
} from "@solana/kit";
import {
  getTransferSolInstructionDataDecoder,
  SYSTEM_PROGRAM_ADDRESS,
  TRANSFER_SOL_DISCRIMINATOR,
} from "@solana-program/system";
import {
  AccountState,
  getTokenDecoder,
  getTransferCheckedInstructionDataDecoder,
  getTransferInstructionDataDecoder,
  TOKEN_PROGRAM_ADDRESS,
  TRANSFER_CHECKED_DISCRIMINATOR,
  TRANSFER_DISCRIMINATOR,
} from "@solana-program/token";
import { getAddress } from "ethers";
import { fundingAtomic, intentFunds, type FundingQuote, type IntentFund } from "./intent-funding";
import { configuredProviders } from "./managed-access";
import type { SolPayment } from "./sol-quote";
import { SonnelyError } from "./sonnely-error";

export const address = z.string().refine(isAddress);
const signatureSchema = z.string().refine(isSignature);
export const mainnetMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const devnetMint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export function billing() {
  const cluster = process.env.SOLANA_BILLING_CLUSTER ?? "devnet";
  const treasury = address.safeParse(process.env.SOLANA_TREASURY);
  const rpc = process.env.SOLANA_RPC_URL;
  const paymentVerificationEnabled =
    treasury.success && Boolean(rpc) && (cluster === "devnet" || cluster === "mainnet");
  const billingEnabled =
    paymentVerificationEnabled && (cluster === "devnet" || configuredProviders().length > 0);
  return {
    billingEnabled,
    paymentVerificationEnabled,
    cluster,
    recipient: treasury.data,
    rpc,
    mint: cluster === "mainnet" ? mainnetMint : devnetMint,
  };
}

const amount = z.string().regex(/^\d+$/);
const tokenBalance = z.object({
  accountIndex: z.int().nonnegative(),
  owner: address.optional(),
  mint: address,
  programId: address.optional(),
  uiTokenAmount: z.object({ amount, decimals: z.int().nonnegative() }),
});
const transaction = z.object({
  blockTime: z.bigint().nullable(),
  meta: z.object({
    err: z.unknown(),
    loadedAddresses: z.object({ writable: z.array(address), readonly: z.array(address) }).optional(),
    preTokenBalances: z.array(tokenBalance).optional(),
    postTokenBalances: z.array(tokenBalance).optional(),
  }),
  transaction: z.object({
    signatures: z.array(signatureSchema),
    message: z.object({
      accountKeys: z.array(address),
      header: z.object({
        numRequiredSignatures: z.int().positive(),
        numReadonlySignedAccounts: z.int().nonnegative(),
        numReadonlyUnsignedAccounts: z.int().nonnegative(),
      }),
      instructions: z.array(
        z.object({
          programIdIndex: z.int().nonnegative(),
          accounts: z.array(z.int().nonnegative()),
          data: z.string(),
        }),
      ),
    }),
  }),
});

export async function verifyCluster(rpc: string, cluster: string) {
  if (cluster !== "devnet" && cluster !== "mainnet")
    throw new SonnelyError("The configured Solana network is unsupported.", 503);
  const expected =
    cluster === "mainnet"
      ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
      : "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  const result = await readRpc(createSolanaRpc(rpc).getGenesisHash());
  if (result !== expected)
    throw new SonnelyError("The configured Solana RPC is on a different network.", 503);
}

async function readRpc<T>(plan: { send(options: { abortSignal: AbortSignal }): Promise<T> }) {
  try {
    return await plan.send({ abortSignal: AbortSignal.timeout(10_000) });
  } catch {
    throw new SonnelyError("Solana RPC could not verify the transaction.", 503);
  }
}

export async function finalizedBlockHeight(rpc: string) {
  const height = await readRpc(createSolanaRpc(rpc).getBlockHeight({ commitment: "finalized" }));
  if (typeof height !== "bigint" || height < 0n || height > BigInt(Number.MAX_SAFE_INTEGER))
    throw new SonnelyError("Solana finalized block height is unavailable.", 503);
  return Number(height);
}

const treasuryAccounts = z.object({
  value: z.array(
    z.object({
      pubkey: address,
      account: z.object({
        owner: z.literal(TOKEN_PROGRAM_ADDRESS),
        executable: z.literal(false),
        data: z.tuple([z.base64(), z.literal("base64")]),
      }),
    }),
  ),
});

export async function treasuryBalance(rpc: string, treasury: string) {
  if (!isAddress(treasury)) throw new SonnelyError("Treasury USDC balance is unavailable.", 503);
  const response = await readRpc(
    createSolanaRpc(rpc).getTokenAccountsByOwner(
      treasury,
      { mint: solanaAddress(mainnetMint) },
      { commitment: "finalized", encoding: "base64" },
    ),
  );
  const parsed = treasuryAccounts.safeParse(response);
  if (!parsed.success) throw new SonnelyError("Treasury USDC balance is unavailable.", 503);
  const decoder = getTokenDecoder();
  const base64 = getBase64Encoder();
  const seen = new Set<string>();
  try {
    return parsed.data.value.reduce((total, { pubkey, account }) => {
      const bytes = base64.encode(account.data[0]);
      if (seen.has(pubkey) || bytes.length !== decoder.fixedSize) throw new Error();
      seen.add(pubkey);
      const token = decoder.decode(bytes);
      if (token.owner !== treasury || token.mint !== mainnetMint) throw new Error();
      return token.state === AccountState.Initialized ? total + token.amount : total;
    }, 0n);
  } catch {
    throw new SonnelyError("Treasury USDC balance is unavailable.", 503);
  }
}

export async function findPaymentSignatures(
  rpc: string,
  reference: string,
  commitment: "confirmed" | "finalized",
) {
  if (!isAddress(reference)) throw new SonnelyError("This payment reference is invalid.");
  const result = await readRpc(
    createSolanaRpc(rpc).getSignaturesForAddress(reference, { commitment, limit: 20 }),
  );
  const parsed = z.array(z.object({ signature: signatureSchema, err: z.unknown() })).safeParse(result);
  if (!parsed.success) throw new SonnelyError("Solana RPC could not check the payment history.", 503);
  return parsed.data.filter((entry) => entry.err === null).map((entry) => entry.signature);
}

type PaymentOrder = {
  reference: string;
  recipient: string;
  mint: string;
  amount: number;
  cluster: string;
  sol?: SolPayment;
};

type TokenBalance = z.infer<typeof tokenBalance>;
const instructionBytes = getBase58Encoder();
const systemTransfer = getTransferSolInstructionDataDecoder();
const tokenTransfer = getTransferInstructionDataDecoder();
const tokenTransferChecked = getTransferCheckedInstructionDataDecoder();

function verifyTransfer(result: z.infer<typeof transaction>, wallet: string, order: PaymentOrder) {
  const { sol } = order;
  if (sol) {
    if (result.blockTime === null || result.blockTime <= 0n)
      throw new SonnelyError("The finalized SOL transfer has no valid block time.");
    if (result.blockTime * 1000n > BigInt(sol.expiresAt))
      throw new SonnelyError(
        "This SOL payment was sent after the quote expired. Contact support with its signature.",
      );
  }
  const { accountKeys, header, instructions } = result.transaction.message;
  const { loadedAddresses: loaded, preTokenBalances: pre, postTokenBalances: post } = result.meta;
  const { numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts } = header;
  const keys: string[] = [...accountKeys, ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])];
  const signedWritable = numRequiredSignatures - numReadonlySignedAccounts;
  const readonlyStart = accountKeys.length - numReadonlyUnsignedAccounts;
  const readonlyLookupStart = accountKeys.length + (loaded?.writable.length ?? 0);
  const writable = (index: number) =>
    index < signedWritable ||
    (index >= numRequiredSignatures && index < readonlyStart) ||
    (index >= accountKeys.length && index < readonlyLookupStart);
  const ref = keys.indexOf(order.reference);
  const signer = keys.indexOf(wallet);
  const readonlyReference = (ref >= readonlyStart && ref < accountKeys.length) || ref >= readonlyLookupStart;
  if (
    signedWritable < 0 ||
    numRequiredSignatures > readonlyStart ||
    new Set(keys).size !== keys.length ||
    !readonlyReference ||
    signer < 0 ||
    signer >= numRequiredSignatures
  )
    throw new SonnelyError("The signature does not match this payment request and wallet.");

  const tokenBalances = (balances: TokenBalance[], owner: string) =>
    balances.filter(
      (balance) =>
        balance.accountIndex < keys.length &&
        balance.owner === owner &&
        balance.mint === order.mint &&
        balance.uiTokenAmount.decimals === 6 &&
        (!balance.programId || balance.programId === TOKEN_PROGRAM_ADDRESS),
    );
  const sourceBalances = tokenBalances(pre ?? [], wallet);
  const recipientBalances = tokenBalances(post ?? [], order.recipient);
  // A wallet may append unrelated instructions after the Solana Pay transfer.
  const matches = instructions.filter(({ programIdIndex, accounts, data }) => {
    if (accounts.at(-1) !== ref) return false;
    try {
      const program = keys[programIdIndex];
      const bytes = instructionBytes.encode(data);
      if (sol) {
        if (
          program !== SYSTEM_PROGRAM_ADDRESS ||
          accounts.length !== 3 ||
          bytes.length !== systemTransfer.fixedSize
        )
          return false;
        const [from, to] = accounts;
        const { discriminator, amount: lamports } = systemTransfer.decode(bytes);
        return (
          from === signer &&
          writable(from) &&
          writable(to) &&
          keys[to] === order.recipient &&
          discriminator === TRANSFER_SOL_DISCRIMINATOR &&
          lamports === BigInt(sol.lamports)
        );
      }
      if (program !== TOKEN_PROGRAM_ADDRESS) return false;
      const checked = bytes[0] === TRANSFER_CHECKED_DISCRIMINATOR;
      const unchecked = bytes[0] === TRANSFER_DISCRIMINATOR;
      if (!checked && !unchecked) return false;
      const [source, destination, authority] = checked ? [accounts[0], accounts[2], accounts[3]] : accounts;
      if (checked) {
        if (
          accounts.length !== 5 ||
          bytes.length !== tokenTransferChecked.fixedSize ||
          keys[accounts[1]] !== order.mint
        )
          return false;
        const transfer = tokenTransferChecked.decode(bytes);
        if (transfer.decimals !== 6 || transfer.amount !== BigInt(order.amount)) return false;
      } else {
        if (accounts.length !== 4 || bytes.length !== tokenTransfer.fixedSize) return false;
        if (tokenTransfer.decode(bytes).amount !== BigInt(order.amount)) return false;
      }
      return (
        authority === signer &&
        writable(source) &&
        writable(destination) &&
        sourceBalances.some((balance) => balance.accountIndex === source) &&
        recipientBalances.some((balance) => balance.accountIndex === destination)
      );
    } catch {
      return false;
    }
  });
  const asset = sol ? "SOL" : "USDC";
  if (matches.length !== 1) throw new SonnelyError(`The ${asset} transfer does not match this payment.`);
  if (sol) return;

  const total = (balances: TokenBalance[]) =>
    balances.reduce((sum, balance) => sum + BigInt(balance.uiTokenAmount.amount), 0n);
  if (
    total(recipientBalances) - total(tokenBalances(pre ?? [], order.recipient)) !== BigInt(order.amount) ||
    total(tokenBalances(post ?? [], wallet)) - total(sourceBalances) !== -BigInt(order.amount)
  )
    throw new SonnelyError("The finalized USDC transfer does not match the requested amount.");
}

export async function verifyPayment(
  rpc: string,
  signature: string,
  wallet: string,
  order: PaymentOrder,
  commitment: "confirmed" | "finalized" = "finalized",
  verifyNetwork = true,
) {
  if (!isSignature(signature)) throw new SonnelyError("This payment signature is invalid.");
  if (verifyNetwork) await verifyCluster(rpc, order.cluster);
  const result = await readRpc(
    createSolanaRpc(rpc).getTransaction(signature, {
      commitment,
      encoding: "json",
      maxSupportedTransactionVersion: 1,
    }),
  );
  const tx = transaction.safeParse(result);
  if (!tx.success || tx.data.meta.err !== null || tx.data.transaction.signatures[0] !== signature)
    throw new SonnelyError("No successful payment was found at the required confirmation level.");
  verifyTransfer(tx.data, wallet, order);
}

export async function findMatchingPayment(
  rpc: string,
  wallet: string,
  order: Parameters<typeof verifyPayment>[3],
  commitment: "confirmed" | "finalized",
) {
  const signatures = await findPaymentSignatures(rpc, order.reference, commitment);
  for (const signature of signatures) {
    try {
      await verifyPayment(rpc, signature, wallet, order, commitment, false);
      return signature;
    } catch (error) {
      if (!(error instanceof SonnelyError) || error.status !== 400) throw error;
    }
  }
  return null;
}

const destinationAsset = "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";

export async function quote(
  wallet: string,
  input: { asset: IntentFund; amount: string; refundTo?: string; prepare?: boolean },
): Promise<FundingQuote> {
  const token = process.env.NEAR_INTENTS_API_KEY;
  const { asset, amount: quantity, prepare = false } = input;
  if (prepare && (!token || billing().cluster !== "mainnet")) {
    throw new SonnelyError("Cross-chain funding is unavailable.", 503);
  }
  const fund = intentFunds[asset];
  const amountIn = fundingAtomic(quantity, fund.decimals);
  if (amountIn === null) throw new SonnelyError("Enter a positive amount within the token's precision.");

  let refundTo = wallet;
  if (asset !== "sol") {
    try {
      refundTo = getAddress(input.refundTo ?? "");
      if (refundTo === "0x0000000000000000000000000000000000000000") throw new Error();
    } catch {
      throw new SonnelyError("Enter a valid refund wallet for the selected network.");
    }
  }
  const deadline = new Date(Date.now() + (prepare ? 15 : 3) * 60_000).toISOString();
  const quoteRequest = {
    dry: !prepare,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: fund.id,
    depositType: "ORIGIN_CHAIN",
    destinationAsset,
    amount: amountIn,
    recipient: wallet,
    recipientType: "DESTINATION_CHAIN",
    refundTo,
    refundType: "ORIGIN_CHAIN",
    deadline,
  };

  const result = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify(quoteRequest),
  }).catch(() => null);
  const parsed = z
    .object({
      quoteRequest: z.record(z.string(), z.unknown()),
      quote: z.object({
        amountIn: amount,
        amountOut: amount,
        minAmountOut: amount,
        depositAddress: z.string().min(1).max(128).optional(),
        depositMemo: z.string().min(1).max(100).optional(),
        deadline: z.iso.datetime().optional(),
      }),
    })
    .safeParse(result?.ok ? await result.json().catch(() => null) : null);
  if (!parsed.success) {
    throw new SonnelyError("No quote was available. Check the amount and try again.", 502);
  }

  const { quote: expected, quoteRequest: echoed } = parsed.data;
  const acceptUntil =
    expected.deadline && Date.parse(expected.deadline) < Date.parse(deadline) ? expected.deadline : deadline;
  const deliverable =
    BigInt(expected.minAmountOut) > 0n && BigInt(expected.amountOut) >= BigInt(expected.minAmountOut);
  const matches = [
    "dry",
    "swapType",
    "originAsset",
    "depositType",
    "destinationAsset",
    "amount",
    "recipient",
    "recipientType",
    "refundTo",
    "refundType",
    "slippageTolerance",
    "deadline",
  ].every((key) => echoed[key] === quoteRequest[key as keyof typeof quoteRequest]);
  const validDeposit =
    expected.depositAddress &&
    (asset === "sol"
      ? address.safeParse(expected.depositAddress).success
      : /^0x[0-9a-fA-F]{40}$/.test(expected.depositAddress) && !/^0x0{40}$/.test(expected.depositAddress));
  if (
    !deliverable ||
    !matches ||
    BigInt(expected.amountIn) !== BigInt(amountIn) ||
    (prepare && (!validDeposit || !expected.deadline || Date.parse(acceptUntil) <= Date.now()))
  ) {
    throw new SonnelyError("NEAR Intents returned inconsistent swap details. Request a new quote.", 502);
  }
  return {
    amountOut: expected.amountOut,
    minAmountOut: expected.minAmountOut,
    deadline: acceptUntil,
    recipient: wallet,
    refundTo,
    ...(prepare ? { depositAddress: expected.depositAddress, depositMemo: expected.depositMemo } : {}),
  };
}
