import { NextRequest } from "next/server";
import { z } from "zod";
import { operationsBearer, validOperationsToken } from "@/lib/operations-auth";
import { providerHealth } from "@/lib/provider-health";
import { getProviderCosts } from "@/lib/provider-billing";
import { errorResponse, json, readBody, SonnelyError } from "@/lib/server";
import { readGatewayOperations } from "@/lib/usagemax-operations";
import { sendOperationsEmail } from "@/lib/operations-email";

export const maxDuration = 30;
const requestShape = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("near_costs"), requestIds: z.array(z.uuid()).min(1).max(100) }),
  z.strictObject({ kind: z.literal("gateway_alerts") }),
  z.strictObject({ kind: z.literal("provider_health") }),
  z.strictObject({
    kind: z.literal("alert_email"),
    id: z.string().regex(/^[a-z0-9]{20,64}$/),
    subject: z.string().max(180),
    text: z.string().max(1200),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    if (
      !validOperationsToken(
        operationsBearer(request.headers.get("authorization")),
        process.env.SONNELY_OPERATIONS_TOKEN,
      )
    )
      throw new SonnelyError("Unauthorized.", 401);
    const payload = requestShape.parse(await readBody(request, 8192));
    if (payload.kind === "provider_health") return json(await providerHealth());
    if (payload.kind === "near_costs") return json(await getProviderCosts(payload.requestIds));
    if (payload.kind === "alert_email")
      return json(await sendOperationsEmail(payload.id, payload.subject, payload.text));
    const today = new Date().toISOString().slice(0, 10);
    const report = await readGatewayOperations(today, today);
    return json({
      ...report.alerts,
      items: report.alerts.items.filter(({ provider }) => ["near-ai", "phala", "tinfoil"].includes(provider)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
