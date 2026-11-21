import { NextRequest } from "next/server";
import { infer } from "@/lib/inference";
import { receiptHeader, receiptVersion } from "@/lib/inference-receipt";
import { errorResponse, hash, json, readBody, SonnelyError } from "@/lib/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer ((?:sonnely_live_|fr_live_)[a-zA-Z0-9_-]{43})$/i)?.[1];
    if (!bearer) throw new SonnelyError("Provide a Sonnely API key.", 401);
    const receipt = request.headers.get(receiptHeader);
    if (receipt !== null && receipt !== receiptVersion)
      throw new SonnelyError("Unsupported evidence receipt version. Use " + receiptHeader + ": v1.", 400);
    return json(await infer(await readBody(request), { hash: hash(bearer) }, receipt === receiptVersion));
  } catch (error) {
    return errorResponse(error, true);
  }
}
