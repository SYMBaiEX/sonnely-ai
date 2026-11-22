import { createHash } from "node:crypto";
import { z } from "zod";
import { readSse } from "./sse";
import { SonnelyError } from "./sonnely-error";

export const providerUsage = z.object({
  prompt_tokens: z.int().nonnegative(),
  completion_tokens: z.int().nonnegative(),
  total_tokens: z.int().nonnegative().optional().catch(undefined),
  cost: z
    .number()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER / 1e9)
    .optional()
    .catch(undefined),
  prompt_tokens_details: z.object({ cached_tokens: z.int().nonnegative().nullish() }).nullish(),
  completion_tokens_details: z.object({ reasoning_tokens: z.int().nonnegative().nullish() }).nullish(),
});
export type ProviderUsage = z.infer<typeof providerUsage>;

export function publicUsage({ cost: _providerCost, ...usage }: ProviderUsage) {
  return { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens };
}

const chunkSchema = z.object({
  id: z.string().min(1).max(200),
  object: z.literal("chat.completion.chunk"),
  created: z.number(),
  model: z.string().min(1).max(200).optional(),
  choices: z.array(
    z.object({
      index: z.int().nonnegative(),
      delta: z.object({
        role: z.literal("assistant").optional(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
      }),
      finish_reason: z.string().nullable().default(null),
    }),
  ),
  usage: providerUsage.nullish(),
});
type Chunk = z.infer<typeof chunkSchema>;

type FinalUsage = {
  id: string;
  reportedModel?: string;
  usage: ProviderUsage;
  responseHash: string;
};

export function inferenceStream(options: {
  upstream: ReadableStream<Uint8Array>;
  model: string;
  includeUsage: boolean;
  rememberId: (id: string) => void;
  settle: (usage?: FinalUsage) => Promise<unknown>;
}) {
  let readable = true;
  let finished: Promise<void>;
  const encode = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: string) => {
        if (readable) controller.enqueue(encode.encode("data: " + data + "\n\n"));
      };
      finished = (async () => {
        let error =
          "The stream ended without complete provider usage. The reservation is pending reconciliation.";
        try {
          const digest = createHash("sha256");
          let id: string | undefined;
          let terminal: Chunk | undefined;
          let done = false;
          let malformed = false;
          try {
            for await (const event of readSse(options.upstream, (bytes) => digest.update(bytes))) {
              if (event === "[DONE]") {
                if (done || !terminal) malformed = true;
                done = true;
                continue;
              }
              if (done || terminal) {
                malformed = true;
                break;
              }
              const chunk = chunkSchema.parse(JSON.parse(event));
              if (id && id !== chunk.id) {
                malformed = true;
                break;
              }
              if (!id) {
                options.rememberId(chunk.id);
                id = chunk.id;
              }
              if (!chunk.choices.length && chunk.usage) {
                terminal = chunk;
                continue;
              }
              send(
                JSON.stringify({
                  id: chunk.id,
                  object: chunk.object,
                  created: chunk.created,
                  model: options.model,
                  choices: chunk.choices,
                  ...(options.includeUsage ? { usage: null } : {}),
                }),
              );
            }
          } catch {
            malformed = true;
          }
          if (malformed || !done || !terminal?.usage) {
            await options.settle();
            throw new Error(error);
          }
          error = "Sonnely could not finalize this stream. Check the usage ledger before retrying.";
          const receipt = await options.settle({
            id: terminal.id,
            reportedModel: terminal.model,
            usage: terminal.usage,
            responseHash: digest.digest("hex"),
          });
          if (options.includeUsage || receipt) {
            send(
              JSON.stringify({
                id: terminal.id,
                object: terminal.object,
                created: terminal.created,
                model: options.model,
                choices: [],
                ...(options.includeUsage ? { usage: publicUsage(terminal.usage) } : {}),
                ...(receipt ? { sonnely_receipt: receipt } : {}),
              }),
            );
          }
          send("[DONE]");
        } catch (cause) {
          // The stream can already be an HTTP 200 here. Report a protocol-level error instead.
          if (cause instanceof SonnelyError) error = cause.message;
          send(JSON.stringify({ error: { message: error, type: "sonnely_error", code: 502 } }));
        } finally {
          if (readable) controller.close();
        }
      })();
      return undefined;
    },
    cancel() {
      // Keep draining within the provider deadline so disconnects can still be billed accurately.
      readable = false;
    },
  });
  return {
    finished: finished!,
    response: new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    }),
  };
}
