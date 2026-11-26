import { getAddress } from "ethers";
import { z } from "zod";
import { address } from "./solana.ts";

export class IntentQuoteRejected extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const intentFunds = {
  sol: { symbol: "SOL", network: "Solana", decimals: 9, id: "nep141:sol.omft.near" },
  eth: { symbol: "ETH", network: "Ethereum", decimals: 18, id: "nep141:eth.omft.near" },
  base: { symbol: "ETH", network: "Base", decimals: 18, id: "nep141:base.omft.near" },
  arb: { symbol: "ETH", network: "Arbitrum", decimals: 18, id: "nep141:arb.omft.near" },
  "base-usdc": {
    symbol: "USDC",
    network: "Base",
    decimals: 6,
    id: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  },
} as const;
export type IntentFund = keyof typeof intentFunds;

export type FundingQuote = {
  amountOut: string;
  minAmountOut: string;
  depositAddress?: string;
  depositMemo?: string;
  deadline: string;
  recipient: string;
  refundTo: string;
};

const destinationAsset = "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";
const atomicAmount = z.string().regex(/^\d+$/);

function fundingAtomic(value: string, decimals: number) {
  if (!/^\d{1,12}(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;
  const atomic = BigInt(whole + fraction.padEnd(decimals, "0"));
  return atomic > 0n ? atomic.toString() : null;
}

/** A validated NEAR Intents quote, prepared server-side so the browser never holds the API credential. */
export async function quoteIntentFunding(
  wallet: string,
  input: { asset: IntentFund; amount: string; refundTo?: string; prepare?: boolean },
  token: string,
  cluster: string,
): Promise<FundingQuote> {
  const { asset, amount: quantity, prepare = false } = input;
  if (prepare && (!token || cluster !== "mainnet")) throw new IntentQuoteRejected("Cross-chain funding is unavailable.", 503);
  const fund = intentFunds[asset];
  if (!fund) throw new IntentQuoteRejected("Choose a supported funding asset.", 400);
  const amountIn = fundingAtomic(quantity, fund.decimals);
  if (amountIn === null) throw new IntentQuoteRejected("Enter a positive amount within the token's precision.", 400);

  let refundTo = wallet;
  if (asset !== "sol") {
    try {
      refundTo = getAddress(input.refundTo ?? "");
      if (refundTo === "0x0000000000000000000000000000000000000000") throw new Error();
    } catch {
      throw new IntentQuoteRejected("Enter a valid refund wallet for the selected network.", 400);
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
        amountIn: atomicAmount,
        amountOut: atomicAmount,
        minAmountOut: atomicAmount,
        depositAddress: z.string().min(1).max(128).optional(),
        depositMemo: z.string().min(1).max(100).optional(),
        deadline: z.iso.datetime().optional(),
      }),
    })
    .safeParse(result?.ok ? await result.json().catch(() => null) : null);
  if (!parsed.success) throw new IntentQuoteRejected("No quote was available. Check the amount and try again.", 502);

  const { quote: expected, quoteRequest: echoed } = parsed.data;
  const acceptUntil =
    expected.deadline && Date.parse(expected.deadline) < Date.parse(deadline) ? expected.deadline : deadline;
  const deliverable = BigInt(expected.minAmountOut) > 0n && BigInt(expected.amountOut) >= BigInt(expected.minAmountOut);
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
    throw new IntentQuoteRejected("NEAR Intents returned inconsistent swap details. Request a new quote.", 502);
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
