// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
export const invoiceProviders = ["near-ai", "phala", "tinfoil"] as const;
export const invoiceLineLimit = 100;

export function invoiceReference(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value);
}

export function invoiceBillingReference(provider: (typeof invoiceProviders)[number], input: string) {
  if (!invoiceReference(input)) return null;
  if (provider === "near-ai")
    return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input) ? input.toLowerCase() : null;
  const prefix = provider + ":";
  if (input.includes(":") && !input.startsWith(prefix)) return null;
  return input.startsWith(prefix) ? input : prefix + input;
}

export function invoiceAmountNanos(input: string) {
  if (!/^\d{1,7}(?:\.\d{1,9})?$/.test(input)) return null;
  const [units, decimal = ""] = input.split(".");
  const amount = Number(units + decimal.padEnd(9, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
