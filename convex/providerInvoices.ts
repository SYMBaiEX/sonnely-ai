import { ConvexError, v } from "convex/values";
import { invoiceBillingReference, invoiceLineLimit, invoiceReference } from "../lib/provider-invoice";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { auth, requireAdmin } from "./access";
import { amendGatewayCost } from "./usageMaxOutbox";

import { invoiceProvider, invoiceLineView, invoiceLine, invoiceInput } from "./providerInvoiceContract";

type Provider = typeof invoiceProvider.type;
type InvoiceInput = { provider: Provider; invoiceId: string; lines: Array<typeof invoiceLine.type> };

function validated(args: InvoiceInput) {
  if (!invoiceReference(args.invoiceId) || args.lines.length < 1 || args.lines.length > invoiceLineLimit)
    throw new ConvexError("Enter an invoice ID and 1 to 100 USD invoice lines.");
  const refs = new Set<string>();
  return args.lines
    .map(({ reference: value, costNanos }) => {
      const reference = invoiceBillingReference(args.provider, value);
      if (!reference || refs.has(reference) || !Number.isSafeInteger(costNanos) || costNanos < 0)
        throw new ConvexError("Use distinct provider billing references and valid USD amounts.");
      refs.add(reference);
      return { reference, costNanos };
    })
    .sort((a, b) => a.reference.localeCompare(b.reference));
}

async function invoiceById(ctx: QueryCtx, provider: Provider, invoiceId: string) {
  return ctx.db
    .query("providerInvoices")
    .withIndex("by_provider_and_invoiceId", (q) => q.eq("provider", provider).eq("invoiceId", invoiceId))
    .unique();
}

async function matchLines(ctx: QueryCtx, provider: Provider, lines: Array<typeof invoiceLine.type>) {
  return Promise.all(
    lines.map(async (item) => {
      const [candidate, claim] = await Promise.all([
        ctx.db
          .query("usage")
          .withIndex("by_provider_request", (q) => q.eq("providerRequest", item.reference))
          .take(2),
        ctx.db
          .query("providerInvoiceClaims")
          .withIndex("by_reference", (q) => q.eq("reference", item.reference))
          .unique(),
      ]);
      const row = candidate.length === 1 ? candidate[0] : undefined;
      const matches =
        row &&
        (row.provider ?? "near-ai") === provider &&
        (row.status === "complete" || row.status === "failed");
      const previousCostNanos = matches
        ? (row.providerCostNano ?? row.providerReportedCostNano ?? null)
        : null;
      const state: typeof invoiceLineView.type.state = claim
        ? "previously_invoiced"
        : !matches
          ? "unmatched"
          : previousCostNanos === null
            ? "new"
            : item.costNanos === previousCostNanos
              ? "exact"
              : "variance";
      return {
        usageId: matches && !claim ? row._id : undefined,
        view: { ...item, state, previousCostNanos },
      };
    }),
  );
}

export const preview = query({
  args: { ...auth, ...invoiceInput },
  returns: v.array(invoiceLineView),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const lines = validated(args);
    return (await matchLines(ctx, args.provider, lines)).map(({ view }) => view);
  },
});

export const record = mutation({
  args: { ...auth, ...invoiceInput },
  returns: v.array(invoiceLineView),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args);
    const lines = validated(args);
    const existing = await invoiceById(ctx, args.provider, args.invoiceId);
    const unmatched = new Set(
      existing?.lines.filter(({ state }) => state === "unmatched").map(({ reference }) => reference),
    );
    if (existing) {
      const original = existing.lines.map(({ reference, costNanos }) => ({ reference, costNanos }));
      if (JSON.stringify(original) !== JSON.stringify(lines))
        throw new ConvexError("This invoice ID already has different line items.");
      if (!unmatched.size) return existing.lines;
    }
    const matches = await matchLines(
      ctx,
      args.provider,
      existing ? lines.filter(({ reference }) => unmatched.has(reference)) : lines,
    );
    const invoice =
      existing?._id ??
      (await ctx.db.insert("providerInvoices", {
        provider: args.provider,
        invoiceId: args.invoiceId,
        recordedBy: admin._id,
        lines: [],
      }));
    const recorded: Array<typeof invoiceLineView.type> = existing
      ? existing.lines.filter(({ reference }) => !unmatched.has(reference))
      : [];
    for (const item of matches) {
      if (!item.usageId) {
        recorded.push(item.view);
        continue;
      }
      const exported = await amendGatewayCost(ctx, item.usageId, item.view.costNanos, "invoice_confirmed");
      await ctx.db.insert("providerInvoiceClaims", {
        reference: item.view.reference,
        invoice,
        usage: item.usageId,
      });
      recorded.push({ ...item.view, exported });
    }
    recorded.sort((a, b) => a.reference.localeCompare(b.reference));
    await ctx.db.patch(invoice, { lines: recorded });
    return recorded;
  },
});

export const history = query({
  args: auth,
  returns: v.array(
    v.object({
      provider: invoiceProvider,
      invoiceId: v.string(),
      createdAt: v.number(),
      lines: v.array(invoiceLineView),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args);
    const rows = await ctx.db.query("providerInvoices").order("desc").take(15);
    return rows.map(({ provider, invoiceId, _creationTime, lines }) => ({
      provider,
      invoiceId,
      createdAt: _creationTime,
      lines,
    }));
  },
});
