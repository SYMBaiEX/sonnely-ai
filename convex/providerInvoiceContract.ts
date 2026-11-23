import { v } from "convex/values";

export const invoiceProvider = v.union(v.literal("near-ai"), v.literal("phala"), v.literal("tinfoil"));
export const invoiceLine = v.object({ reference: v.string(), costNanos: v.number() });
export const invoiceLineView = v.object({
  ...invoiceLine.fields,
  state: v.union(
    v.literal("exact"),
    v.literal("variance"),
    v.literal("new"),
    v.literal("unmatched"),
    v.literal("previously_invoiced"),
  ),
  previousCostNanos: v.union(v.null(), v.number()),
  exported: v.optional(v.boolean()),
});
export const invoiceInput = { provider: invoiceProvider, invoiceId: v.string(), lines: v.array(invoiceLine) };
