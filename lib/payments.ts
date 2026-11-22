import { z } from "zod";
import bs58 from "bs58";
import { getAddress } from "ethers";
import { fundingAtomic, intentFunds, type FundingQuote, type IntentFund } from "./intent-funding";
import { configuredProviders } from "./managed-access";
import { SonnelyError } from "./sonnely-error";

export const address = z
  .string()
  .min(32)
  .max(44)
  .refine((value) => {
    try {
      return bs58.decode(value).length === 32;
    } catch {
      return false;
    }
  });
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
  accountIndex: z.number().int(),
  owner: z.string().optional(),
  mint: z.string(),
  uiTokenAmount: z.object({ amount, decimals: z.number() }),
});
const transaction = z.object({
  meta: z.object({
    err: z.unknown(),
    preTokenBalances: z.array(tokenBalance),
    postTokenBalances: z.array(tokenBalance),
  }),
  transaction: z.object({
    message: z.object({
      accountKeys: z.array(z.object({ pubkey: z.string(), signer: z.boolean(), writable: z.boolean() })),
    }),
  }),
});

export async function rpcCall(rpc: string, method: string, params: unknown[]) {
  let response: Response;
  try {
    response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SonnelyError("Solana RPC is unavailable.", 503);
  }
  if (!response.ok) throw new SonnelyError("Solana RPC is unavailable.", 503);
  const payload = await response.json().catch(() => null);
  if (!payload || payload.error) throw new SonnelyError("Solana RPC could not verify the transaction.", 503);
  return payload.result as unknown;
}

export async function verifyCluster(rpc: string, cluster: string) {
  const expected =
    cluster === "mainnet"
      ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
      : "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  const result = await rpcCall(rpc, "getGenesisHash", []);
  if (result !== expected)
    throw new SonnelyError("The configured Solana RPC is on a different network.", 503);
}

export async function findPaymentSignatures(
  rpc: string,
  reference: string,
  commitment: "confirmed" | "finalized",
) {
  const result = await rpcCall(rpc, "getSignaturesForAddress", [reference, { commitment, limit: 20 }]);
  const parsed = z.array(z.object({ signature: z.string(), err: z.unknown() })).safeParse(result);
  if (!parsed.success) throw new SonnelyError("Solana RPC could not check the payment history.", 503);
  return parsed.data.filter((entry) => entry.err === null).map((entry) => entry.signature);
}

export async function verifyPayment(
  rpc: string,
  signature: string,
  wallet: string,
  order: { reference: string; recipient: string; mint: string; amount: number; cluster: string },
  commitment: "confirmed" | "finalized" = "finalized",
  verifyNetwork = true,
) {
  if (verifyNetwork) await verifyCluster(rpc, order.cluster);
  const result = await rpcCall(rpc, "getTransaction", [
    signature,
    { commitment, encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
  const tx = transaction.safeParse(result);
  if (!tx.success || tx.data.meta.err !== null)
    throw new SonnelyError("No successful payment was found at the required confirmation level.");
  const {
    meta,
    transaction: { message },
  } = tx.data;
  const reference = message.accountKeys.find((key) => key.pubkey === order.reference);
  const signer = message.accountKeys.some((key) => key.pubkey === wallet && key.signer);
  if (!reference || reference.signer || reference.writable || !signer)
    throw new SonnelyError("The signature does not match this payment request and wallet.");

  const changeFor = (owner: string) => {
    const sum = (balances: z.infer<typeof tokenBalance>[]) =>
      balances
        .filter(
          (balance) =>
            balance.owner === owner && balance.mint === order.mint && balance.uiTokenAmount.decimals === 6,
        )
        .reduce((total, balance) => total + BigInt(balance.uiTokenAmount.amount), 0n);
    return sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
  };
  if (changeFor(order.recipient) !== BigInt(order.amount) || changeFor(wallet) !== -BigInt(order.amount)) {
    throw new SonnelyError("The finalized USDC transfer does not match the requested amount.");
  }
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
