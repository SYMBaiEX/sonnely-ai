import { createHash, createHmac } from "node:crypto";
import { Readable } from "node:stream";
import { createParser, type EventSourceMessage } from "eventsource-parser";
import { verifyMessage } from "ethers";
import { SecureClient } from "tinfoil";
import { z } from "zod";
import { catalog, type CatalogModel, type ModelRoute } from "../../../gen/app__console__catalog.ts";

export type ProviderId = "near-ai" | "phala" | "tinfoil";
export type ProviderKey = { provider: ProviderId; key: string };
export type GatewayProblem = { status: number; message: string; retryAfter?: boolean };
export type Result<T> = { ok: true; value: T } | ({ ok: false } & GatewayProblem);

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = (status: number, message: string, retryAfter = false): Result<never> => ({ ok: false, status, message, retryAfter });
export const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export const providerIds = ["near-ai", "phala", "tinfoil"] as const;
const providerKeys: Record<ProviderId, string> = {
  "near-ai": "NEAR_AI_API_KEY",
  phala: "PHALA_AI_API_KEY",
  tinfoil: "TINFOIL_API_KEY",
};
const providerUrls: Record<ProviderId, string> = {
  "near-ai": "https://cloud-api.near.ai",
  phala: "https://inference.phala.com",
  tinfoil: "https://inference.tinfoil.sh",
};

const production = () => process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
export const publicInference = () => !production() || process.env.SONNELY_PUBLIC_INFERENCE === "true";
/** Deterministic staging answers are a development convenience; serving them for real money in production is not. */
export const stagingInference = () => !production();
const pausedProviders = () => new Set((process.env.SONNELY_PAUSED_PROVIDERS ?? "").split(",").map((provider) => provider.trim()).filter(Boolean));
export function managedProviderKey(provider: string): string | undefined {
  if (!providerIds.includes(provider as ProviderId) || pausedProviders().has(provider) || !publicInference()) return undefined;
  const key = process.env[providerKeys[provider as ProviderId]];
  return key?.trim() ? key : undefined;
}
export const configuredProviders = () => providerIds.filter((provider) => managedProviderKey(provider));

const requestLimits = { bodyBytes: 36_000, messages: 32, charactersPerMessage: 12_000, defaultOutputTokens: 512, maxOutputTokens: 2_048 } as const;
const toolName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const callId = z.string().min(1).max(200);
const jsonSchema = z.record(z.string(), z.json());
const functionTool = z.strictObject({
  type: z.literal("function"),
  function: z.strictObject({ name: toolName, description: z.string().max(2048).optional(), parameters: jsonSchema.optional(), strict: z.boolean().nullable().optional() }),
});
const toolChoice = z.union([z.enum(["auto", "none", "required"]), z.strictObject({ type: z.literal("function"), function: z.strictObject({ name: toolName }) })]);
const toolCall = z.object({ id: callId, type: z.literal("function"), function: z.object({ name: toolName, arguments: z.string() }) });
const responseFormat = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text") }),
  z.strictObject({ type: z.literal("json_object") }),
  z.strictObject({ type: z.literal("json_schema"), json_schema: z.strictObject({ name: toolName, description: z.string().max(2048).optional(), schema: jsonSchema, strict: z.boolean().nullable().optional() }) }),
]);
const messageText = z.string().min(1).max(requestLimits.charactersPerMessage);
const chatMessage = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("system"), content: messageText }),
  z.strictObject({ role: z.literal("user"), content: messageText }),
  z.strictObject({ role: z.literal("assistant"), content: messageText.nullable().optional(), tool_calls: z.array(toolCall).min(1).max(16).optional() }),
  z.strictObject({ role: z.literal("tool"), content: messageText, tool_call_id: callId }),
]);
const providerPolicy = z.strictObject({ only: z.array(z.enum(providerIds)).min(1).max(3), allow_fallbacks: z.boolean().optional() }).refine((value) => new Set(value.only).size === value.only.length && (value.allow_fallbacks === true ? value.only.length > 1 : value.only.length === 1));
export const chatInputSchema = z.strictObject({
  model: z.string().min(1).max(100),
  messages: z.array(chatMessage).min(1).max(requestLimits.messages),
  max_tokens: z.int().min(1).max(requestLimits.maxOutputTokens).optional(),
  max_cost_microusd: z.int().positive().optional(),
  stream: z.boolean().optional(),
  stream_options: z.strictObject({ include_usage: z.literal(true) }).optional(),
  provider: providerPolicy.optional(),
  tools: z.array(functionTool).min(1).max(16).optional(),
  tool_choice: toolChoice.optional(),
  response_format: responseFormat.optional(),
});
export type ChatInput = z.infer<typeof chatInputSchema>;
export type ChatRoute = { provider: ProviderId; key: string; upstreamModel: string; privacyRoute: string; rate: ModelRoute; estimate: number };
export type ChatSelection = { input: ChatInput; candidates: ChatRoute[]; stream: boolean; bytes: number; maxTokens: number };

