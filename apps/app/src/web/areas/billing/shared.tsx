/* eslint-disable better-tailwindcss/no-unknown-classes -- these controls intentionally use the migrated billing class names */
// spec/app/billing/deposits.md, "Story: Open a payment intent"
import { CopyButton as UiCopyButton } from "@repo/ui";
import { z } from "zod";
import type { Intent } from "../../../../gen/app__billing__deposits.ts";

const scale = 1_000_000;
const scaleBig = BigInt(scale);

export function parseCreditAmount(value: string | number): number | null {
  if (typeof value === "number") {
    const micros = Math.round(value * scale);
    return Number.isSafeInteger(micros) && micros > 0 && micros / scale === value ? micros : null;
  }
  const decimal = /^(\d{1,10})(?:\.(\d{1,6}))?$/.exec(value.trim().replace(/^\./, "0."));
  if (!decimal) return null;
  const total = BigInt(decimal[1]) * scaleBig + BigInt((decimal[2] ?? "").padEnd(6, "0"));
  return total > 0n && total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

export function creditDecimal(micros: number, minimumDecimals = 0) {
  const units = BigInt(micros);
  const whole = units / scaleBig;
  const fraction = (units % scaleBig)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(minimumDecimals, "0");
  return whole + (fraction ? "." + fraction : "");
}

export const creditBalance = (micros: number) => "$" + creditDecimal(micros, 2);

export function solDecimal(lamports: number) {
  const value = BigInt(lamports);
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? whole + "." + fraction : whole.toString();
}

export function isPast(time: number) {
  return time <= Date.now();
}

export const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(time);

export const shorten = (value: string) => (value.length > 12 ? value.slice(0, 4) + "…" + value.slice(-4) : value);

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

export interface PaymentMeta {
  uri: string;
  qr: string | null;
  cluster: string;
  archivedAt?: number;
}

const paymentMetaSchema = z.record(
  z.string(),
  z.object({ uri: z.string(), qr: z.string().nullable(), cluster: z.string(), archivedAt: z.number().optional() }),
);

export function readPaymentMeta() {
  try {
    return paymentMetaSchema.parse(JSON.parse(localStorage.getItem("sonnely.billing.paymentMeta") ?? "{}"));
  } catch {
    return {};
  }
}

export function writePaymentMeta(value: Record<string, PaymentMeta>) {
  localStorage.setItem("sonnely.billing.paymentMeta", JSON.stringify(value));
}

export function paymentUri(intent: Intent, recipient: string, mint: string) {
  const payment = new URLSearchParams({
    amount: intent.asset === "SOL" ? solDecimal(intent.atomic) : creditDecimal(intent.atomic),
    ...(intent.asset === "SOL" ? {} : { "spl-token": mint }),
    reference: intent.reference,
    label: "Sonnely",
    message: "Compute credit top-up",
  });
  return "solana:" + recipient + "?" + payment.toString();
}

export function inferredSolPrice(intent: Intent) {
  if (intent.asset !== "SOL" || intent.atomic <= 0) return "0";
  const price = (intent.amount / 1_000_000 / intent.atomic) * 1_000_000_000;
  return price.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2, useGrouping: false });
}

export function focusHeading(node: HTMLHeadingElement | null) {
  node?.focus();
}

export function Failure({ message }: { message: string | undefined }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

export function CopyButton({ value, label = "Copy", text = label }: { value: string; label?: string; text?: string }) {
  return <UiCopyButton value={value} label={label} text={text} className="button quiet small" />;
}
