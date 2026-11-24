import type { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { providerIds } from "@/lib/provider-models";
import { requestLogStatuses } from "@/lib/request-logs";
import { backend, errorResponse, json, sessionHash, SonnelyError } from "@/lib/server";
import { usageSince } from "@/lib/usage";

const filters = z.object({
  days: z.enum(["7", "30", "90", "all"]).default("7"),
  cursor: z.string().min(1).max(4096).optional(),
  provider: z.enum(providerIds).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  keyName: z.string().trim().min(1).max(60).optional(),
  status: z.enum(requestLogStatuses).optional(),
});
const requestId = z.string().regex(/^[a-z0-9]{20,80}$/);

export async function GET(request: NextRequest) {
  try {
    const session = sessionHash(request);
    const { db, secret } = backend();
    const auth = { secret, session };
    const params = request.nextUrl.searchParams;
    if (params.has("id")) {
      const id = requestId.parse(params.get("id"));
      const row = await db.query(api.requestLogs.details, { ...auth, id });
      if (!row) throw new SonnelyError("Request not found in this workspace.", 404);
      return json(row);
    }
    const { days, cursor, ...scope } = filters.parse(Object.fromEntries(params));
    return json(
      await db.query(api.requestLogs.list, {
        ...auth,
        ...scope,
        since: days === "all" ? 0 : usageSince(days),
        cursor: cursor ?? null,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
