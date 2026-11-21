import { NextRequest } from "next/server";
import { infer } from "@/lib/inference";
import { errorResponse, hash, json, readBody, SonnelyError } from "@/lib/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer ((?:sonnely_live_|fr_live_)[a-zA-Z0-9_-]{43})$/i)?.[1];
    if (!bearer) throw new SonnelyError("Provide a Sonnely API key.", 401);
    return json(await infer(await readBody(request), { hash: hash(bearer) }));
  } catch (error) {
    return errorResponse(error, true);
  }
}
