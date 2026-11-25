// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
export const markupPercent = 10;

// Rates are listed in dollars per million tokens and stored as nano-USD per token.
type Rates = { input: number; cache: number; output: number };

export function markedUpRates(rates: Rates) {
  const apply = (rate: number) => (Math.round(rate * 1000) * (100 + markupPercent)) / 100_000;
  return { input: apply(rates.input), cache: apply(rates.cache), output: apply(rates.output) };
}

export function requestCharge(rates: Rates, input: number, cached: number, output: number) {
  const priced = (tokens: number, rate: number) => tokens * Math.round(rate * 1000);
  const nano =
    priced(input - cached, rates.input) + priced(cached, rates.cache) + priced(output, rates.output);
  return Math.ceil((nano * (100 + markupPercent)) / 100_000);
}

export const formatRate = (rate: number) =>
  "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(rate);
