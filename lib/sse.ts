import { createParser } from "eventsource-parser";

export async function* readSse(body: ReadableStream<Uint8Array>, onBytes?: (bytes: Uint8Array) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const events: string[] = [];
  const parser = createParser({ onEvent: ({ data }) => events.push(data) });
  let size = 0;
  let ended = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        ended = true;
        parser.feed(decoder.decode());
      } else {
        size += value.byteLength;
        if (size > 2_000_000) throw new Error("Stream exceeded the response size limit.");
        onBytes?.(value);
        parser.feed(decoder.decode(value, { stream: true }));
      }
      yield* events;
      events.length = 0;
      if (done) break;
    }
  } finally {
    if (!ended) void reader.cancel().catch(() => null);
    reader.releaseLock();
  }
}