const inputBytes = (input: ChatInput) => {
  const shape = { tools: input.tools, tool_choice: input.tool_choice, response_format: input.response_format };
  return new TextEncoder().encode(JSON.stringify(input.messages)).length + (input.tools || input.tool_choice || input.response_format ? new TextEncoder().encode(JSON.stringify(shape)).length : 0);
};
export function tokenCharge(rate: ModelRoute, input: number, cached: number, output: number) {
  const cache = rate.cache >= 0 ? rate.cache : rate.input;
  const total = Math.max(0, input - cached) * rate.input + cached * cache + output * rate.output;
  return Math.ceil(total / 1_000_000);
}
function capabilities(modelId: string, provider: ProviderId) {
  const deepseek = process.env.SONNELY_AGENT_CAPABILITIES === "true" && modelId === "deepseek-ai/DeepSeek-V4.1-Flash-1017";
  return { tools: deepseek && (provider === "phala" || provider === "tinfoil"), structured_outputs: deepseek && provider === "tinfoil" };
}
export function parseChatInput(raw: unknown): Result<ChatInput> {
  const parsed = chatInputSchema.safeParse(raw);
  if (!parsed.success) return bad(400, "Check the fields and try again.");
  const input = parsed.data;
  if (input.stream_options && input.stream !== true) return bad(400, "stream_options requires stream: true.");
  if (input.tool_choice && !input.tools) return bad(400, "tool_choice requires tools.");
  if (input.messages.some((message) => message.role === "assistant" && !message.content && !message.tool_calls)) return bad(400, "Assistant messages require content or tool calls.");
  if (new TextEncoder().encode(JSON.stringify(input)).length > requestLimits.bodyBytes) return bad(413, "The request is too large.");
  return ok(input);
}
export function selectChat(input: ChatInput): Result<ChatSelection> {
  const rows = catalog.filter((model) => model.routes.some((route) => route.endpoint === "chat/completions" && route.modelId === input.model));
  if (!rows.length) return bad(404, "The requested model is unavailable.");
  const requirements = {
    bytes: inputBytes(input),
    maxTokens: input.max_tokens ?? requestLimits.defaultOutputTokens,
    tools: Boolean(input.tools || input.tool_choice || input.messages.some((message) => message.role === "tool" || (message.role === "assistant" && message.tool_calls))),
    structured: input.response_format !== undefined && input.response_format.type !== "text",
  };
  const fallback = input.provider?.allow_fallbacks === true;
  const defaultProvider = providerIds.find((provider) => provider === rows[0]?.provider) ?? "near-ai";
  const ordered = input.provider?.only ?? [defaultProvider];
  let last: Result<never> | undefined;
  const candidates = ordered.flatMap((provider) => {
    const row = rows.find((model) => model.provider === provider);
    const route = row?.routes.find((candidate) => candidate.endpoint === "chat/completions" && candidate.modelId === input.model);
    const key = managedProviderKey(provider);
    const estimate = route ? tokenCharge(route, requirements.bytes + 256, 0, requirements.maxTokens) : 0;
    const capable = capabilities(input.model, provider);
    if (!row || !route) last = bad(404, "The requested model is unavailable on this provider.");
    else if (fallback && row.route !== "private-tee") last = bad(400, "Private failover requires a Private TEE route.");
    else if (requirements.tools && !capable.tools) last = bad(400, "Tool calling is unavailable on this route. Check /v1/models.");
    else if (requirements.structured && !capable.structured_outputs) last = bad(400, "Structured outputs are unavailable on this route. Check /v1/models.");
    else if (!key) last = bad(503, "Managed inference is awaiting provider activation.");
    else if (input.max_cost_microusd !== undefined && estimate > input.max_cost_microusd) last = bad(400, "The estimated reservation exceeds max_cost_microusd.");
    else return [{ provider, key, upstreamModel: row.upstreamId, privacyRoute: row.route, rate: route, estimate }];
    return [];
  });
  if (!candidates.length) {
    if (!fallback && last) return last;
    return bad((last as GatewayProblem | undefined)?.status === 503 ? 503 : 400, "No listed Private TEE provider meets this request's availability, capabilities, and cost limits.");
  }
  return ok({ input, candidates, stream: input.stream === true, bytes: requirements.bytes, maxTokens: requirements.maxTokens });
}

