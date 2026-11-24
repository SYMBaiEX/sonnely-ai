import { createHmac } from "node:crypto";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { limits } from "./api-contract";
import { nearResponseEvidence, receiptVersion, sha256 } from "./inference-receipt";
import { inferenceStream, providerUsage, publicUsage, type ProviderUsage } from "./inference-stream";
import { publicInference } from "./managed-access";
import { phalaOrigin, phalaReceiptId, phalaResponseEvidence } from "./phala";
import { requestCharge } from "./pricing";
import { providerRequestId } from "./provider-billing";
import { completionMessage, functionTool, responseFormat, toolCall, toolChoice } from "./inference-tools";
import { completionRoutes, providerAtCapacity, providerPolicy } from "./private-routing";
import { InferenceRequestError } from "./sonnely-error";
import { models } from "./models";
import { backend, SonnelyError } from "./server";
import type { GatewayReceipt } from "./usagemax-gateway";

const completion = z
  .object({
    model: z.string().min(1).max(100),
    messages: z.array(completionMessage).min(1).max(limits.messages),
    max_tokens: z.number().int().min(1).max(limits.maxOutputTokens).optional(),
    provider: providerPolicy.optional(),
    max_cost_microusd: z.int().positive().optional(),
    stream: z.boolean().optional(),
    tools: z.array(functionTool).min(1).max(16).optional(),
    tool_choice: toolChoice.optional(),
    response_format: responseFormat.optional(),
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
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().nullable().default(null),
          tool_calls: z.array(toolCall).optional(),
        }),
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
  idempotencyKey?: string,
) {
  const requestAt = Date.now();
  const input = completion.parse(raw);
  if (input.stream_options && !input.stream)
    throw new SonnelyError("stream_options requires stream: true.", 400);
  const model = models.find((item) => item.id === input.model);
  if (!model) throw new SonnelyError("Choose a model from the catalog.", 404);
  const usesTools = Boolean(
    input.tools ||
    input.tool_choice !== undefined ||
    input.messages.some((item) => item.role === "tool" || (item.role === "assistant" && item.tool_calls)),
  );
  if (input.tool_choice && !input.tools) throw new SonnelyError("tool_choice requires tools.", 400);
  if (input.messages.some((item) => item.role === "assistant" && !item.content && !item.tool_calls))
    throw new SonnelyError("Assistant messages require content or tool calls.", 400);
  const maxTokens = input.max_tokens ?? limits.defaultOutputTokens;
  const shape = {
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.tool_choice ? { tool_choice: input.tool_choice } : {}),
    ...(input.response_format ? { response_format: input.response_format } : {}),
  };
  const bytes =
    Buffer.byteLength(JSON.stringify(input.messages)) +
    (input.tools || input.tool_choice || input.response_format
      ? Buffer.byteLength(JSON.stringify(shape))
      : 0);
  const candidates = completionRoutes(model, input.provider, {
    tools: usesTools,
    structured: Boolean(input.response_format && input.response_format.type !== "text"),
    bytes,
    maxTokens,
    maxCost: input.max_cost_microusd,
  });
  type Candidate = (typeof candidates)[number];
  const fallback = input.provider?.allow_fallbacks === true;
  const reserve = Math.max(...candidates.map((candidate) => candidate.estimate));
  const { db, secret } = backend();
  const retryKey = idempotencyKey
    ? createHmac("sha256", secret)
        .update("completion-idempotency:" + idempotencyKey)
        .digest("hex")
    : undefined;
  const reservationAt = Date.now();

  async function reserveRequest(): Promise<{ id: Id<"usage">; index: number }> {
    for (const [index, candidate] of candidates.entries()) {
      try {
        const id = await db.mutation(api.sonnely.reserve, {
          secret,
          ...auth,
          model: input.model,
          endpoint: "chat/completions",
          ...(candidate.provider !== "near-ai" ? { provider: candidate.provider } : {}),
          cost: reserve,
          ...(fallback ? { providerCost: candidate.estimate } : {}),
          ...(retryKey ? { retryKey } : {}),
          ...(publicInference() ? { requireTerms: true } : {}),
        });
        return { id, index };
      } catch (cause) {
        if (index === candidates.length - 1 || !providerAtCapacity(cause)) throw cause;
      }
    }
    throw new SonnelyError("No eligible private routes are currently available.", 503);
  }

  const initial = await reserveRequest();
  const id = initial.id;
  let selectedIndex = initial.index;
  let active = candidates[selectedIndex];

  function upstreamBody({ provider, route }: Candidate) {
    return JSON.stringify({
      model: route.upstreamModel,
      messages: input.messages,
      ...shape,
      max_tokens: maxTokens,
      ...(input.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...(provider === "phala"
        ? {
            provider: { only: ["phala"], allow_fallbacks: false, aci_verified: true },
            ...(route.reasoningRequired ? {} : { reasoning: { enabled: false } }),
          }
        : {}),
      ...(provider === "tinfoil"
        ? {
            user_cache_secret: createHmac("sha256", secret)
              .update("tinfoil-cache:" + (auth.hash ?? auth.session))
              .digest("hex"),
          }
        : {}),
    });
  }

  let requestBody = upstreamBody(active);
  let status: "complete" | "failed" | "unreported" = "unreported";
  let tokensIn = 0;
  let tokensOut = 0;
  let cached = 0;
  let cost = 0;
  let providerRequest: string | undefined;
  let providerStatus: number | undefined;
  let providerReportedCostNano: number | undefined;
  let gatewayUsage: GatewayReceipt["usage"] | undefined;
  let gatewayResolvedModel: string | undefined;
  let gatewayFirstTokenAt: number | undefined;
  let providerReceipt: string | undefined;
  let phalaEvidence: Awaited<ReturnType<typeof phalaResponseEvidence>> | undefined;
  let tinfoilEvidence: Awaited<ReturnType<typeof import("./tinfoil").fetchTinfoil>>["evidence"] | undefined;
  let upstreamId: string | null = null;
  let streamOwnsSettlement = false;
  let outcome = "upstream_transport";
  let providerAt = Date.now();
  let providerDoneAt: number | undefined;
  let verificationAt: number | undefined;

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
      usageMaxDetails: {
        stream: input.stream === true,
        attemptModel: active.route.upstreamModel,
        timing: {
          requestAt,
          reservationAt,
          providerAt,
          providerDoneAt: providerDoneAt ?? Date.now(),
          ...(verificationAt === undefined ? {} : { verificationAt }),
          settlementAt: Date.now(),
        },
        ...(gatewayUsage ? { usage: gatewayUsage } : {}),
        ...(gatewayResolvedModel ? { resolvedModel: gatewayResolvedModel } : {}),
        ...(gatewayFirstTokenAt === undefined ? {} : { firstTokenAt: gatewayFirstTokenAt }),
      },
    });

  function rememberId(completionId: string) {
    if (active.provider === "near-ai") providerRequest = providerRequestId(upstreamId, completionId);
    if (active.provider === "tinfoil") providerRequest = "tinfoil:" + completionId;
  }

  async function recordUsage(
    completionId: string,
    usage: ProviderUsage,
    responseHash?: string,
    reportedModel?: string,
  ) {
    providerDoneAt = Date.now();
    rememberId(completionId);
    tokensIn = usage.prompt_tokens;
    tokensOut = usage.completion_tokens;
    cached = Math.min(tokensIn, usage.prompt_tokens_details?.cached_tokens ?? 0);
    const reportedCache = usage.prompt_tokens_details?.cached_tokens;
    const reportedReasoning = usage.completion_tokens_details?.reasoning_tokens;
    const knownCache =
      typeof reportedCache === "number" && reportedCache <= tokensIn ? reportedCache : undefined;
    const knownReasoning =
      typeof reportedReasoning === "number" && reportedReasoning <= tokensOut ? reportedReasoning : undefined;
    gatewayUsage = {
      inputTokens: tokensIn - (knownCache ?? 0),
      outputTokens: tokensOut - (knownReasoning ?? 0),
      ...(knownCache === undefined ? {} : { cacheReadTokens: knownCache }),
      ...(knownReasoning === undefined ? {} : { reasoningTokens: knownReasoning }),
      ...(usage.total_tokens === undefined ? {} : { reportedTotalTokens: usage.total_tokens }),
    };
    gatewayResolvedModel = reportedModel;
    if (active.provider !== "near-ai" && usage.cost !== undefined)
      providerReportedCostNano = Math.round(usage.cost * 1e9);
    if (active.provider === "phala") {
      verificationAt = Date.now();
      phalaEvidence = await phalaResponseEvidence(
        active.key,
        providerReceipt,
        completionId,
        active.route.upstreamModel,
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
    cost = requestCharge(active.route, tokensIn, cached, tokensOut);
    status = "complete";
    outcome = "complete";
  }

  async function receipt(completionId: string, reportedModel: string | undefined, responseHash: string) {
    const requestHash = sha256(requestBody);
    return {
      version: receiptVersion,
      provider: active.provider,
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
          active.key,
          completionId,
          active.route.upstreamModel,
          requestHash,
          responseHash,
        )),
    };
  }

  async function nextPrivateRoute(startedAt: number, endedAt: number) {
    const rejected = {
      provider: active.provider,
      model: active.route.upstreamModel,
      startedAt,
      endedAt,
      httpStatus: 429 as const,
    };
    for (let index = selectedIndex + 1; index < candidates.length; index++) {
      const candidate = candidates[index];
      try {
        await db.mutation(api.sonnely.advancePrivateRoute, {
          secret,
          id,
          rejected,
          next: candidate.provider,
          providerCost: candidate.estimate,
        });
        selectedIndex = index;
        active = candidate;
        requestBody = upstreamBody(active);
        return true;
      } catch (cause) {
        if (!providerAtCapacity(cause)) throw cause;
      }
    }
    return false;
  }

  let data: z.infer<typeof result>;
  let responseHash: string | undefined;
  try {
    let response: Response;
    const deadline = AbortSignal.timeout(45_000);
    for (;;) {
      if (deadline.aborted) {
        status = "failed";
        outcome = "route_deadline";
        throw new SonnelyError("The private routing deadline expired before another request was sent.", 502);
      }
      const { provider, key } = active;
      try {
        const init: RequestInit = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + key,
            ...((withReceipt || fallback) && provider === "near-ai" ? { "x-no-aliasing": "true" } : {}),
          },
          body: requestBody,
          cache: "no-store",
          redirect: "error",
          signal: deadline,
        };
        providerAt = Date.now();
        if (provider === "tinfoil") {
          const { fetchTinfoil } = await import("./tinfoil");
          const upstream = await fetchTinfoil(init);
          response = upstream.response;
          tinfoilEvidence = upstream.evidence;
        } else {
          response = await fetch(
            (provider === "phala" ? phalaOrigin : "https://cloud-api.near.ai") + "/v1/chat/completions",
            init,
          );
        }
      } catch {
        throw new SonnelyError(
          "The provider did not respond. The reservation is pending reconciliation.",
          502,
        );
      }
      if (
        !fallback ||
        response.status !== 429 ||
        selectedIndex >= candidates.length - 1 ||
        response.headers.has("inference-id") ||
        response.headers.has("x-receipt-id") ||
        deadline.aborted
      )
        break;

      const rejectedAt = Date.now();
      void response.body?.cancel().catch(() => null);
      status = "failed";
      outcome = "upstream_http";
      if (!(await nextPrivateRoute(providerAt, rejectedAt))) break;
      status = "unreported";
      outcome = "upstream_transport";
      tinfoilEvidence = undefined;
    }

    const provider = active.provider;
    const isPhala = provider === "phala";
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
      if (
        response.status < 500 &&
        !(
          fallback &&
          response.status === 429 &&
          (response.headers.has("inference-id") || response.headers.has("x-receipt-id"))
        )
      )
        status = "failed";
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
        settle: async (final, observedFirstTokenAt) => {
          try {
            if (final) {
              gatewayFirstTokenAt = final.firstTokenAt;
              await recordUsage(final.id, final.usage, final.responseHash, final.reportedModel);
            } else {
              outcome = "stream_incomplete";
              gatewayFirstTokenAt = observedFirstTokenAt;
            }
          } finally {
            await settle();
          }
          if (withReceipt && final) return receipt(final.id, final.reportedModel, final.responseHash);
        },
      });
      streamOwnsSettlement = true;
      keepAlive?.(stream.finished);
      stream.response.headers.set("X-Sonnely-Request-Id", id);
      stream.response.headers.set("X-Sonnely-Provider", provider);
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
    await recordUsage(data.id, data.usage, responseHash, data.model);
  } catch (cause) {
    if (cause instanceof SonnelyError) throw new InferenceRequestError(cause, id);
    throw cause;
  } finally {
    if (!streamOwnsSettlement) await settle();
  }

  const reply = {
    ...data,
    model: input.model,
    usage: publicUsage(data.usage),
    sonnely_request_id: id,
    sonnely_provider: active.provider,
  };
  if (!withReceipt || !responseHash) return reply;
  return {
    ...reply,
    sonnely_receipt: await receipt(data.id, data.model, responseHash),
  };
}
