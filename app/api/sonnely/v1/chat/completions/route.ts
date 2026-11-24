import { after, NextRequest } from "next/server";
import { infer } from "@/lib/inference";
import { receiptHeader, receiptVersion } from "@/lib/inference-receipt";
import { inferenceCredentials, inferenceErrorResponse, json, readBody, SonnelyError } from "@/lib/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { hash, retryKey } = inferenceCredentials(request);
    const receipt = request.headers.get(receiptHeader);
    if (receipt !== null && receipt !== receiptVersion)
      throw new SonnelyError("Unsupported evidence receipt version. Use " + receiptHeader + ": v1.", 400);
    const result = await infer(
      await readBody(request),
      { hash },
      receipt === receiptVersion,
      (finished) => after(() => finished),
      retryKey,
    );
    if (result instanceof Response) return result;
    const response = json(result);
    response.headers.set("X-Sonnely-Request-Id", result.sonnely_request_id);
    response.headers.set("X-Sonnely-Provider", result.sonnely_provider);
    return response;
  } catch (error) {
    return inferenceErrorResponse(error);
  }
}
