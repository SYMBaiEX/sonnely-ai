import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createDefaultRpcTransport,
  createNoopSigner,
  createSolanaRpcFromTransport,
  createTransactionMessage,
  estimateResourceLimitsFactory,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  getTransactionVersionDecoder,
  isSolanaError,
  lamports,
  type NoopSigner,
  pipe,
  type RpcTransport,
  type TransactionMessage,
  SOLANA_ERROR__TRANSACTION__FAILED_TO_ESTIMATE_COMPUTE_LIMIT,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  TOKEN_ERROR__INSUFFICIENT_FUNDS,
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTokenSize,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import type { SolPayment } from "./sol-quote";
import { z } from "zod";
import { creditDecimal } from "./credit-amount";
import { SonnelyError } from "./sonnely-error";

export const paymentTransactionVersion = z.union([z.literal(0), z.literal(1)]);
export type PaymentTransactionVersion = z.infer<typeof paymentTransactionVersion>;

type PaymentOrder = { amount: number; mint: string; reference: string; recipient: string; sol?: SolPayment };

const commitment = "confirmed" as const;
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
  // The transfer is the second instruction, after idempotent recipient account creation.
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
  if (!order.sol && insufficientUsdc.safeParse(err).success)
    throw new SonnelyError(
      `Your wallet needs ${creditDecimal(order.amount, 2)} USDC on this Solana network for this transfer.`,
    );
  if (err === "InsufficientFundsForFee")
    throw new SonnelyError("Your wallet needs more SOL on this network to pay the transaction fee.");
  throw new SonnelyError(
    order.sol
      ? "This transfer did not pass simulation. Check your SOL balance and network fee."
      : "This transfer did not pass simulation. Check your wallet’s USDC and SOL balances.",
  );
}

function paymentRpc(url: string, order: PaymentOrder) {
  const transport = createDefaultRpcTransport({ url });
  const checkedTransport: RpcTransport = async <TResponse>(request: Parameters<RpcTransport>[0]) => {
    const response = await transport<TResponse>(request);
    if (simulationRequest.safeParse(request.payload).success) {
      // Match payment failures before the estimator checks the resource counters.
      const simulation = simulationReply.safeParse(response);
      if (!simulation.success) throw new SonnelyError("Solana RPC could not simulate the payment.", 503);
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
    throw new SonnelyError("The saved payment draft could not be read. Wait for it to expire.", 409);
  }
}

export function paymentEnvelopeResponse(transaction: string, version: PaymentTransactionVersion) {
  if (getPaymentTransactionVersion(transaction) !== version)
    throw new SonnelyError(
      "A transaction for this payment is still active. Use the original wallet or wait for it to expire.",
      409,
    );
  return { transaction };
}

async function paymentInstructions(order: PaymentOrder, payer: NoopSigner) {
  const owner = address(order.recipient);
  const reference = { address: address(order.reference), role: AccountRole.READONLY } as const;
  if (order.sol) {
    const transfer = getTransferSolInstruction({
      source: payer,
      destination: owner,
      amount: lamports(BigInt(order.sol.lamports)),
    });
    return [{ ...transfer, accounts: [...transfer.accounts, reference] }];
  }

  const mint = address(order.mint);
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
    amount: BigInt(order.amount),
    decimals: 6,
  });
  return [createRecipient, { ...transfer, accounts: [...transfer.accounts, reference] }];
}

export async function preparePaymentEnvelope(
  rpcUrl: string,
  wallet: string,
  order: PaymentOrder,
  version: PaymentTransactionVersion = 1,
) {
  const rpc = paymentRpc(rpcUrl, order);
  const payer = createNoopSigner(address(wallet));
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
        commitment,
        abortSignal: AbortSignal.timeout(rpcTimeout),
      }),
    );
    // The idempotent recipient token account can be created between simulation and signing.
    const recipientAccountHeadroom = order.sol ? 0 : getTokenSize() + accountMetadataSize;
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
      await rpc.getLatestBlockhash({ commitment }).send({ abortSignal: AbortSignal.timeout(rpcTimeout) }),
    );
    const ready = setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhash(value.blockhash), lastValidBlockHeight: value.lastValidBlockHeight },
      message,
    );
    const transaction = getBase64EncodedWireTransaction(compileTransaction(ready));
    await rpc
      .simulateTransaction(transaction, { encoding: "base64", commitment, sigVerify: false })
      .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
    return { transaction, lastValidBlockHeight: Number(value.lastValidBlockHeight) };
  } catch (error) {
    const failure = isSolanaError(error, SOLANA_ERROR__TRANSACTION__FAILED_TO_ESTIMATE_COMPUTE_LIMIT)
      ? error.cause
      : error;
    if (failure instanceof SonnelyError) throw failure;
    throw new SonnelyError("Solana RPC could not prepare the payment.", 503);
  }
}
