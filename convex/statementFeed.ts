import { z } from "zod";
import { invoiceLineLimit, invoiceProviders, invoiceReference } from "../lib/provider-invoice";

const invoice = z.strictObject({
  provider: z.enum(invoiceProviders),
  invoiceId: z.string().refine(invoiceReference),
  currency: z.literal("USD"),
  lines: z
    .array(
      z.strictObject({ reference: z.string().refine(invoiceReference), costNanos: z.int().nonnegative() }),
    )
    .min(1)
    .max(invoiceLineLimit),
});

export async function loadStatements(endpoint: string, token: string) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("Use an HTTPS statement feed.");
  const response = await fetch(url.href, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok || !response.body) throw new Error("Statement feed unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let content = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 128_000) throw new Error("Statement feed is too large.");
      content += decoder.decode(value, { stream: true });
    }
    return z
      .array(invoice)
      .max(6)
      .parse(JSON.parse(content + decoder.decode()));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