export function upstreamChatBody(input: ChatInput, candidate: ChatRoute, cacheSecret: string) {
  const body: Record<string, unknown> = {
    model: candidate.upstreamModel,
    messages: input.messages,
    max_tokens: input.max_tokens ?? requestLimits.defaultOutputTokens,
    stream: input.stream === true,
    ...(input.stream === true ? { stream_options: { include_usage: true } } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.tool_choice !== undefined ? { tool_choice: input.tool_choice } : {}),
    ...(input.response_format ? { response_format: input.response_format } : {}),
  };
  if (candidate.provider === "phala") {
    body.provider = { only: ["phala"], allow_fallbacks: false, aci_verified: true };
    body.reasoning = { enabled: false };
  }
  if (candidate.provider === "tinfoil") body.user_cache_secret = createHmac("sha256", cacheSecret).update("tinfoil-cache:" + cacheSecret).digest("hex");
  return JSON.stringify(body);
}

const tinfoilClient = new SecureClient({ userCacheSecret: "sonnely-explicit-scope" });
const piiClient = new SecureClient({ enclaveURL: "https://pii-filter.tinfoil.sh", configRepo: "tinfoilsh/confidential-pii-cpu", transport: "tls" });
export async function fetchTinfoil(init: RequestInit, path: `/v1/${string}` | "/redact" = "/v1/chat/completions") {
  const client = path === "/redact" ? piiClient : tinfoilClient;
  await client.ready();
  const before = client.getVerificationDocument();
  if (!before.securityVerified || !before.releaseDigest) throw new Error("Tinfoil router verification is unavailable.");
  init.signal?.throwIfAborted();
  const response = await client.fetch(path, init);
  const verification = client.getVerificationDocument();
  if (!verification.securityVerified || !verification.releaseDigest) {
    await response.body?.cancel();
    throw new Error("Tinfoil router verification is unavailable.");
  }
  return { response, evidence: { status: "attested_router" as const, config_repo: verification.configRepo, release_digest: verification.releaseDigest } };
}
export type UpstreamCall = { response: Response; evidence?: { status: "attested_router"; config_repo: string; release_digest: string } };
export type ChatAttempt = UpstreamCall & { candidate: ChatRoute; body: string };

/** Upstream deadlines: a hung provider must never hold a credit reserve open. */
export const upstreamTimeouts = { headersMs: 30_000, totalMs: 120_000, streamIdleMs: 60_000 } as const;

function deadlineSignal(stream: boolean, signal: AbortSignal | undefined) {
  const headers = new AbortController();
  const timer = setTimeout(() => headers.abort(), upstreamTimeouts.headersMs);
  timer.unref?.();
  const signals = [headers.signal, ...(stream ? [] : [AbortSignal.timeout(upstreamTimeouts.totalMs)]), ...(signal ? [signal] : [])];
  return { signal: AbortSignal.any(signals), headersReceived: () => clearTimeout(timer) };
}

export async function callChatCandidates(input: ChatInput, candidates: ChatRoute[], cacheSecret: string, signal?: AbortSignal): Promise<ChatAttempt> {
  const fallback = input.provider?.allow_fallbacks === true;
  for (const [index, candidate] of candidates.entries()) {
    const body = upstreamChatBody(input, candidate, cacheSecret);
    const attempt = await callChat(candidate, body, input.stream === true, signal);
    if (
      !fallback ||
      attempt.response.status !== 429 ||
      index === candidates.length - 1 ||
      attempt.response.headers.has("inference-id") ||
      attempt.response.headers.has("x-receipt-id")
    ) return { ...attempt, candidate, body };
    void attempt.response.body?.cancel().catch(() => null);
  }
  throw new Error("No chat candidate was available.");
}
export async function callChat(candidate: ChatRoute, body: string, stream = false, signal?: AbortSignal): Promise<UpstreamCall> {
  const deadline = deadlineSignal(stream, signal);
  const init = {
    method: "POST",
    headers: { Authorization: "Bearer " + candidate.key, "Content-Type": "application/json" },
    body,
    signal: deadline.signal,
  } satisfies RequestInit;
  try {
    if (candidate.provider === "tinfoil") return await fetchTinfoil(init);
    return { response: await fetch(providerUrls[candidate.provider] + "/v1/chat/completions", init) };
  } finally {
    deadline.headersReceived();
  }
}

