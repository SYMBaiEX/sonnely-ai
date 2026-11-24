import type { NextRequest } from "next/server";
import { managedProviderKey } from "@/lib/managed-access";
import { upgradeRealtime } from "@/lib/realtime-inference";
import { ensureSameOrigin, inferenceCredentials, inferenceErrorResponse, sessionHash, sessionToken, SonnelyError } from "@/lib/server";
import { realtimeModel } from "@/lib/specialized-models";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const credentials = !request.headers.has("authorization") && sessionToken(request)
      ? { session: sessionHash(request) }
      : inferenceCredentials(request);
    if ("session" in credentials) ensureSameOrigin(request);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      throw new SonnelyError("Use a WebSocket upgrade for realtime audio.", 426);
    if (
      request.nextUrl.searchParams.get("model") !== realtimeModel.id ||
      request.nextUrl.searchParams.has("intent")
    )
      throw new SonnelyError(
        "Use model=voxtral-mini-4b-realtime with the native transcription protocol.",
        400,
      );
    const key = managedProviderKey("tinfoil");
    if (!key) throw new SonnelyError("Managed inference is awaiting provider activation.", 503);
    return await upgradeRealtime(credentials, key);
  } catch (error) {
    return inferenceErrorResponse(error);
  }
}
