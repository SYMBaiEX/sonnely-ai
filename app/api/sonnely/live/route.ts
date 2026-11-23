import { ConvexClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { backendConfig, errorResponse, sessionHash } from "@/lib/server";
import { usageSince } from "@/lib/usage";

export const maxDuration = 60;

let liveClient: ConvexClient | undefined;

export async function GET(request: NextRequest) {
  try {
    const session = sessionHash(request);
    const { url, secret } = backendConfig();
    const days = request.nextUrl.searchParams.get("days");
    const since = days === null ? undefined : usageSince(days);
    const client = (liveClient ??= new ConvexClient(url, { logger: false }));
    const encoder = new TextEncoder();
    let cleanup: () => void = () => {};
    const body = new ReadableStream({
      start(controller) {
        let stopped = false;
        let unsubscribe: (() => void) | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        function disconnect() {
          if (stopped) return false;
          stopped = true;
          unsubscribe?.();
          clearInterval(heartbeat);
          clearTimeout(deadline);
          request.signal.removeEventListener("abort", close);
          return true;
        }
        function close() {
          if (disconnect()) controller.close();
        }
        function write(chunk: string) {
          if (!stopped) controller.enqueue(encoder.encode(chunk));
        }
        cleanup = disconnect;
        if (request.signal.aborted) {
          close();
          return;
        }
        request.signal.addEventListener("abort", close, { once: true });
        write("retry: 1500\n\n");
        heartbeat = setInterval(() => write(": heartbeat\n\n"), 15_000);
        deadline = setTimeout(close, 45_000);
        unsubscribe = client.onUpdate(
          api.sonnely.consoleLive,
          { session, secret, ...(since === undefined ? {} : { since }) },
          (snapshot) => {
            write("data: " + JSON.stringify(snapshot) + "\n\n");
            if (snapshot === null) close();
          },
          close,
        );
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
