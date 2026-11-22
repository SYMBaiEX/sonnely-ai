import { createParser } from "eventsource-parser";

export type Provider = "near-ai" | "phala" | "tinfoil";
export type Message = { role: "system" | "user" | "assistant"; content: string };
export type CompletionRequest = {
  model: string;
  messages: Message[];
  max_tokens?: number;
  provider?: { only: [Provider] };
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
};

export type CompletionChunk = Omit<Completion, "choices" | "object" | "usage"> & {
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
      price_usd_per_million: { input: number; cache: number; output: number };
    }[];
  }[];
};

type Options = { receipt?: boolean; signal?: AbortSignal };
type ErrorEvent = { error?: { message?: string; code?: number } };

export class SonnelyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SonnelyError";
  }
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
      throw new SonnelyError(body?.error?.message ?? `Sonnely returned HTTP ${res.status}.`, res.status);
    }
    return res;
  }

  private create(body: object, { receipt, signal }: Options) {
    if (!this.apiKey) throw new SonnelyError("A Sonnely API key is required for completions.", 401);
    return this.send("/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
        ...(receipt ? { "X-Sonnely-Receipt": "v1" } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async models(signal?: AbortSignal): Promise<ModelList> {
    return (await this.send("/models", { signal })).json() as Promise<ModelList>;
  }

  async complete(body: CompletionRequest, options: Options = {}): Promise<Completion> {
    return (await this.create({ ...body, stream: false }, options)).json() as Promise<Completion>;
  }

  async *stream(
    body: CompletionRequest,
    options: Options & { includeUsage?: boolean } = {},
  ): AsyncGenerator<CompletionChunk> {
    const res = await this.create(
      { ...body, stream: true, stream_options: { include_usage: options.includeUsage ?? true } },
      options,
    );
    if (!res.body) throw new SonnelyError("Sonnely returned an empty stream.", 502);

    const reader = res.body.getReader();
    const decode = new TextDecoder();
    const events: string[] = [];
    const parser = createParser({ onEvent: ({ data }) => events.push(data) });

    try {
      for (;;) {
        const { value, done } = await reader.read();
        parser.feed(decode.decode(value, { stream: !done }));

        for (const data of events.splice(0)) {
          if (data === "[DONE]") return;
          const chunk = JSON.parse(data) as CompletionChunk & ErrorEvent;
          if (chunk.error) {
            throw new SonnelyError(chunk.error.message ?? "Sonnely stream failed.", chunk.error.code ?? 502);
          }
          yield chunk;
        }

        if (done) throw new SonnelyError("The stream ended before Sonnely confirmed settlement.", 502);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
