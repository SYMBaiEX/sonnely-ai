import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { z } from "zod";
import { rpcCall } from "./payments";
import { SonnelyError } from "./server";

const latestBlockhash = z.object({
  value: z.object({
    blockhash: z.string(),
    lastValidBlockHeight: z.number().int().nonnegative(),
  }),
});
const simulation = z.object({ value: z.object({ err: z.unknown() }) });

export async function preparePaymentEnvelope(
  rpc: string,
  wallet: string,
  order: { amount: number; mint: string; reference: string; recipient: string },
  version: "legacy" | 0,
) {
  const payer = createNoopSigner(address(wallet));
  const mint = address(order.mint);
  const owner = address(order.recipient);
  const [source, destination, latest] = await Promise.all([
    findAssociatedTokenPda({ owner: payer.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
    findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
    rpcCall(rpc, "getLatestBlockhash", [{ commitment: "confirmed" }]),
  ]);
  const parsedBlockhash = latestBlockhash.safeParse(latest);
  if (!parsedBlockhash.success) throw new SonnelyError("Solana RPC could not prepare the payment.", 503);

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
  const withReference = {
    ...transfer,
    accounts: [...transfer.accounts, { address: address(order.reference), role: AccountRole.READONLY }],
  };
  const { value } = parsedBlockhash.data;
  const message = pipe(
    createTransactionMessage({ version }),
    (tx) => setTransactionMessageFeePayer(payer.address, tx),
    (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: blockhash(value.blockhash), lastValidBlockHeight: BigInt(value.lastValidBlockHeight) },
        tx,
      ),
    (tx) => appendTransactionMessageInstructions([createRecipient, withReference], tx),
  );
  const transaction = getBase64EncodedWireTransaction(compileTransaction(message));
  const result = simulation.safeParse(
    await rpcCall(rpc, "simulateTransaction", [
      transaction,
      { encoding: "base64", commitment: "confirmed", sigVerify: false },
    ]),
  );
  if (!result.success) throw new SonnelyError("Solana RPC could not simulate the payment.", 503);
  if (result.data.value.err !== null)
    throw new SonnelyError(
      "This transfer did not pass simulation. Check your wallet’s USDC and SOL balances.",
    );
  return { transaction, lastValidBlockHeight: value.lastValidBlockHeight };
}

export async function preparePayment(...args: Parameters<typeof preparePaymentEnvelope>) {
  return (await preparePaymentEnvelope(...args)).transaction;
}
