// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
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
