import { z } from "zod";

export const realtimeModelId = "voxtral-mini-4b-realtime";
export const realtimeAudioLimit = 960_000;

const base64Audio = z
  .string()
  .min(4)
  .max(43_000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => value.length % 4 === 0);

const clientEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("session.update"), model: z.literal(realtimeModelId) }),
  z.strictObject({ type: z.literal("input_audio_buffer.append"), audio: base64Audio }),
  z.strictObject({ type: z.literal("input_audio_buffer.commit"), final: z.literal(true).optional() }),
]);

const providerEventSchema = z
  .object({
    type: z.enum(["session.created", "transcription.delta", "transcription.done", "error"]),
    delta: z.string().max(64_000).optional(),
    text: z.string().max(64_000).optional(),
  })
  .loose();

export type RealtimeClientEvent =
  | { type: "session.update" }
  | { type: "input_audio_buffer.append"; audio: string; bytes: number }
  | { type: "input_audio_buffer.commit" };
export type RealtimeProviderEvent = z.infer<typeof providerEventSchema>;

const textDecoder = new TextDecoder();

function frameText(frame: string | Uint8Array): string | undefined {
  if (typeof frame === "string") return frame;
  try {
    return textDecoder.decode(frame);
  } catch {
    return undefined;
  }
}

function frameJson(frame: string | Uint8Array): unknown {
  const text = frameText(frame);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** @throws {never} */
export function parseRealtimeClientFrame(frame: string | Uint8Array): RealtimeClientEvent | undefined {
  if (typeof frame !== "string") return undefined;
  const parsed = clientEventSchema.safeParse(frameJson(frame));
  if (!parsed.success) return undefined;
  const event = parsed.data;
  if (event.type === "session.update") return { type: "session.update" };
  if (event.type === "input_audio_buffer.commit") return { type: "input_audio_buffer.commit" };
  const bytes = Buffer.from(event.audio, "base64").byteLength;
  return { type: "input_audio_buffer.append", audio: event.audio, bytes };
}

/** @throws {never} */
export function parseRealtimeProviderFrame(frame: string | Uint8Array): RealtimeProviderEvent | undefined {
  const parsed = providerEventSchema.safeParse(frameJson(frame));
  return parsed.success ? parsed.data : undefined;
}

/** @throws {never} */
export function realtimeClientMessage(value: unknown): string {
  return JSON.stringify(value);
}
