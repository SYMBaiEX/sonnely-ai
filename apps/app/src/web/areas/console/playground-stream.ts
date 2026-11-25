import { EventSourceParserStream } from "eventsource-parser/stream";
import { z } from "zod";

const chunkSchema = z.looseObject({
  choices: z
    .array(
      z.looseObject({
        delta: z.looseObject({ content: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  error: z.looseObject({ message: z.string().optional() }).optional(),
  sonnely_receipt: z.unknown().optional(),
});

async function* readSse(body: ReadableStream<Uint8Array>) {
  const reader = body
    .pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>)
    .pipeThrough(new EventSourceParserStream())
    .getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value.data;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* readPlaygroundReply(body: ReadableStream<Uint8Array>, onReceipt?: (receipt: unknown) => void) {
  let receipt: unknown;
  let content = "";
  let finished = false;
  for await (const event of readSse(body)) {
    if (event === "[DONE]") {
      finished = true;
      if (receipt) onReceipt?.(receipt);
      break;
    }
    const parsed = chunkSchema.safeParse(JSON.parse(event));
    if (!parsed.success) continue;
    const chunk = parsed.data;
    if (chunk.error) throw new Error(chunk.error.message ?? "Could not complete request.");
    if (onReceipt && chunk.choices?.length === 0) receipt = chunk.sonnely_receipt ?? receipt;
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) {
      content += delta;
      yield content;
    }
  }
  if (!finished) throw new Error("The stream ended before billing was finalized. Check Usage before retrying.");
}
