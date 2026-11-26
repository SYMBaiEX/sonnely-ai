// spec/app/billing/deposits.md, "A finalized transfer is bound to wallet, asset, exact amounts and reference":
// the Solana edge of billing. Verification reads the configured cluster at finalized commitment and binds
// recipient, reference, asset and the exact amount, as the repo's Solana rule requires.
import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import QRCode from "qrcode";
import {
  AccountRole,
  address as solanaAddress,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createDefaultRpcTransport,
  createNoopSigner,
  createSolanaRpc,
  createSolanaRpcFromTransport,
  createTransactionMessage,
  estimateResourceLimitsFactory,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  getTransactionVersionDecoder,
  isAddress,
  isSignature,
  isSolanaError,
  lamports,
  pipe,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  SOLANA_ERROR__TRANSACTION__FAILED_TO_ESTIMATE_COMPUTE_LIMIT,
  type NoopSigner,
  type RpcTransport,
  type TransactionMessage,
} from "@solana/kit";
import {
  getTransferSolInstruction,
  getTransferSolInstructionDataDecoder,
  SYSTEM_PROGRAM_ADDRESS,
  TRANSFER_SOL_DISCRIMINATOR,
} from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTokenSize,
  getTransferCheckedInstruction,
  getTransferCheckedInstructionDataDecoder,
  getTransferInstructionDataDecoder,
  TOKEN_ERROR__INSUFFICIENT_FUNDS,
  TOKEN_PROGRAM_ADDRESS,
  TRANSFER_CHECKED_DISCRIMINATOR,
  TRANSFER_DISCRIMINATOR,
} from "@solana-program/token";
import { z } from "zod";

export type PaymentAsset = "SOL" | "USDC";
export type PaymentOrder = {
  reference: string;
  recipient: string;
  mint: string;
  asset: PaymentAsset;
  atomic: number;
};

export class RpcUnavailable extends Error {}
export class PaymentRejected extends Error {}
export class PaymentPreparationRejected extends Error {}

export const address = z.string().refine(isAddress);
export const genesisHashes: Record<string, string> = {
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
};
export const mints: Record<string, string> = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

/** @throws {never} */
export function newReference() {
  return bs58.encode(randomBytes(32));
}

/** @throws {never} */
export function isValidAddress(value: string) {
  try {
    return isAddress(value);
  } catch {
    return false;
  }
}

/** @throws {never} */
export function creditDecimal(micros: number) {
  const units = BigInt(micros);
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return whole + (fraction ? "." + fraction : "");
}

/** @throws {never} */
export function creditBalance(micros: number) {
  return "$" + creditDecimal(micros);
}

/** @throws {never} */
export function solDecimal(lamports: number) {
  const value = BigInt(lamports);
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? whole + "." + fraction : whole.toString();
}

/** The lamports a USD credit amount buys at `priceUsd` (SOL quote in `lib/sol-quote.ts`). @throws {never} */
export function solAtomic(creditMicros: number, priceUsd: string): number | null {
  const m = /^(\d{1,10})(?:\.(\d{1,9}))?$/.exec(priceUsd.trim());
  if (!m) return null;
  const denominator = BigInt(m[1]) * 1_000_000_000n + BigInt((m[2] ?? "").padEnd(9, "0"));
  if (denominator <= 0n) return null;
  const lamports = Number((BigInt(creditMicros) * 1_000_000_000_000n + denominator - 1n) / denominator);
  return Number.isSafeInteger(lamports) && lamports > 0 ? lamports : null;
}

/** The Solana Pay link for an open intent (legacy `paymentDraft`). @throws {never} */
export function paymentUri(order: PaymentOrder): string {
  const payment = new URLSearchParams({
    amount: order.asset === "SOL" ? solDecimal(order.atomic) : creditDecimal(order.atomic),
    ...(order.asset === "SOL" ? {} : { "spl-token": order.mint }),
    reference: order.reference,
    label: "Sonnely",
    message: "Compute credit top-up",
  });
  return "solana:" + order.recipient + "?" + payment.toString();
}

