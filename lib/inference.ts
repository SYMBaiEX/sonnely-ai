import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { models } from "./models";
import { backend, SonnelyError } from "./server";

const message = z
  .object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(12_000) })
  .strict();
const completion = z
  .object({
    model: z.string().min(1).max(100),
    messages: z.array(message).min(1).max(32),
    max_tokens: z.number().int().min(1).max(2048).optional(),
    stream: z.literal(false).optional(),
  })
  .strict();

const result = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  choices: z
    .array(
      z.object({
        index: z.number(),
        message: z.object({ role: z.literal("assistant"), content: z.string().nullable() }),
        finish_reason: z.string().nullable(),
      }),
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    prompt_tokens_details: z
      .object({ cached_tokens: z.number().int().nonnegative().optional().nullable() })
      .optional()
      .nullable(),
  }),
});

export async function infer(raw: unknown, auth: { session?: string; hash?: string }) {
  const input = completion.parse(raw);
  const model = models.find((item) => item.id === input.model);
  if (!model) throw new SonnelyError("Choose a model from the catalog.", 404);
  const upstreamKey = process.env.NEAR_AI_API_KEY;
  if (!upstreamKey) throw new SonnelyError("Managed inference is awaiting provider activation.", 503);

  const maxTokens = input.max_tokens ?? 512;
  const bytes = Buffer.byteLength(JSON.stringify(input.messages));
  const reserve = Math.ceil((bytes + 256) * model.input + maxTokens * model.output);
  const { db, secret } = backend();
  const id = await db.mutation(api.sonnely.reserve, { secret, ...auth, model: input.model, cost: reserve });
  let status: "complete" | "failed" | "unreported" = "unreported";
  let tokensIn = 0;
  let tokensOut = 0;
  let cost = 0;
  try {
    let response: Response;
    try {
      response = await fetch("https://cloud-api.near.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + upstreamKey },
        body: JSON.stringify({ model: input.model, messages: input.messages, max_tokens: maxTokens }),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new SonnelyError("The provider did not respond. The reservation is pending reconciliation.", 502);
    }
    if (!response.ok) {
      if (response.status < 500) status = "failed";
      throw new SonnelyError("The provider could not complete this request.", 502);
    }
    const parsed = result.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new SonnelyError("The provider returned incomplete usage information.", 502);
    const data = parsed.data;
    tokensIn = data.usage.prompt_tokens;
    tokensOut = data.usage.completion_tokens;
    const cached = Math.min(tokensIn, data.usage.prompt_tokens_details?.cached_tokens ?? 0);
    cost = Math.ceil((tokensIn - cached) * model.input + cached * model.cache + tokensOut * model.output);
    status = "complete";
    return { ...data, model: input.model, usage: { ...data.usage, total_tokens: tokensIn + tokensOut } };
  } finally {
    await db.mutation(api.sonnely.settle, { secret, id, status, input: tokensIn, output: tokensOut, cost });
  }
}