const usageSchema = z.object({
  prompt_tokens: z.int().nonnegative(),
  completion_tokens: z.int().nonnegative(),
  total_tokens: z.int().nonnegative().optional().catch(undefined),
  cost: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER / 1e9).optional().catch(undefined),
  prompt_tokens_details: z.object({ cached_tokens: z.int().nonnegative().nullish() }).nullish(),
  completion_tokens_details: z.object({ reasoning_tokens: z.int().nonnegative().nullish() }).nullish(),
}).loose();
const completionSchema = z.object({
  id: z.string(),
  created: z.number(),
  choices: z.array(z.object({ index: z.number(), finish_reason: z.string().nullable(), message: z.object({ role: z.literal("assistant"), content: z.string().nullable().optional(), reasoning_content: z.string().nullable().optional(), tool_calls: z.array(toolCall).optional() }).loose() }).loose()).min(1),
  usage: usageSchema,
}).loose();
export type UpstreamUsage = z.infer<typeof usageSchema>;
export const publicUsage = (usage: UpstreamUsage) => ({ prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.prompt_tokens + usage.completion_tokens });
export const cachedTokens = (usage: UpstreamUsage) => Math.min(usage.prompt_tokens, Math.max(0, usage.prompt_tokens_details?.cached_tokens ?? 0));
export async function parseChatCompletion(response: Response) {
  const text = await response.text();
  const parsed = completionSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("Provider returned incomplete usage.");
  return { completion: parsed.data, responseHash: sha256(text) };
}

export function providerRequestReference(provider: ProviderId, response: Response, completionId: string) {
  if (provider === "near-ai") {
    const inference = response.headers.get("inference-id");
    if (inference && z.uuid().safeParse(inference).success) return inference;
    const digest = sha256("6ba7b810-9dad-11d1-80b4-00c04fd430c8" + completionId).replace(/-/g, "");
    return digest.slice(0, 8) + "-" + digest.slice(8, 12) + "-" + digest.slice(12, 16) + "-" + digest.slice(16, 20) + "-" + digest.slice(20, 32);
  }
  if (provider === "phala") {
    const receipt = response.headers.get("x-receipt-id");
    return receipt ? "phala:" + receipt : undefined;
  }
  if (provider === "tinfoil") return "tinfoil:" + completionId;
  return undefined;
}

const nearSignatureSchema = z.object({
  signature_kind: z.enum(["provider_tee", "gateway"]),
  signing_algo: z.literal("ecdsa"),
  signing_address: z.string().regex(/^(0x)?[a-f0-9]{40}$/i),
  signature: z.string().regex(/^(0x)?[a-f0-9]{130}$/i),
  text: z.string().max(256),
});
export async function nearEvidence(completionId: string, key: string, model: string, requestHash: string, responseHash: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(completionId)) return { status: "unavailable" as const };
  const url = new URL(providerUrls["near-ai"] + "/v1/signature/" + completionId);
  url.searchParams.set("signing_algo", "ecdsa");
  let payload: unknown;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", Authorization: "Bearer " + key }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2_500) });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: "unavailable" as const };
    }
    payload = await response.json();
  } catch {
    return { status: "unavailable" as const };
  }
  const parsed = nearSignatureSchema.safeParse(payload);
  if (!parsed.success) return { status: "unavailable" as const };
  const evidence = parsed.data;
  const hashes = requestHash + ":" + responseHash;
  const expected = evidence.signature_kind === "provider_tee" ? model + ":" + hashes : hashes;
  let status: "signature_matched" | "payload_mismatch" | "invalid_signature" = "payload_mismatch";
  if (evidence.text === expected) {
    try {
      const signature = "0x" + evidence.signature.replace(/^0x/i, "");
      const declared = evidence.signing_address.replace(/^0x/i, "").toLowerCase();
      status = verifyMessage(evidence.text, signature).slice(2).toLowerCase() === declared ? "signature_matched" : "invalid_signature";
    } catch {
      status = "invalid_signature";
    }
  }
  return status === "signature_matched" ? { status, ...evidence } : { status };
}

