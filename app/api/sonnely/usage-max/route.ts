import type { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import {
  backend,
  ensureSameOrigin,
  errorResponse,
  json,
  readBody,
  sessionHash,
  SonnelyError,
} from "@/lib/server";
import { usageSince } from "@/lib/usage";
import { sendToUsageMax, usageMaxBatch } from "@/lib/usagemax";

const credentials = z.object({
  token: z
    .string()
    .trim()
    .min(16)
    .max(256)
    .regex(/^[A-Za-z0-9._-]+$/),
  device: z.uuid(),
  days: z.number(),
});

async function getBatch(session: string, days: string) {
  const { db, secret } = backend();
  const rows = await db.query(api.usageExport.settled, { session, secret, since: usageSince(days) });
  return usageMaxBatch(rows);
}

export async function GET(request: NextRequest) {
  try {
    const batch = await getBatch(sessionHash(request), request.nextUrl.searchParams.get("days") ?? "30");
    if (!batch.events.length)
      throw new SonnelyError("There is no settled inference usage in this period.", 404);
    return new Response(JSON.stringify(batch, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="sonnely-usagemax.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const session = sessionHash(request);
    const { token, device, days } = credentials.parse(await readBody(request, 2048));
    const batch = await getBatch(session, String(days));
    if (!batch.events.length) return json({ sent: 0 });
    const response = await sendToUsageMax(batch, token, device).catch(() => null);
    if (response) await response.body?.cancel();
    if (response?.status === 401 || response?.status === 403)
      throw new SonnelyError(
        "UsageMax declined the collector key. Use a key with telemetry write access.",
        422,
      );
    if (response?.status === 409)
      throw new SonnelyError("UsageMax found a conflict. Check the collector’s installation ID.", 409);
    if (response?.status === 429)
      throw new SonnelyError("UsageMax is rate limiting exports. Try again shortly.", 429);
    if (!response?.ok) throw new SonnelyError("UsageMax could not accept this export.", 503);
    return json({ sent: batch.events.length });
  } catch (error) {
    return errorResponse(error);
  }
}