export async function paymentQr(uri: string) {
  return QRCode.toDataURL(uri, { margin: 2, width: 220 });
}

async function readRpc<T>(plan: { send(options: { abortSignal: AbortSignal }): Promise<T> }) {
  try {
    return await plan.send({ abortSignal: AbortSignal.timeout(10_000) });
  } catch {
    throw new RpcUnavailable("Solana RPC could not verify the transaction.");
  }
}

export async function verifyCluster(rpc: string, cluster: string) {
  const expected = genesisHashes[cluster];
  if (!expected) throw new RpcUnavailable("The configured Solana network is unsupported.");
  const result = await readRpc(createSolanaRpc(rpc).getGenesisHash());
  if (result !== expected) throw new RpcUnavailable("The configured Solana RPC is on a different network.");
}

export type PaymentTransactionVersion = 0 | 1;

export type PaymentDraft = { transaction: string; lastValidBlockHeight: number };

/** @throws {never} */
export function encodePaymentDraft(draft: PaymentDraft) {
  return JSON.stringify(draft);
}

/** @throws {never} */
export function decodePaymentDraft(raw: string): PaymentDraft | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<PaymentDraft>;
    return typeof parsed.transaction === "string" &&
      typeof parsed.lastValidBlockHeight === "number" &&
      Number.isSafeInteger(parsed.lastValidBlockHeight) &&
      parsed.lastValidBlockHeight >= 0
      ? { transaction: parsed.transaction, lastValidBlockHeight: parsed.lastValidBlockHeight }
      : undefined;
  } catch {
    return undefined;
  }
}



const prepareCommitment = "confirmed" as const;
const rpcTimeout = 10_000;
const accountDataPage = 32 * 1024;
const accountMetadataSize = 64;
const maxComputeUnits = 1_400_000;
const maxLoadedAccountData = 64 * 1024 * 1024;
const simulationRequest = z.object({ method: z.literal("simulateTransaction") });
const simulationReply = z.object({ result: z.object({ value: z.object({ err: z.unknown() }) }) });
const resourceEstimate = z.object({
  computeUnitLimit: z.int().positive().max(maxComputeUnits),
  loadedAccountsDataSizeLimit: z.int().nonnegative().max(maxLoadedAccountData),
});
const latestBlockhash = z.object({
  value: z.object({
    blockhash: z.string(),
    lastValidBlockHeight: z.bigint().min(0n).max(BigInt(Number.MAX_SAFE_INTEGER)),
  }),
});
const insufficientUsdc = z.object({
  InstructionError: z.tuple([
    z.union([z.literal(1), z.literal(1n)]),
    z.object({
      Custom: z.union([
        z.literal(TOKEN_ERROR__INSUFFICIENT_FUNDS),
        z.literal(BigInt(TOKEN_ERROR__INSUFFICIENT_FUNDS)),
      ]),
    }),
  ]),
});

function validateSimulation(err: unknown, order: PaymentOrder) {
  if (err === null) return;
  if (order.asset === "USDC" && insufficientUsdc.safeParse(err).success)
    throw new PaymentPreparationRejected(
      `Your wallet needs ${creditDecimal(order.atomic)} USDC on this Solana network for this transfer.`,
    );
  if (err === "InsufficientFundsForFee")
    throw new PaymentPreparationRejected("Your wallet needs more SOL on this network to pay the transaction fee.");
  throw new PaymentPreparationRejected(
    order.asset === "SOL"
      ? "This transfer did not pass simulation. Check your SOL balance and network fee."
      : "This transfer did not pass simulation. Check your wallet’s USDC and SOL balances.",
  );
}

function paymentRpc(url: string, order: PaymentOrder) {
  const transport = createDefaultRpcTransport({ url });
  const checkedTransport: RpcTransport = async <TResponse>(request: Parameters<RpcTransport>[0]) => {
    const response = await transport<TResponse>(request);
    if (simulationRequest.safeParse(request.payload).success) {
      const simulation = simulationReply.safeParse(response);
      if (!simulation.success) throw new RpcUnavailable("Solana RPC could not simulate the payment.");
      validateSimulation(simulation.data.result.value.err, order);
    }
    return response;
  };
  return createSolanaRpcFromTransport(checkedTransport);
}