const receiptIdPattern = /^[a-zA-Z0-9_-]{1,200}$/;
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const receiptEventSchema = z.object({
  type: z.string(),
  body_hash: digestSchema.optional(),
  target_route_id: z.string().max(300).optional(),
  session_id: z.string().regex(receiptIdPattern).optional(),
  required: z.boolean().optional(),
  result: z.string().max(50).optional(),
  model_id: z.string().max(200).optional(),
});
const phalaReceiptSchema = z.object({
  api_version: z.literal("aci/1"),
  receipt_id: z.string().regex(receiptIdPattern),
  chat_id: z.string(),
  model: z.string(),
  workload_keyset_digest: digestSchema,
  event_log: z.array(receiptEventSchema).max(30),
});
export async function phalaEvidence(reference: string | undefined, key: string, completionId: string, upstreamModel: string, requestHash: string, responseHash: string) {
  const receiptId = reference?.startsWith("phala:") ? reference.slice(6) : undefined;
  if (!receiptId || !receiptIdPattern.test(receiptId)) return { status: "unavailable" as const };
  const response = await fetch(providerUrls.phala + "/v1/aci/receipts/" + receiptId, { headers: { Authorization: "Bearer " + key }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2_500) }).catch(() => null);
  if (!response?.ok) return { status: "unavailable" as const };
  const parsed = phalaReceiptSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { status: "unavailable" as const };
  const receipt = parsed.data;
  const find = (type: string) => receipt.event_log.find((event) => event.type === type);
  if (
    receipt.receipt_id !== receiptId ||
    receipt.chat_id !== completionId ||
    receipt.model !== upstreamModel ||
    find("request.received")?.body_hash !== "sha256:" + requestHash ||
    find("response.returned")?.body_hash !== "sha256:" + responseHash
  ) return { status: "payload_mismatch" as const };
  const selected = find("route.selected")?.target_route_id;
  const upstream = find("upstream.verified");
  if (!selected || !/^phala-\d+:/.test(selected) || !selected.endsWith(":" + upstreamModel) || !upstream?.required || upstream.result !== "verified" || !upstream.session_id || upstream.model_id !== upstreamModel) return { status: "route_mismatch" as const };
  return { status: "aci_payload_matched" as const, aci_receipt_id: receiptId, aci_keyset_digest: receipt.workload_keyset_digest, operator_route: selected, upstream_session_id: upstream.session_id };
}

function readSse(body: ReadableStream<Uint8Array>, onBytes?: (bytes: Uint8Array) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const pending: string[] = [];
  const parser = createParser({ onEvent: ({ data }: EventSourceMessage) => pending.push(data) });
  let size = 0;
  let ended = false;
  const events = (async function* () {
    const readWithIdleDeadline = async () => {
      let idle: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => {
            idle = setTimeout(() => reject(new Error("The provider stream sent no data for 60 seconds.")), upstreamTimeouts.streamIdleMs);
            idle.unref?.();
          }),
        ]);
      } finally {
        if (idle) clearTimeout(idle);
      }
    };
    try {
      for (;;) {
        const { value, done } = await readWithIdleDeadline();
        if (done) {
          ended = true;
          parser.feed(decoder.decode());
        } else {
          size += value.byteLength;
          if (size > 2_000_000) throw new Error("Stream exceeded the response size limit.");
          onBytes?.(value);
          parser.feed(decoder.decode(value, { stream: true }));
        }
        yield* pending;
        pending.length = 0;
        if (done) break;
      }
    } finally {
      if (!ended) void reader.cancel().catch(() => null);
      reader.releaseLock();
    }
  })();
  return {
    events,
    async cancel() {
      await reader.cancel().catch(() => undefined);
    },
  };
}

