import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  lamports,
  pipe,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  TOKEN_ERROR__INSUFFICIENT_FUNDS,
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import type { SolPayment } from "./sol-quote";
import { z } from "zod";
import { creditDecimal } from "./credit-amount";
import { rpcCall } from "./payments";
import { SonnelyError } from "./server";

const latestBlockhash = z.object({
  value: z.object({
    blockhash: z.string(),
    lastValidBlockHeight: z.number().int().nonnegative(),
  }),
});
const simulation = z.object({ value: z.object({ err: z.unknown() }) });
const insufficientUsdc = z.object({
  // The transfer is the second instruction, after idempotent recipient account creation.
  InstructionError: z.tuple([z.literal(1), z.object({ Custom: z.literal(TOKEN_ERROR__INSUFFICIENT_FUNDS) })]),
});

export async function preparePaymentEnvelope(
  rpc: string,
  wallet: string,
  order: { amount: number; mint: string; reference: string; recipient: string; sol?: SolPayment },
  version: "legacy" | 0 | 1,
) {
  const payer = createNoopSigner(address(wallet));
  const owner = address(order.recipient);
  const latest = await rpcCall(rpc, "getLatestBlockhash", [{ commitment: "confirmed" }]);
  const parsedBlockhash = latestBlockhash.safeParse(latest);
  if (!parsedBlockhash.success) throw new SonnelyError("Solana RPC could not prepare the payment.", 503);

  const reference = { address: address(order.reference), role: AccountRole.READONLY } as const;
  const instructions = order.sol
    ? (() => {
        const transfer = getTransferSolInstruction({
          source: payer,
          destination: owner,
          amount: lamports(BigInt(order.sol.lamports)),
        });
        return [{ ...transfer, accounts: [...transfer.accounts, reference] }];
      })()
    : await (async () => {
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
      })();
  const { value } = parsedBlockhash.data;
  const initialMessage =
    version === 1
      ? setTransactionMessageConfig(
          { computeUnitLimit: 200_000, loadedAccountsDataSizeLimit: 4 * 1024 * 1024 },
          createTransactionMessage({ version: 1 }),
        )
      : createTransactionMessage({ version });
  const message = pipe(
    initialMessage,
    (tx) => setTransactionMessageFeePayer(payer.address, tx),
    (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: blockhash(value.blockhash), lastValidBlockHeight: BigInt(value.lastValidBlockHeight) },
        tx,
      ),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );
  const transaction = getBase64EncodedWireTransaction(compileTransaction(message));
  const result = simulation.safeParse(
    await rpcCall(rpc, "simulateTransaction", [
      transaction,
      { encoding: "base64", commitment: "confirmed", sigVerify: false },
    ]),
  );
  if (!result.success) throw new SonnelyError("Solana RPC could not simulate the payment.", 503);
  const { err } = result.data.value;
  if (!order.sol && insufficientUsdc.safeParse(err).success)
    throw new SonnelyError(
      `Your wallet needs ${creditDecimal(order.amount, 2)} USDC on this Solana network for this transfer.`,
    );
  if (err === "InsufficientFundsForFee")
    throw new SonnelyError("Your wallet needs more SOL on this network to pay the transaction fee.");
  if (err !== null)
    throw new SonnelyError(
      order.sol
        ? "This transfer did not pass simulation. Check your SOL balance and network fee."
        : "This transfer did not pass simulation. Check your wallet’s USDC and SOL balances.",
    );
  return { transaction, lastValidBlockHeight: value.lastValidBlockHeight };
}

export async function preparePayment(...args: Parameters<typeof preparePaymentEnvelope>) {
  return (await preparePaymentEnvelope(...args)).transaction;
}