function getPaymentTransactionVersion(encoded: string) {
  try {
    const { messageBytes } = getTransactionDecoder().decode(Buffer.from(encoded, "base64"));
    return getTransactionVersionDecoder().decode(messageBytes);
  } catch {
    throw new PaymentPreparationRejected("The saved payment draft could not be read. Wait for it to expire.");
  }
}

/** The saved envelope only when it has the wallet's transaction version. */
export function paymentEnvelopeResponse(transaction: string, version: PaymentTransactionVersion) {
  if (getPaymentTransactionVersion(transaction) !== version)
    throw new PaymentPreparationRejected(
      "A transaction for this payment is still active. Use the original wallet or wait for it to expire.",
    );
  return { transaction };
}

async function paymentInstructions(order: PaymentOrder, payer: NoopSigner) {
  const owner = solanaAddress(order.recipient);
  const reference = { address: solanaAddress(order.reference), role: AccountRole.READONLY } as const;
  if (order.asset === "SOL") {
    const transfer = getTransferSolInstruction({
      source: payer,
      destination: owner,
      amount: lamports(BigInt(order.atomic)),
    });
    return [{ ...transfer, accounts: [...transfer.accounts, reference] }];
  }

  const mint = solanaAddress(order.mint);
  const [source, destination] = await Promise.all([
    findAssociatedTokenPda({ owner: payer.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
    findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
  ]);
  const createRecipient = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer,
    owner,
    mint,
    ata: destination,
  });
  const transfer = getTransferCheckedInstruction({
    source,
    destination,
    mint,
    authority: payer,
    amount: BigInt(order.atomic),
    decimals: 6,
  });
  return [createRecipient, { ...transfer, accounts: [...transfer.accounts, reference] }];
}

/** Build and simulate the unsigned v0/v1 deposit transaction the connected wallet signs and sends. */
export async function preparePaymentEnvelope(
  rpcUrl: string,
  wallet: string,
  order: PaymentOrder,
  version: PaymentTransactionVersion = 1,
) {
  const rpc = paymentRpc(rpcUrl, order);
  const payer = createNoopSigner(solanaAddress(wallet));
  const instructions = await paymentInstructions(order, payer);

  function paymentMessage<TMessage extends TransactionMessage>(message: TMessage) {
    return pipe(
      message,
      (tx) => setTransactionMessageFeePayer(payer.address, tx),
      (tx) => appendTransactionMessageInstructions(instructions, tx),
    );
  }

  async function estimateV1Message() {
    const message = paymentMessage(createTransactionMessage({ version: 1 }));
    const provisional = setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhash("11111111111111111111111111111111"), lastValidBlockHeight: 0n },
      message,
    );
    const estimate = resourceEstimate.parse(
      await estimateResourceLimitsFactory({ rpc })(provisional, {
        commitment: prepareCommitment,
        abortSignal: AbortSignal.timeout(rpcTimeout),
      }),
    );
    const recipientAccountHeadroom = order.asset === "SOL" ? 0 : getTokenSize() + accountMetadataSize;
    const loadedAccountPages = Math.ceil(
      (estimate.loadedAccountsDataSizeLimit + recipientAccountHeadroom) / accountDataPage,
    );
    return setTransactionMessageConfig(
      {
        computeUnitLimit: Math.min(maxComputeUnits, Math.ceil(estimate.computeUnitLimit * 1.15)),
        loadedAccountsDataSizeLimit: Math.min(
          maxLoadedAccountData,
          Math.max(1, loadedAccountPages) * accountDataPage,
        ),
      },
      message,
    );
  }

  try {
    const message =
      version === 1 ? await estimateV1Message() : paymentMessage(createTransactionMessage({ version: 0 }));
    const { value } = latestBlockhash.parse(
      await rpc.getLatestBlockhash({ commitment: prepareCommitment }).send({ abortSignal: AbortSignal.timeout(rpcTimeout) }),
    );
    const ready = setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhash(value.blockhash), lastValidBlockHeight: value.lastValidBlockHeight },
      message,
    );
    const transaction = getBase64EncodedWireTransaction(compileTransaction(ready));
    await rpc
      .simulateTransaction(transaction, { encoding: "base64", commitment: prepareCommitment, sigVerify: false })
      .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
    return { transaction, lastValidBlockHeight: Number(value.lastValidBlockHeight) };
  } catch (error) {
    const failure = isSolanaError(error, SOLANA_ERROR__TRANSACTION__FAILED_TO_ESTIMATE_COMPUTE_LIMIT)
      ? error.cause
      : error;
    if (failure instanceof PaymentPreparationRejected || failure instanceof RpcUnavailable) throw failure;
    throw new RpcUnavailable("Solana RPC could not prepare the payment.");
  }
}