const toolDelta = z.object({
  index: z.int().nonnegative(),
  id: callId.optional(),
  type: z.literal("function").optional(),
  function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
});
const chunkSchema = z.object({
  id: z.string().min(1).max(200),
  object: z.literal("chat.completion.chunk"),
  created: z.number(),
  model: z.string().min(1).max(200).optional(),
  choices: z.array(z.object({
    index: z.int().nonnegative(),
    delta: z.object({
      role: z.literal("assistant").optional(),
      content: z.string().nullish(),
      reasoning_content: z.string().nullish(),
      tool_calls: z.array(toolDelta).optional(),
    }),
    finish_reason: z.string().nullable().default(null),
  })),
  usage: usageSchema.nullish(),
});
type Chunk = z.infer<typeof chunkSchema>;
export type StreamFinal = { id: string; reportedModel?: string; usage: UpstreamUsage; responseHash: string; firstTokenAt?: number };
type ChatSseOptions = {
  upstream: ReadableStream<Uint8Array>;
  model: string;
  includeUsage: boolean;
  rememberId: (id: string) => void;
  settle: (usage: StreamFinal | undefined, observedFirstTokenAt: number | undefined, servedOutputChars: number) => Promise<unknown>;
};

const chatSseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
} as const;

const asNodeWebStream = (body: ReadableStream<Uint8Array>) => {
  if (typeof body.getReader !== "function" || typeof body.cancel !== "function") throw new TypeError("The chat stream is not a web ReadableStream.");
  return body as Parameters<typeof Readable.fromWeb>[0];
};

function chatSseStream(options: ChatSseOptions) {
  let readable = true;
  let canceled = false;
  let firstTokenAt: number | undefined;
  let settlement: Promise<unknown> | undefined;
  let finished!: Promise<void>;
  let servedOutputChars = 0;
  const settleOnce = (final?: StreamFinal, observedFirstTokenAt?: number) => {
    settlement ??= Promise.resolve().then(() => options.settle(final, observedFirstTokenAt, servedOutputChars));
    return settlement;
  };
  const encode = new TextEncoder();
  const digest = createHash("sha256");
  const source = readSse(options.upstream, (bytes) => digest.update(bytes));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: string) => {
        if (readable) controller.enqueue(encode.encode("data: " + data + "\n\n"));
      };
      finished = (async () => {
        let error = "The stream ended without complete provider usage. The reservation is pending reconciliation.";
        try {
          let id: string | undefined;
          let terminal: Chunk | undefined;
          let done = false;
          let malformed = false;
          try {
            for await (const event of source.events) {
              if (canceled) break;
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
              if (firstTokenAt === undefined && chunk.choices.some(({ delta }) => delta.content || delta.reasoning_content || delta.tool_calls?.length)) firstTokenAt = Date.now();
              for (const { delta } of chunk.choices) {
                servedOutputChars += (delta.content?.length ?? 0) + (delta.reasoning_content?.length ?? 0);
              }
              send(JSON.stringify({
                id: chunk.id,
                object: chunk.object,
                created: chunk.created,
                model: options.model,
                choices: chunk.choices,
                ...(options.includeUsage ? { usage: null } : {}),
              }));
            }
          } catch {
            malformed = true;
          }
          if (canceled) {
            await settleOnce(undefined, firstTokenAt);
            return;
          }
          if (malformed || !done || !terminal?.usage) {
            await settleOnce(undefined, firstTokenAt);
            throw new Error(error);
          }
          error = "Sonnely could not finalize this stream. Check the usage ledger before retrying.";
          const receipt = await settleOnce({
            id: terminal.id,
            ...(terminal.model ? { reportedModel: terminal.model } : {}),
            usage: terminal.usage,
            responseHash: digest.digest("hex"),
            ...(firstTokenAt === undefined ? {} : { firstTokenAt }),
          });
          if (options.includeUsage || receipt) {
            send(JSON.stringify({
              id: terminal.id,
              object: terminal.object,
              created: terminal.created,
              model: options.model,
              choices: [],
              ...(options.includeUsage ? { usage: publicUsage(terminal.usage) } : {}),
              ...(receipt ? { sonnely_receipt: receipt } : {}),
            }));
          }
          send("[DONE]");
        } catch (cause) {
          if (!canceled) {
            if (cause instanceof Error && cause.message !== error) error = cause.message;
            send(JSON.stringify({ error: { message: error, type: "sonnely_error", code: 502 } }));
          }
        } finally {
          if (readable) controller.close();
        }
      })();
      return undefined;
    },
    async cancel() {
      canceled = true;
      readable = false;
      await Promise.allSettled([source.cancel(), settleOnce(undefined, firstTokenAt)]);
    },
  });
  return { finished, body, headers: chatSseHeaders };
}

