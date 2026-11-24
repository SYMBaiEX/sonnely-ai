import type { NextRequest } from "next/server";
import { runSpecialized } from "@/lib/specialized-inference";
import { specializedModels, type SpecializedEndpoint } from "@/lib/specialized-models";
import { ensureSameOrigin, inferenceErrorResponse, sessionHash, SonnelyError } from "@/lib/server";

export const maxDuration = 60;

export async function POST(request: NextRequest, context: { params: Promise<{ endpoint: string[] }> }) {
  try {
    ensureSameOrigin(request);
    const session = sessionHash(request);
    const path = (await context.params).endpoint.join("/");
    if (!Object.hasOwn(specializedModels, path)) throw new SonnelyError("Unknown endpoint.", 404);
    return await runSpecialized(request, path as SpecializedEndpoint, session);
  } catch (error) {
    return inferenceErrorResponse(error);
  }
}
