import { z } from "zod";
import { fundingAtomic } from "./intent-funding";
import { SonnelyError } from "./sonnely-error";

export type SolPayment = { lamports: number; expiresAt: number; priceUsd: string };

export function solDecimal(lamports: number) {
  const value = BigInt(lamports);
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? whole + "." + fraction : whole.toString();
}

const ticker = z.object({ price: z.string().max(26), time: z.iso.datetime() });

export async function quoteSolPayment(creditMicros: number): Promise<SolPayment> {
  const response = await fetch("https://api.exchange.coinbase.com/products/SOL-USD/ticker", {
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
    redirect: "error",
  }).catch(() => null);
  const parsed = ticker.safeParse(response?.ok ? await response.json().catch(() => null) : null);
  const now = Date.now();
  const time = parsed.success ? Date.parse(parsed.data.time) : NaN;
  const price = parsed.success ? fundingAtomic(parsed.data.price, 9) : null;
  if (!parsed.success || !price || !Number.isFinite(time) || time < now - 60_000 || time > now + 5_000)
    throw new SonnelyError("A fresh SOL/USD price is unavailable. Try again or pay with USDC.", 503);
  const denominator = BigInt(price);
  const lamports = Number((BigInt(creditMicros) * 1_000_000_000_000n + denominator - 1n) / denominator);
  if (!Number.isSafeInteger(lamports) || lamports < 1)
    throw new SonnelyError("This amount cannot be quoted in SOL.");
  return { lamports, expiresAt: now + 5 * 60_000, priceUsd: parsed.data.price };
}
