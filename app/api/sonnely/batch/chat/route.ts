import { after, NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { batchKeyPattern, batchRequestBody } from "@/lib/batch-inference";
import { infer } from "@/lib/inference";
import {
  backend,
  ensureSameOrigin,
  inferenceErrorResponse,
  json,
  readBody,
  sessionHash,
  SonnelyError,
} from "@/lib/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const session = sessionHash(request);
    const retryKey = request.headers.get("Idempotency-Key");
    const wallet = request.headers.get("X-Sonnely-Batch-Wallet");
    if (!retryKey || !batchKeyPattern.test(retryKey) || !wallet)
      throw new SonnelyError("A batch request requires its workspace wallet and checkpoint key.", 400);
    const { db, secret } = backend();
    const profile = await db.query(api.sonnely.profile, { secret, session });
    if (!profile || profile.wallet !== wallet)
      throw new SonnelyError("Sign in with the wallet that owns this batch.", 401);

    const body = batchRequestBody.parse(await readBody(request));
    const result = await infer(body, { session }, false, (work) => after(() => work), retryKey);
    if (result instanceof Response) return result;
    const response = json(result);
    response.headers.set("X-Sonnely-Request-Id", result.sonnely_request_id);
    return response;
  } catch (error) {
    return inferenceErrorResponse(error);
  }
}
