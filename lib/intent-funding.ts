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

export function fundingAtomic(value: string, decimals: number) {
  if (!/^\d{1,12}(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;
  const atomic = BigInt(whole + fraction.padEnd(decimals, "0"));
  return atomic > 0n ? atomic.toString() : null;
}
