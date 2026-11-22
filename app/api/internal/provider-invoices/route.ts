import { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { operationsBearer, validOperationsToken } from "@/lib/operations-auth";
import { invoiceLineLimit, invoiceProviders, invoiceReference } from "@/lib/provider-invoice";
import { backend, errorResponse, json, readBody, SonnelyError } from "@/lib/server";

const statement = z.strictObject({
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

export async function POST(request: NextRequest) {
  try {
    const token = operationsBearer(request.headers.get("authorization"));
    if (!validOperationsToken(token, process.env.SONNELY_INVOICE_IMPORT_TOKEN))
      throw new SonnelyError("Unauthorized.", 401);
    const { provider, invoiceId, lines } = statement.parse(await readBody(request, 24_576));
    const result = await backend().db.mutation(api.providerInvoices.ingest, {
      token,
      provider,
      invoiceId,
      lines,
    });
    return json({ provider, invoiceId, lines: result });
  } catch (error) {
    return errorResponse(error);
  }
}
