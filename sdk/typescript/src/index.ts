import { createParser } from "eventsource-parser";

export type Provider = "near-ai" | "phala" | "tinfoil";
export type ProviderPolicy =
  | { only: [Provider]; allow_fallbacks?: false }
  | { only: [Provider, Provider] | [Provider, Provider, Provider]; allow_fallbacks: true };
export type Message = { role: "system" | "user" | "assistant"; content: string };
export type CompletionRequest = {
  model: string;
  messages: Message[];
  max_tokens?: number;
  provider?: ProviderPolicy;
  max_cost_microusd?: number;
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
};

export type Receipt = {
  version: "v1";
  provider: Provider;
  requested_model: string;
  reported_model?: string;
  provider_completion_id: string;
  billing_reference: string;
  charged_microusd: number;
  cached_input_tokens: number;
  upstream_request_sha256: string;
  upstream_response_sha256: string;
  evidence: { status: string } & Record<string, unknown>;
};

export type Completion = {
  id: string;
  object: "chat.completion";
  model: string;
  created: number;
  choices: {
    index: number;
    message: { role: "assistant"; content: string | null; reasoning_content?: string | null };
    finish_reason: string | null;
  }[];
  usage: Usage;
  sonnely_receipt?: Receipt;
  sonnely_request_id?: string;
  sonnely_provider?: Provider;
};

