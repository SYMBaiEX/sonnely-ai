import { ConvexError } from "convex/values";
import { after, NextRequest } from "next/server";
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
    const retryKey = request.headers.get("idempotency-key");
    if (retryKey !== null && !/^[a-zA-Z0-9_.:-]{8,128}$/.test(retryKey))
      throw new SonnelyError(
        "Use 8–128 letters, numbers, dots, underscores, colons, or hyphens in Idempotency-Key.",
        400,
      );
    const receipt = request.headers.get(receiptHeader);
    if (receipt !== null && receipt !== receiptVersion)
      throw new SonnelyError("Unsupported evidence receipt version. Use " + receiptHeader + ": v1.", 400);
    const result = await infer(
      await readBody(request),
      { hash: hash(bearer) },
      receipt === receiptVersion,
      (finished) => after(() => finished),
      retryKey ?? undefined,
    );
    if (result instanceof Response) return result;
    const response = json(result);
    response.headers.set("X-Sonnely-Request-Id", result.sonnely_request_id);
    return response;
  } catch (error) {
    if (
      error instanceof ConvexError &&
      error.data?.code === "duplicate_request" &&
      typeof error.data.reference === "string"
    ) {
      const response = errorResponse(
        new SonnelyError("This Idempotency-Key already started a request. See Usage for its status.", 409),
        true,
      );
      response.headers.set("X-Sonnely-Request-Id", error.data.reference);
      return response;
    }
    return errorResponse(error, true);
  }
}
