import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { limits } from "./api-contract";
import { nearResponseEvidence, receiptVersion, sha256 } from "./inference-receipt";
import { managedProviderKey, pilotWallet, publicInference } from "./managed-access";
import { requestCharge } from "./pricing";
import { providerRequestId } from "./provider-billing";
import { models } from "./models";
import { backend, SonnelyError } from "./server";

const message = z
  .object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1).max(limits.charactersPerMessage),
  })
  .strict();
const completion = z
  .object({
    model: z.string().min(1).max(100),
    messages: z.array(message).min(1).max(limits.messages),
    max_tokens: z.number().int().min(1).max(limits.maxOutputTokens).optional(),
    stream: z.literal(false).optional(),
  })
  .strict();

const result = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string().min(1).max(200).optional().catch(undefined),
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

export async function infer(raw: unknown, auth: { session?: string; hash?: string }, withReceipt = false) {
  const input = completion.parse(raw);
  const model = models.find((item) => item.id === input.model);
  if (!model) throw new SonnelyError("Choose a model from the catalog.", 404);
  const upstreamKey = managedProviderKey();
  if (!upstreamKey) throw new SonnelyError("Managed inference is awaiting provider activation.", 503);

  const maxTokens = input.max_tokens ?? limits.defaultOutputTokens;
  const bytes = Buffer.byteLength(JSON.stringify(input.messages));
  const reserve = requestCharge(model, bytes + 256, 0, maxTokens);
  const requestBody = JSON.stringify({ model: input.model, messages: input.messages, max_tokens: maxTokens });
  const { db, secret } = backend();
  const pilot = pilotWallet();
  const id = await db.mutation(api.sonnely.reserve, {
    secret,
    ...auth,
    ...(pilot ? { pilotWallet: pilot } : {}),
    model: input.model,
    cost: reserve,
    ...(publicInference() ? { requireTerms: true } : {}),
  });
  let status: "complete" | "failed" | "unreported" = "unreported";
  let tokensIn = 0;
  let tokensOut = 0;
  let cached = 0;
  let cost = 0;
  let providerRequest: string | undefined;
  let providerStatus: number | undefined;
  let outcome = "upstream_transport";
  let responseBytes: Buffer | undefined;
  let data: z.infer<typeof result>;
  try {
    let response: Response;
    try {
      response = await fetch("https://cloud-api.near.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + upstreamKey,
          ...(withReceipt ? { "x-no-aliasing": "true" } : {}),
        },
        body: requestBody,
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new SonnelyError("The provider did not respond. The reservation is pending reconciliation.", 502);
    }
    providerStatus = response.status;
    const upstreamId = response.headers.get("inference-id");
    if (upstreamId && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(upstreamId))
      providerRequest = upstreamId;
    if (!response.ok) {
      outcome = "upstream_http";
      if (response.status < 500) status = "failed";
      throw new SonnelyError("The provider could not complete this request.", 502);
    }
    outcome = "invalid_usage";
    let body: unknown;
    try {
      if (withReceipt) {
        responseBytes = Buffer.from(await response.arrayBuffer());
        body = JSON.parse(new TextDecoder().decode(responseBytes));
      } else {
        body = await response.json();
      }
    } catch {
      body = null;
    }
    const parsed = result.safeParse(body);
    if (!parsed.success) throw new SonnelyError("The provider returned incomplete usage information.", 502);
    data = parsed.data;
    tokensIn = data.usage.prompt_tokens;
    tokensOut = data.usage.completion_tokens;
    cached = Math.min(tokensIn, data.usage.prompt_tokens_details?.cached_tokens ?? 0);
    cost = requestCharge(model, tokensIn, cached, tokensOut);
    providerRequest = providerRequestId(upstreamId, data.id);
    status = "complete";
    outcome = "complete";
  } finally {
    await db.mutation(api.sonnely.settle, {
      secret,
      id,
      status,
      input: tokensIn,
      output: tokensOut,
      cost,
      ...(providerRequest ? { providerRequest } : {}),
      ...(providerStatus === undefined ? {} : { providerStatus }),
      outcome,
    });
  }

  const reply = { ...data, model: input.model, usage: { ...data.usage, total_tokens: tokensIn + tokensOut } };
  if (!responseBytes) return reply;

  const requestHash = sha256(requestBody);
  const responseHash = sha256(responseBytes);
  return {
    ...reply,
    sonnely_receipt: {
      version: receiptVersion,
      provider: model.provider,
      requested_model: input.model,
      ...(data.model ? { reported_model: data.model } : {}),
      provider_completion_id: data.id,
      billing_reference: providerRequest,
      charged_microusd: Math.min(reserve, cost),
      cached_input_tokens: cached,
      upstream_request_sha256: requestHash,
      upstream_response_sha256: responseHash,
      evidence: await nearResponseEvidence(upstreamKey, data.id, input.model, requestHash, responseHash),
    },
  };
}