export type CompletionChunk = Omit<Completion, "choices" | "object" | "usage" | "sonnely_request_id" | "sonnely_provider"> & {
  object: "chat.completion.chunk";
  choices: {
    index: number;
    delta: { role?: "assistant"; content?: string | null; reasoning_content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: Usage | null;
};

export type ModelList = {
  object: "list";
  data: {
    id: string;
    object: "model";
    created: number;
    owned_by: string;
    tier: "confidential";
    privacy_route: "private-tee";
    routes: {
      provider: Provider;
      provider_name: string;
      upstream_model: string;
      private_failover?: boolean;
      capabilities?: { tools: boolean; structured_outputs: boolean };
      price_usd_per_million: { input: number; cache: number; output: number };
    }[];
  }[];
};

export type ResponseMetadata = { requestId: string | null; retryAfter: string | null; provider?: Provider };
export type CompletionOptions = InferenceOptions & {
  receipt?: boolean;
  onResponse?: (metadata: ResponseMetadata) => void;
};
type ErrorEvent = { error?: { message?: string; code?: number } };

export class SonnelyError extends Error {
  readonly requestId: string | null;
  readonly retryAfter: string | null;
  readonly provider: Provider | null;

  constructor(message: string, public readonly status: number, details?: ResponseMetadata) {
    super(message);
    this.name = "SonnelyError";
    this.requestId = details?.requestId ?? null;
    this.retryAfter = details?.retryAfter ?? null;
    this.provider = details?.provider ?? null;
  }
}

function responseMetadata(response: Response): ResponseMetadata {
  const provider = response.headers.get("X-Sonnely-Provider");
  return {
    requestId: response.headers.get("X-Sonnely-Request-Id"),
    retryAfter: response.headers.get("Retry-After"),
    ...(provider === "near-ai" || provider === "phala" || provider === "tinfoil" ? { provider } : {}),
  };
}

export class Sonnely {
  private readonly apiKey?: string;
  private readonly baseURL: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { apiKey?: string; baseURL?: string; fetch?: typeof fetch } = {}) {
    this.apiKey = options.apiKey;
    this.baseURL = (options.baseURL ?? "https://sonnely.com/api/sonnely/v1").replace(/\/+$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  private async send(path: string, init: RequestInit) {
    const res = await this.fetcher(this.baseURL + path, { ...init, redirect: "error" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorEvent | null;
      throw new SonnelyError(
        body?.error?.message ?? `Sonnely returned HTTP ${res.status}.`,
        res.status,
        responseMetadata(res),
      );
    }
    return res;
  }

  private create(body: object, { receipt, signal, idempotencyKey }: CompletionOptions) {
    if (!this.apiKey) throw new SonnelyError("A Sonnely API key is required for completions.", 401);
    return this.send("/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
        ...(receipt ? { "X-Sonnely-Receipt": "v1" } : {}),
        ...(idempotencyKey !== undefined ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async providerModels<T = Record<string, unknown>>(signal?: AbortSignal): Promise<T> {
    return (await this.send("/provider-models", { signal })).json() as Promise<T>;
  }

  async infer<T = Record<string, unknown>>(
    endpoint: Exclude<SpecializedEndpoint, "audio/speech">,
    body: Record<string, unknown> | FormData,
    options?: InferenceOptions,
  ): Promise<InferenceResult<T>>;
  async infer(
    endpoint: "audio/speech",
    body: Record<string, unknown>,
    options?: InferenceOptions,
  ): Promise<InferenceResult<ArrayBuffer>>;
  async infer<T>(
    endpoint: SpecializedEndpoint,
    body: Record<string, unknown> | FormData,
    options: InferenceOptions = {},
  ): Promise<InferenceResult<T | ArrayBuffer>> {
    if (!this.apiKey) throw new SonnelyError("A Sonnely API key is required for inference.", 401);
    const multipart = body instanceof FormData;
    const response = await this.send("/" + endpoint, {
      method: "POST",
      signal: options.signal,
      headers: {
        Authorization: "Bearer " + this.apiKey,
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: multipart ? body : JSON.stringify(body),
    });
    return {
      data: endpoint === "audio/speech" ? await response.arrayBuffer() : await response.json() as T,
      requestId: response.headers.get("X-Sonnely-Request-Id"),
    };
  }

  realtimeConnection(): { url: string; headers: Record<string, string> } {
    if (!this.apiKey) throw new SonnelyError("A Sonnely API key is required for inference.", 401);
    const url = new URL(this.baseURL + "/realtime");
    if (!["https:", "http:"].includes(url.protocol)) throw new TypeError("Use an HTTP(S) base URL.");
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("model", "voxtral-mini-4b-realtime");
    return { url: url.toString(), headers: { Authorization: "Bearer " + this.apiKey } };
  }

  async models(signal?: AbortSignal): Promise<ModelList> {
    return (await this.send("/models", { signal })).json() as Promise<ModelList>;
  }

  async complete(body: CompletionRequest, options: CompletionOptions = {}): Promise<Completion> {
    const response = await this.create({ ...body, stream: false }, options);
    const data = (await response.json()) as Completion;
    options.onResponse?.(responseMetadata(response));
    return data;
  }

  async *stream(
    body: CompletionRequest,
    options: CompletionOptions & { includeUsage?: boolean } = {},
  ): AsyncGenerator<CompletionChunk> {
    const res = await this.create(
      { ...body, stream: true, stream_options: { include_usage: options.includeUsage ?? true } },
      options,
    );
    const metadata = responseMetadata(res);
    if (!res.body) throw new SonnelyError("Sonnely returned an empty stream.", 502, metadata);

    const reader = res.body.getReader();
    const decode = new TextDecoder();
    const events: string[] = [];
    const parser = createParser({ onEvent: ({ data }) => events.push(data) });

    try {
      options.onResponse?.(metadata);
      for (;;) {
        const { value, done } = await reader.read();
        parser.feed(decode.decode(value, { stream: !done }));

        for (const data of events.splice(0)) {
          if (data === "[DONE]") return;
          const chunk = JSON.parse(data) as CompletionChunk & ErrorEvent;
          if (chunk.error) {
            throw new SonnelyError(chunk.error.message ?? "Sonnely stream failed.", chunk.error.code ?? 502, metadata);
          }
          yield chunk;
        }

        if (done) throw new SonnelyError("The stream ended before Sonnely confirmed settlement.", 502, metadata);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

export type SpecializedEndpoint =
  | "responses" | "redact" | "embeddings" | "rerank" | "systemone"
  | "images/generations" | "images/edits" | "convert/file"
  | "audio/transcriptions" | "audio/translations" | "audio/speech";

export type InferenceResult<T> = { data: T; requestId: string | null };
export type InferenceOptions = { signal?: AbortSignal; idempotencyKey?: string };
