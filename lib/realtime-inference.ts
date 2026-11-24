import { createHmac } from "node:crypto";
import { upgradeWebSocket, waitUntil } from "@vercel/functions";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { managedProviderKey, publicInference } from "./managed-access";
import { markupPercent } from "./pricing";
import { backend, inferenceErrorResponse } from "./server";
import { realtimeModel } from "./specialized-models";
import { openTinfoilRealtime } from "./tinfoil";

type Socket = Parameters<Parameters<typeof upgradeWebSocket>[0]>[0];
type Credentials = { hash: string; retryKey?: string } | { session: string; retryKey?: never };
type Status = "complete" | "failed" | "unreported";
const chargeMicrousd = Math.round(realtimeModel.rate * (100 + markupPercent) * 10_000);
const audioLimit = 960_000; // 30 seconds of 16 kHz mono PCM16.
const clientEvent = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("session.update"), model: z.literal(realtimeModel.id) }),
  z.strictObject({ type: z.literal("input_audio_buffer.append"), audio: z.base64().min(4).max(43_000) }),
  z.strictObject({ type: z.literal("input_audio_buffer.commit"), final: z.literal(true).optional() }),
]);
const providerEvent = z.object({
  type: z.enum(["session.created", "transcription.delta", "transcription.done", "error"]),
  delta: z.string().max(64_000).optional(),
  text: z.string().max(64_000).optional(),
});

function send(socket: Socket, value: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(value));
}

export function upgradeRealtime(credentials: Credentials, upstreamKey: string) {
  return upgradeWebSocket(
    (socket) => {
      waitUntil(bridge(socket, credentials, upstreamKey));
    },
    { maxPayload: 48_000 },
  );
}

async function bridge(socket: Socket, credentials: Credentials, upstreamKey: string) {
  let upstream: Awaited<ReturnType<typeof openTinfoilRealtime>> | undefined;
  let bytes = 0;
  let committed = false;
  let ready = false;
  let ended = false;
  let finish!: (result: { status: Status; text?: string }) => void;
  const completed = new Promise<{ status: Status; text?: string }>((resolve) => {
    finish = (result) => {
      if (ended) return;
      ended = true;
      resolve(result);
    };
  });
  const interrupted = () => finish({ status: bytes ? "unreported" : "failed" });
  const timer = setTimeout(interrupted, 45_000);
  socket.once("close", interrupted);
  socket.once("error", interrupted);
  socket.on("message", (data, binary) => {
    if (ended) return;
    try {
      const event = binary ? null : clientEvent.safeParse(JSON.parse(data.toString()));
      if (!event?.success || !ready || committed || !upstream) throw new Error("Invalid frame");
      if (event.data.type === "session.update") return;
      if (event.data.type === "input_audio_buffer.append") {
        const length = Buffer.from(event.data.audio, "base64").byteLength;
        if (length % 2 || length === 0 || bytes + length > audioLimit) throw new Error("Audio limit");
        bytes += length;
        upstream.send(JSON.stringify(event.data));
        return;
      }
      if (bytes === 0) throw new Error("Empty audio");
      committed = true;
      upstream.send(JSON.stringify({ type: "input_audio_buffer.commit", final: true }));
    } catch {
      send(socket, {
        type: "error",
        error: { message: "Invalid realtime frame, session state, or audio size." },
      });
      interrupted();
    }
  });

  let requestId: string | undefined;
  try {
    const { db, secret } = backend();
    const id = await db.mutation(api.sonnely.reserve, {
      secret,
      ...("hash" in credentials ? { hash: credentials.hash } : { session: credentials.session }),
      model: realtimeModel.id,
      endpoint: "realtime",
      provider: realtimeModel.provider,
      cost: chargeMicrousd,
      ...(publicInference() ? { requireTerms: true } : {}),
      ...(credentials.retryKey
        ? {
            retryKey: createHmac("sha256", secret)
              .update("completion-idempotency:" + credentials.retryKey)
              .digest("hex"),
          }
        : {}),
    });
    requestId = id;

    if (!ended) {
      try {
        upstream = await openTinfoilRealtime(upstreamKey);
        upstream.once("close", interrupted);
        upstream.once("error", interrupted);
        upstream.on("message", (data) => {
          if (ended) return;
          try {
            const event = providerEvent.safeParse(JSON.parse(data.toString()));
            if (!event.success) return;
            if (event.data.type === "session.created") {
              if (ready || !upstream) return;
              upstream.send(JSON.stringify({ type: "session.update", model: realtimeModel.id }));
              upstream.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
              ready = true;
              send(socket, { type: "session.created", model: realtimeModel.id, sonnely_request_id: id });
            } else if (event.data.type === "transcription.delta" && event.data.delta !== undefined) {
              send(socket, { type: event.data.type, delta: event.data.delta });
            } else if (
              event.data.type === "transcription.done" &&
              committed &&
              event.data.text !== undefined
            ) {
              finish({ status: "complete", text: event.data.text });
            } else if (event.data.type === "error") {
              interrupted();
            }
          } catch {
            interrupted();
          }
        });
      } catch {
        interrupted();
      }
    }
    const result = await completed;
    await db.mutation(api.sonnely.settle, {
      secret,
      id,
      input: 0,
      output: 0,
      cost: result.status === "complete" ? chargeMicrousd : 0,
      status: result.status,
      outcome: "realtime_" + result.status,
    });
    if (result.status === "complete")
      send(socket, { type: "transcription.done", text: result.text, sonnely_request_id: id });
    else
      send(socket, {
        type: "error",
        error: { message: "Realtime transcription ended before completion. Check Usage before retrying." },
        sonnely_request_id: id,
      });
    socket.close(result.status === "complete" ? 1000 : 1011);
  } catch (error) {
    const response = inferenceErrorResponse(error);
    const payload = await response.json();
    send(socket, {
      type: "error",
      ...payload,
      sonnely_request_id: requestId ?? response.headers.get("X-Sonnely-Request-Id"),
    });
    socket.close(1011);
  } finally {
    clearTimeout(timer);
    upstream?.close();
  }
}