export function chatSseResponse(options: ChatSseOptions) {
  const stream = chatSseStream(options);
  return {
    finished: stream.finished,
    response: new Response(stream.body, { headers: stream.headers }),
  };
}

export function chatSseNodeResponse(options: ChatSseOptions) {
  const stream = chatSseStream(options);
  return {
    finished: stream.finished,
    body: Readable.fromWeb(asNodeWebStream(stream.body)),
  };
}

export function modelsPayload() {
  const enabled = configuredProviders();
  const rows = catalog.flatMap((model) => model.routes.filter((route) => route.endpoint === "chat/completions").map((route) => ({ model, route })));
  const unique = new Map<string, { model: CatalogModel; route: ModelRoute }>();
  for (const row of rows) if (!unique.has(row.route.modelId)) unique.set(row.route.modelId, row);
  const agent = process.env.SONNELY_AGENT_CAPABILITIES === "true";
  return {
    object: "list",
    data: [...unique.values()].map(({ model, route }) => ({
      id: route.modelId,
      object: "model",
      created: 0,
      owned_by: model.provider,
      sonnely: {
        context_length: model.context,
        privacy_route: model.route,
        routes: catalog.filter((candidate) => candidate.routes.some((item) => item.endpoint === "chat/completions" && item.modelId === route.modelId) && enabled.includes(candidate.provider as ProviderId)).map((candidate) => {
          const item = candidate.routes.find((routeItem) => routeItem.endpoint === "chat/completions" && routeItem.modelId === route.modelId)!;
          return { provider: candidate.provider, upstream_model: candidate.upstreamId, private_failover: candidate.route === "private-tee", capabilities: capabilities(route.modelId, candidate.provider as ProviderId), price_usd_per_million: { input: item.input / 1_000_000, cache: item.cache / 1_000_000, output: item.output / 1_000_000 }, agent };
        }),
      },
    })),
  };
}
export function providerModelsPayload() {
  return { providers: configuredProviders(), catalog, specialized: catalog.flatMap((model) => model.routes.filter((route) => route.endpoint !== "chat/completions").map((route) => ({ provider: model.provider, upstream_model: model.upstreamId, ...route }))), realtime_model: "voxtral-mini-4b-realtime" };
}

