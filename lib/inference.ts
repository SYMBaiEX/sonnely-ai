import { createHmac } from "node:crypto";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { limits } from "./api-contract";
import { nearResponseEvidence, receiptVersion, sha256 } from "./inference-receipt";
import { inferenceStream, providerUsage, publicUsage, type ProviderUsage } from "./inference-stream";
import { managedProviderKey, pilotWallet, publicInference } from "./managed-access";
import { phalaOrigin, phalaReceiptId, phalaResponseEvidence } from "./phala";
import { requestCharge } from "./pricing";
import { providerRequestId } from "./provider-billing";
import { providerIds, providerRoute } from "./provider-catalog";
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
    provider: z.strictObject({ only: z.tuple([z.enum(providerIds)]) }).optional(),
    max_cost_microusd: z.int().positive().optional(),
    stream: z.boolean().optional(),
    stream_options: z.strictObject({ include_usage: z.boolean().optional() }).optional(),
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
  usage: providerUsage,
});

export async function infer(
  raw: unknown,
  auth: { session?: string; hash?: string },
  withReceipt = false,
  keepAlive?: (work: Promise<void>) => void,
) {
  const input = completion.parse(raw);
  if (input.stream_options && !input.stream)
    throw new SonnelyError("stream_options requires stream: true.", 400);
  const model = models.find((item) => item.id === input.model);
  if (!model) throw new SonnelyError("Choose a model from the catalog.", 404);
  const provider = input.provider?.only[0] ?? model.provider;
  const route = providerRoute(model, provider);
  if (!route) throw new SonnelyError("The requested model is unavailable on this provider.", 404);
  const upstreamKey = managedProviderKey(provider);
  if (!upstreamKey) throw new SonnelyError("Managed inference is awaiting provider activation.", 503);

  const maxTokens = input.max_tokens ?? limits.defaultOutputTokens;
  const bytes = Buffer.byteLength(JSON.stringify(input.messages));
  const reserve = requestCharge(route, bytes + 256, 0, maxTokens);
  if (input.max_cost_microusd !== undefined && reserve > input.max_cost_microusd)
    throw new SonnelyError("The estimated reservation exceeds max_cost_microusd.", 400);
  const isPhala = provider === "phala";
  const isTinfoil = provider === "tinfoil";
  const { db, secret } = backend();
  const requestBody = JSON.stringify({
    model: route.upstreamModel,
    messages: input.messages,
    max_tokens: maxTokens,
    ...(input.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    ...(isPhala
      ? {
          provider: { only: ["phala"], allow_fallbacks: false, aci_verified: true },
          reasoning: { enabled: false },
        }
      : {}),
    ...(isTinfoil
      ? {
          user_cache_secret: createHmac("sha256", secret)
            .update("tinfoil-cache:" + (auth.hash ?? auth.session))
            .digest("hex"),
        }
      : {}),
  });
  const pilot = pilotWallet();
  const id = await db.mutation(api.sonnely.reserve, {
    secret,
    ...auth,
    ...(pilot ? { pilotWallet: pilot } : {}),
    model: input.model,
    ...(provider !== "near-ai" ? { provider } : {}),
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
  let providerReportedCostNano: number | undefined;
  let providerReceipt: string | undefined;
  let phalaEvidence: Awaited<ReturnType<typeof phalaResponseEvidence>> | undefined;
  let tinfoilEvidence: Awaited<ReturnType<typeof import("./tinfoil").fetchTinfoil>>["evidence"] | undefined;
  let upstreamId: string | null = null;
  let streamOwnsSettlement = false;
  let outcome = "upstream_transport";

  const settle = () =>
    db.mutation(api.sonnely.settle, {
      secret,
      id,
      status,
      input: tokensIn,
      output: tokensOut,
      cost,
      ...(providerRequest ? { providerRequest } : {}),
      ...(providerStatus === undefined ? {} : { providerStatus }),
      ...(providerReportedCostNano === undefined ? {} : { providerReportedCostNano }),
      outcome,
    });

  function rememberId(completionId: string) {
    if (provider === "near-ai") providerRequest = providerRequestId(upstreamId, completionId);
    if (isTinfoil) providerRequest = "tinfoil:" + completionId;
  }

  async function recordUsage(completionId: string, usage: ProviderUsage, responseHash?: string) {
    rememberId(completionId);
    tokensIn = usage.prompt_tokens;
    tokensOut = usage.completion_tokens;
    cached = Math.min(tokensIn, usage.prompt_tokens_details?.cached_tokens ?? 0);
    if (provider !== "near-ai" && usage.cost !== undefined)
      providerReportedCostNano = Math.round(usage.cost * 1e9);
    if (isPhala) {
      phalaEvidence = await phalaResponseEvidence(
        upstreamKey!,
        providerReceipt,
        completionId,
        route!.upstreamModel,
        sha256(requestBody),
        responseHash!,
      );
      if (phalaEvidence.status !== "aci_payload_matched") {
        status = "failed";
        outcome = "phala_" + phalaEvidence.status;
        throw new SonnelyError(
          "Phala did not return matching evidence for the requested private route.",
          502,
        );
      }
    }
    cost = requestCharge(route!, tokensIn, cached, tokensOut);
    status = "complete";
    outcome = "complete";
  }

  async function receipt(completionId: string, reportedModel: string | undefined, responseHash: string) {
    const requestHash = sha256(requestBody);
    return {
      version: receiptVersion,
      provider,
      requested_model: input.model,
      ...(reportedModel ? { reported_model: reportedModel } : {}),
      provider_completion_id: completionId,
      billing_reference: providerRequest,
      charged_microusd: Math.min(reserve, cost),
      cached_input_tokens: cached,
      upstream_request_sha256: requestHash,
      upstream_response_sha256: responseHash,
      evidence:
        phalaEvidence ??
        tinfoilEvidence ??
        (await nearResponseEvidence(
          upstreamKey!,
          completionId,
          route!.upstreamModel,
          requestHash,
          responseHash,
        )),
    };
  }

  let data: z.infer<typeof result>;
  let responseHash: string | undefined;
  try {
    let response: Response;
    try {
      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + upstreamKey,
          ...(withReceipt && provider === "near-ai" ? { "x-no-aliasing": "true" } : {}),
        },
        body: requestBody,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
      };
      if (isTinfoil) {
        const { fetchTinfoil } = await import("./tinfoil");
        const upstream = await fetchTinfoil(init);
        response = upstream.response;
        tinfoilEvidence = upstream.evidence;
      } else {
        response = await fetch(
          (isPhala ? phalaOrigin : "https://cloud-api.near.ai") + "/v1/chat/completions",
          init,
        );
      }
    } catch {
      throw new SonnelyError("The provider did not respond. The reservation is pending reconciliation.", 502);
    }
    providerStatus = response.status;
    if (isPhala) {
      providerReceipt = phalaReceiptId(response.headers);
      if (providerReceipt) providerRequest = "phala:" + providerReceipt;
    }
    upstreamId = response.headers.get("inference-id");
    if (
      provider === "near-ai" &&
      upstreamId &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(upstreamId)
    )
      providerRequest = upstreamId;
    if (!response.ok) {
      outcome = "upstream_http";
      if (response.status < 500) status = "failed";
      void response.body?.cancel().catch(() => null);
      throw new SonnelyError("The provider could not complete this request.", 502);
    }
    if (input.stream) {
      if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
        outcome = "stream_incomplete";
        void response.body?.cancel().catch(() => null);
        throw new SonnelyError(
          "The provider did not return a stream. The reservation is pending reconciliation.",
          502,
        );
      }
      const stream = inferenceStream({
        upstream: response.body,
        model: input.model,
        includeUsage: input.stream_options?.include_usage === true,
        rememberId,
        settle: async (final) => {
          try {
            if (final) await recordUsage(final.id, final.usage, final.responseHash);
            else outcome = "stream_incomplete";
          } finally {
            await settle();
          }
          if (withReceipt && final) return receipt(final.id, final.reportedModel, final.responseHash);
        },
      });
      streamOwnsSettlement = true;
      keepAlive?.(stream.finished);
      return stream.response;
    }
    outcome = "invalid_usage";
    let body: unknown;
    try {
      if (withReceipt || isPhala) {
        const responseBytes = Buffer.from(await response.arrayBuffer());
        body = JSON.parse(new TextDecoder().decode(responseBytes));
        responseHash = sha256(responseBytes);
      } else {
        body = await response.json();
      }
    } catch {
      body = null;
    }
    const parsed = result.safeParse(body);
    if (!parsed.success) throw new SonnelyError("The provider returned incomplete usage information.", 502);
    data = parsed.data;
    await recordUsage(data.id, data.usage, responseHash);
  } finally {
    if (!streamOwnsSettlement) await settle();
  }

  const reply = { ...data, model: input.model, usage: publicUsage(data.usage) };
  if (!withReceipt || !responseHash) return reply;
  return {
    ...reply,
    sonnely_receipt: await receipt(data.id, data.model, responseHash),
  };
}
