import { z } from "zod";
import bs58 from "bs58";
import { managedProviderKey } from "./managed-access";
import { SonnelyError } from "./server";

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
    paymentVerificationEnabled && (cluster === "devnet" || Boolean(managedProviderKey()));
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

export async function quote(wallet: string, sol: number) {
  const token = process.env.NEAR_INTENTS_API_KEY;
  const result = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: "nep141:sol.omft.near",
      depositType: "ORIGIN_CHAIN",
      destinationAsset: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
      amount: String(Math.round(sol * 1_000_000_000)),
      recipient: wallet,
      recipientType: "DESTINATION_CHAIN",
      refundTo: wallet,
      refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 180_000).toISOString(),
    }),
  }).catch(() => null);
  const parsed = z
    .object({
      quote: z.object({ amountOut: amount, minAmountOut: amount, timeEstimate: z.number().optional() }),
    })
    .safeParse(result?.ok ? await result.json().catch(() => null) : null);
  if (!parsed.success)
    throw new SonnelyError(
      "No quote was available for this amount. Try a larger amount or retry shortly.",
      502,
    );
  return parsed.data.quote;
}