const embeddingsInput = z.strictObject({ model: z.string(), input: z.union([z.string().min(1).max(8192), z.array(z.string().min(1).max(8192)).min(1).max(32)]), encoding_format: z.enum(["float", "base64"]).optional(), max_cost_microusd: z.int().positive().optional() });
const rerankInput = z.strictObject({ model: z.string(), query: z.string().min(1).max(4096), documents: z.array(z.string().min(1).max(8192)).min(1).max(16), max_cost_microusd: z.int().positive().optional() });
const responsesInput = z.strictObject({ model: z.string(), input: z.string().min(1).max(32_000), max_output_tokens: z.int().min(1).max(4096).optional(), max_cost_microusd: z.int().positive().optional() });
const redactInput = z.strictObject({ model: z.string().optional(), text: z.string().min(1).max(32_000), max_cost_microusd: z.int().positive().optional() });
const systemoneInput = z.strictObject({ model: z.string().optional(), state: z.string().min(1).max(32_000), questions: z.record(z.string(), z.object({ type: z.literal("noul"), instructions: z.unknown() }).loose()), max_cost_microusd: z.int().positive().optional() });
const imageInput = z.strictObject({ model: z.string(), prompt: z.string().min(1).max(4096), size: z.string().max(40).optional(), n: z.literal(1).optional(), max_cost_microusd: z.int().positive().optional() });
const speechInput = z.strictObject({ model: z.string(), input: z.string().min(1).max(4096), voice: z.string().max(80).optional(), response_format: z.enum(["mp3", "wav"]).optional(), max_cost_microusd: z.int().positive().optional() });
export type SpecializedSelection = { provider: ProviderId; key: string; upstreamModel: string; route: ModelRoute; reserve: number; inputTokens: number };
export function specializedRoute(endpoint: string, model: string, inputTokens: number, fixed = false, outputTokens = 0): Result<SpecializedSelection> {
  const row = catalog.find((candidate) => candidate.routes.some((route) => route.endpoint === endpoint && route.modelId === model));
  const route = row?.routes.find((candidate) => candidate.endpoint === endpoint && candidate.modelId === model);
  if (!row || !route) return bad(404, "The requested model is unavailable on this endpoint.");
  const provider = row.provider as ProviderId;
  const key = managedProviderKey(provider);
  if (!key) return bad(503, "Managed inference is awaiting provider activation.");
  const reserve = fixed || route.request >= 0 ? Math.max(0, route.request) + (endpoint === "redact" ? tokenCharge(route, inputTokens, 0, 0) : 0) : tokenCharge(route, inputTokens, 0, outputTokens);
  return ok({ provider, key, upstreamModel: row.upstreamId, route, reserve, inputTokens });
}
export function parseSpecialized(endpoint: string, raw: unknown): Result<Record<string, unknown>> {
  const schema = endpoint === "embeddings" ? embeddingsInput : endpoint === "rerank" ? rerankInput : endpoint === "responses" ? responsesInput : endpoint === "redact" ? redactInput : endpoint === "systemone" ? systemoneInput : endpoint.startsWith("images/") ? imageInput : endpoint === "audio/speech" ? speechInput : undefined;
  if (!schema) return bad(400, "Use multipart form data for this endpoint.");
  const parsed = schema.safeParse(raw);
  return parsed.success ? ok(parsed.data as Record<string, unknown>) : bad(400, "Check the fields and try again.");
}
export function specializedInputTokens(endpoint: string, body: Record<string, unknown>) {
  const count = (value: unknown) => Math.ceil(new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).length / 4);
  if (endpoint === "embeddings") {
    const input = body.input;
    return Array.isArray(input) ? (input as unknown[]).reduce((sum: number, item) => sum + count(item), 0) : count(input);
  }
  if (endpoint === "responses" || endpoint === "redact" || endpoint === "systemone" || endpoint === "audio/speech") return count(body.input ?? body.text ?? body.state);
  return 0;
}
export async function multipartForm(source: unknown, contentType: string) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source as AsyncIterable<Uint8Array>) chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes, { headers: { "content-type": contentType } }).formData();
}
export function formModel(form: FormData, fallback: string) {
  const model = form.get("model");
  return typeof model === "string" && model ? model : fallback;
}
export async function callSpecialized(endpoint: string, selection: SpecializedSelection, input: Record<string, unknown> | FormData) {
  const providerPath = endpoint === "redact" ? "/redact" : "/v1/" + endpoint;
  const headers: Record<string, string> = { Authorization: "Bearer " + selection.key };
  let body: BodyInit;
  if (input instanceof FormData) {
    const outbound = new FormData();
    for (const [name, value] of input.entries()) if (!(value instanceof File) || value.size > 0) outbound.append(name, value);
    outbound.delete("max_cost_microusd");
    outbound.set("model", selection.upstreamModel);
    body = outbound;
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify({ ...input, model: selection.upstreamModel, max_cost_microusd: undefined });
  }
  const deadline = deadlineSignal(false, undefined);
  try {
    if (selection.provider === "tinfoil") return await fetchTinfoil({ method: "POST", headers, body, signal: deadline.signal }, providerPath as "/redact" | `/v1/${string}`);
    return { response: await fetch(providerUrls[selection.provider] + providerPath, { method: "POST", headers, body, signal: deadline.signal }) };
  } finally {
    deadline.headersReceived();
  }
}
export function extractUsage(endpoint: string, value: unknown): { input: number; output: number; costTokens: number } {
  if (typeof value === "object" && value !== null && "usage" in value) {
    const usage = (value as { usage?: unknown }).usage;
    const parsed = usageSchema.safeParse(usage);
    if (parsed.success) return { input: parsed.data.prompt_tokens, output: parsed.data.completion_tokens, costTokens: parsed.data.prompt_tokens + parsed.data.completion_tokens };
    const decision = z.object({ input_tokens: z.int().nonnegative(), output_tokens: z.int().nonnegative() }).safeParse(usage);
    if (decision.success) return { input: decision.data.input_tokens, output: decision.data.output_tokens, costTokens: decision.data.input_tokens + decision.data.output_tokens };
  }
  return { input: 0, output: 0, costTokens: 0 };
}
