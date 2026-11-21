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

const kind = z.enum(["blackboxes", "dry-docks"]);
const fileType = z.enum(["artifact", "evidence"]);
const idSchema = z.string().min(1).max(80);
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    reference: z.string(),
    minutes: z.number(),
    spec: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("blackboxes"), image: z.string(), port: z.number() }),
      z.object({ kind: z.literal("dry-docks"), repository: z.string(), revision: z.string() }),
    ]),
  }),
  z.object({ action: z.literal("stop"), id: idSchema }),
]);

export async function GET(request: NextRequest) {
  try {
    const session = sessionHash(request);
    const { db, secret } = backend();
    const search = request.nextUrl.searchParams;
    const id = idSchema.optional().parse(search.get("id") ?? undefined);
    if (search.has("file")) {
      const type = fileType.parse(search.get("file"));
      const url = id && (await db.query(api.compute.file, { secret, session, id, type }));
      if (!url) throw new SonnelyError("Compute file not found.", 404);
      const file = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (!file.ok) throw new SonnelyError("Compute file not found.", 404);
      const name = type === "artifact" ? "dry-dock-build.tar.gz" : "blackbox-attestation.json";
      return new Response(file.body, {
        headers: {
          "Content-Disposition": 'attachment; filename="' + name + '"',
          "Content-Type": type === "artifact" ? "application/gzip" : "application/json",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return json(
      await db.query(api.compute.list, { secret, session, kind: kind.parse(search.get("kind")), id }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const session = sessionHash(request);
    const { db, secret } = backend();
    const body = requestSchema.parse(await readBody(request, 4096));
    if (body.action === "stop") {
      await db.mutation(api.compute.stop, { secret, session, id: body.id });
      return json({ ok: true });
    }
    const { minutes, spec, reference } = body;
    return json(await db.mutation(api.compute.open, { secret, session, minutes, spec, reference }), 202);
  } catch (error) {
    return errorResponse(error);
  }
}