/** The cluster's finalized block height, bounded to a safe integer. */
export async function finalizedBlockHeight(rpc: string) {
  const height = await readRpc(createSolanaRpc(rpc).getBlockHeight({ commitment: "finalized" }));
  if (typeof height !== "bigint" || height < 0n || height > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RpcUnavailable("Solana finalized block height is unavailable.");
  return Number(height);
}

const amount = z.string().regex(/^\d+$/);
const signatureSchema = z.string().refine(isSignature);
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
type TokenBalance = z.infer<typeof tokenBalance>;

const instructionBytes = getBase58Encoder();
const systemTransfer = getTransferSolInstructionDataDecoder();
const tokenTransfer = getTransferInstructionDataDecoder();
const tokenTransferChecked = getTransferCheckedInstructionDataDecoder();

function verifyTransfer(result: z.infer<typeof transaction>, wallet: string, order: PaymentOrder) {
  if (result.blockTime === null || result.blockTime <= 0n)
    throw new PaymentRejected("The finalized transfer has no valid block time.");
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
    throw new PaymentRejected("The signature does not match this payment request and wallet.");

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
      if (order.asset === "SOL") {
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
          lamports === BigInt(order.atomic)
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
        if (transfer.decimals !== 6 || transfer.amount !== BigInt(order.atomic)) return false;
      } else {
        if (accounts.length !== 4 || bytes.length !== tokenTransfer.fixedSize) return false;
        if (tokenTransfer.decode(bytes).amount !== BigInt(order.atomic)) return false;
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
  if (matches.length !== 1)
    throw new PaymentRejected(`The ${order.asset} transfer does not match this payment.`);
  if (order.asset === "SOL") return;

  const total = (balances: TokenBalance[]) =>
    balances.reduce((sum, balance) => sum + BigInt(balance.uiTokenAmount.amount), 0n);
  if (
    total(recipientBalances) - total(tokenBalances(pre ?? [], order.recipient)) !== BigInt(order.atomic) ||
    total(tokenBalances(post ?? [], wallet)) - total(sourceBalances) !== -BigInt(order.atomic)
  )
    throw new PaymentRejected("The finalized USDC transfer does not match the requested amount.");
}

export async function verifyPayment(
  rpc: string,
  signature: string,
  wallet: string,
  order: PaymentOrder,
  cluster: string,
  commitment: "confirmed" | "finalized" = "finalized",
  verifyNetwork = true,
) {
  if (!isSignature(signature)) throw new PaymentRejected("This payment signature is invalid.");
  if (verifyNetwork) await verifyCluster(rpc, cluster);
  const result = await readRpc(
    createSolanaRpc(rpc).getTransaction(signature, {
      commitment,
      encoding: "json",
      maxSupportedTransactionVersion: 1,
    }),
  );
  const tx = transaction.safeParse(result);
  if (!tx.success || tx.data.meta.err !== null || tx.data.transaction.signatures[0] !== signature)
    throw new PaymentRejected("No successful payment was found at the required confirmation level.");
  verifyTransfer(tx.data, wallet, order);
}

export type PaymentInspection = "pending" | "failed" | "mismatch" | "verified";

export async function inspectPayment(
  rpc: string,
  signature: string,
  wallet: string,
  order: PaymentOrder,
  cluster: string,
): Promise<PaymentInspection> {
  if (!isSignature(signature)) throw new PaymentRejected("This payment signature is invalid.");
  await verifyCluster(rpc, cluster);
  const result = await readRpc(
    createSolanaRpc(rpc).getTransaction(signature, {
      commitment: "finalized",
      encoding: "json",
      maxSupportedTransactionVersion: 1,
    }),
  );
  if (result === null) return "pending";
  const tx = transaction.safeParse(result);
  if (!tx.success) throw new RpcUnavailable("Solana RPC returned an unreadable transaction.");
  if (tx.data.transaction.signatures[0] !== signature) return "mismatch";
  if (tx.data.meta.err !== null) return "failed";
  try {
    verifyTransfer(tx.data, wallet, order);
    return "verified";
  } catch (error) {
    if (error instanceof PaymentRejected) return "mismatch";
    throw error;
  }
}

export async function findPaymentSignatures(rpc: string, reference: string, commitment: "confirmed" | "finalized" = "finalized") {
  if (!isAddress(reference)) throw new PaymentRejected("This payment reference is invalid.");
  const result = await readRpc(
    createSolanaRpc(rpc).getSignaturesForAddress(reference, { commitment, limit: 20 }),
  );
  const parsed = z.array(z.object({ signature: signatureSchema, err: z.unknown() })).safeParse(result);
  if (!parsed.success) throw new RpcUnavailable("Solana RPC could not check the payment history.");
  return parsed.data.filter((entry) => entry.err === null).map((entry) => entry.signature);
}

/** The finalized signature paying `order`, or null when none was found yet. */
export async function findPayment(
  rpc: string,
  wallet: string,
  order: PaymentOrder,
  cluster: string,
  commitment: "confirmed" | "finalized",
  signature?: string,
): Promise<string | null> {
  if (signature) {
    await verifyPayment(rpc, signature, wallet, order, cluster, commitment);
    return signature;
  }
  await verifyCluster(rpc, cluster);
  for (const candidate of await findPaymentSignatures(rpc, order.reference, commitment)) {
    try {
      const result = await readRpc(
        createSolanaRpc(rpc).getTransaction(candidate, {
          commitment,
          encoding: "json",
          maxSupportedTransactionVersion: 1,
        }),
      );
      const tx = transaction.safeParse(result);
      if (tx.success && tx.data.meta.err === null && tx.data.transaction.signatures[0] === candidate) {
        verifyTransfer(tx.data, wallet, order);
        return candidate;
      }
    } catch (error) {
      if (error instanceof RpcUnavailable) throw error;
    }
  }
  return null;
}

/** The finalized signature paying `order`, or null when none was found yet. */
export async function findFinalizedPayment(
  rpc: string,
  wallet: string,
  order: PaymentOrder,
  cluster: string,
  signature?: string,
): Promise<string | null> {
  return findPayment(rpc, wallet, order, cluster, "finalized", signature);
}

const ticker = z.object({ price: z.string().max(26), time: z.iso.datetime() });

/** A fresh SOL/USD quote for `creditMicros`, or null when no live price is available (`lib/sol-quote.ts`). */
export async function quoteSolPayment(
  creditMicros: number,
): Promise<{ atomic: number; expiresAt: number; priceUsd: string } | null> {
  try {
    const response = await fetch("https://api.exchange.coinbase.com/products/SOL-USD/ticker", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    const parsed = ticker.safeParse(response.ok ? await response.json() : null);
    const now = Date.now();
    const time = parsed.success ? Date.parse(parsed.data.time) : NaN;
    if (!parsed.success || !Number.isFinite(time) || time < now - 60_000 || time > now + 5_000) return null;
    const atomic = solAtomic(creditMicros, parsed.data.price);
    if (atomic === null) return null;
    return { atomic, expiresAt: now + 5 * 60_000, priceUsd: parsed.data.price };
  } catch {
    return null;
  }
}
