import { createUIMessageStream, readUIMessageStream } from "ai";
import { readSse } from "./sse";

export async function* readPlaygroundReply(
  body: ReadableStream<Uint8Array>,
  onReceipt?: (receipt: unknown) => void,
) {
  const stream = createUIMessageStream({
    async execute({ writer }) {
      writer.write({ type: "text-start", id: "reply" });
      let receipt: unknown;
      for await (const event of readSse(body)) {
        if (event === "[DONE]") {
          if (receipt) onReceipt?.(receipt);
          writer.write({ type: "text-end", id: "reply" });
          return;
        }
        const chunk = JSON.parse(event);
        if (chunk.error) throw new Error(chunk.error.message);
        if (onReceipt && Array.isArray(chunk.choices) && chunk.choices.length === 0)
          receipt = chunk.sonnely_receipt ?? receipt;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) writer.write({ type: "text-delta", id: "reply", delta });
      }
      throw new Error("The stream ended before billing was finalized. Check Usage before retrying.");
    },
    onError: (error) => (error instanceof Error ? error.message : "Could not complete request."),
  });

  let previous = "";
  for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    if (text === previous) continue;
    previous = text;
    yield text;
  }
}
