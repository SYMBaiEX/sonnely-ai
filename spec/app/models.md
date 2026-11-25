# Models

The model catalog the site shows: the provider models a workspace can call
through the gateway, the endpoints each is served on and what each route
charges, and the catalog browser a visitor filters it with.

## Domain

### Providers, privacy routes and endpoints

The gateway serves three providers, each reached over a privacy route: an
enclave it runs itself (`PrivateTee`), an enclave a third party runs
(`Private3pTee`), a blind proxy (`Incognito`), or a route whose privacy the
catalog does not claim (`Unclassified`). An `Endpoint` is one of the
OpenAI-compatible paths a route is served on.

```quint
type ProviderId = NearAI | Phala | Tinfoil

type PrivacyRoute = PrivateTee | Private3pTee | Incognito | Unclassified

type Endpoint =
  | ChatCompletions | Responses | Embeddings | Rerank | Systemone
  | ImagesGenerations | ImagesEdits
  | AudioTranscriptions | AudioTranslations | AudioSpeech
  | ConvertFile | Redact | Realtime
```

### Rates are upstream micro-dollars

A `Rate` is a charge in millionths of a US dollar: `Input`, `Cached` and
`Output` are per million tokens, `PerRequest` and `PerSession` per call. The
catalog keeps the provider's own rates; the site shows what Sonnely charges,
the upstream rate plus the gateway markup.

```quint
type RateUnit = Input | Cached | Output | PerRequest | PerSession
type Rate = { unit: RateUnit, micros: int }

type Route = { endpoint: Endpoint, modelId: str, rates: List[Rate] }

pure val markupPercent: int = 10

pure def markedUp(micros: int): int = micros * (100 + markupPercent) / 100
```

### A catalog entry is one provider model

`upstreamId` is the id the provider serves it under; `workload` names the
task classes the provider lists it for. `context` is the context length in
tokens, 0 when the provider does not publish one. A `summary`, `mark` and
`color` are set on featured models only. A model with no `routes` is listed
but cannot be called through the gateway.

```quint
type CatalogEntry = {
  provider: ProviderId,
  upstreamId: str,
  name: str,
  privacy: PrivacyRoute,
  context: int,
  workload: str,
  summary: str,
  mark: str,
  color: str,
  routes: List[Route],
}
```

### The catalog

Built from the provider model snapshot of 2026-11-23: every model each
provider lists, its chat route when the provider prices one, and the
specialized routes the gateway serves on it.

```quint
pure val catalog: List[CatalogEntry] = List(
    { provider: NearAI, upstreamId: "anthropic/claude-fable-5", name: "Claude Fable 5", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-fable-5-1", name: "Claude Fable 5.1", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-fable-5-2", name: "Claude Fable 5.2", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5", privacy: Incognito, context: 200000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-haiku-5-5", name: "Claude Haiku 5.5", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-opus-4-6", name: "Claude Opus 4.6", privacy: Incognito, context: 200000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-opus-4-7", name: "Claude Opus 4.7", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-opus-4-8", name: "Claude Opus 4.8", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-opus-5", name: "Claude Opus 5", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5", privacy: Incognito, context: 200000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "anthropic/claude-sonnet-5-5", name: "Claude Sonnet 5.5", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "black-forest-labs/FLUX.2-klein-4B", name: "FLUX.2-klein-4B", privacy: PrivateTee, context: 128000, workload: "image", summary: "", mark: "", color: "", routes: List({ endpoint: ImagesEdits, modelId: "black-forest-labs/FLUX.2-klein-4B", rates: List({ unit: PerRequest, micros: 12000 }) }, { endpoint: ImagesGenerations, modelId: "black-forest-labs/FLUX.2-klein-4B", rates: List({ unit: PerRequest, micros: 12000 }) }) },
    { provider: NearAI, upstreamId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", name: "DeepSeek V4.1 Flash", privacy: PrivateTee, context: 1048576, workload: "text", summary: "General-purpose reasoning and long document workflows.", mark: "D", color: "pearl", routes: List({ endpoint: ChatCompletions, modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", rates: List({ unit: Input, micros: 300000 }, { unit: Cached, micros: 6000 }, { unit: Output, micros: 1200000 }) }) },
    { provider: NearAI, upstreamId: "deepseek-ai/DeepSeek-V4.1-Flash-1017-abliterated", name: "DeepSeek V4.1 Flash 1017 Abliterated", privacy: PrivateTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017-abliterated", rates: List({ unit: Input, micros: 300000 }, { unit: Cached, micros: 6000 }, { unit: Output, micros: 1200000 }) }) },
    { provider: NearAI, upstreamId: "deepseek/deepseek-v3.2", name: "deepseek-v3.2", privacy: Private3pTee, context: 128000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", privacy: Incognito, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "deepseek/deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash 1017", privacy: Incognito, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", privacy: Incognito, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", privacy: Incognito, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "levanto/sage-2", name: "Levanto Sage 2", privacy: PrivateTee, context: 32768, workload: "decisions", summary: "", mark: "", color: "", routes: List({ endpoint: Systemone, modelId: "levanto/sage-2", rates: List({ unit: Input, micros: 70000 }, { unit: Output, micros: 2000000 }) }) },
    { provider: NearAI, upstreamId: "moonshotai/kimi-k2.6", name: "Kimi K2.6", privacy: Private3pTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "moonshotai/kimi-k3", name: "Kimi K3", privacy: Private3pTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "moonshotai/kimi-k3.1-pro", name: "Kimi K3.1 Pro", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-4.1", name: "OpenAI GPT-4.1", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-4.1-mini", name: "OpenAI GPT-4.1 Mini", privacy: Incognito, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5", name: "OpenAI GPT-5", privacy: Incognito, context: 400000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5.1", name: "GPT-5.1", privacy: Incognito, context: 400000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5.2", name: "OpenAI GPT-5.2", privacy: Incognito, context: 400000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5.4", name: "GPT-5.4", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini", privacy: Incognito, context: 400000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano", privacy: Incognito, context: 400000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5.5", name: "GPT-5.5", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5-mini", name: "GPT-5 Mini", privacy: Incognito, context: 400000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-5-nano", name: "GPT-5 Nano", privacy: Incognito, context: 400000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-6.2-astra", name: "GPT-6.2 Astra", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-6.2-sol", name: "GPT-6.2 Sol", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-6-astra", name: "GPT-6 Astra", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-6-luna", name: "GPT-6 Luna", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/gpt-6-sol", name: "GPT-6 Sol", privacy: Incognito, context: 1050000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/o3", name: "OpenAI o3", privacy: Incognito, context: 200000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/o3-mini", name: "o3 Mini", privacy: Incognito, context: 200000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/o4-mini", name: "OpenAI o4 Mini", privacy: Incognito, context: 200000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/privacy-filter", name: "Privacy Filter", privacy: PrivateTee, context: 128000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "openai/whisper-large-v3", name: "Whisper Large v3", privacy: PrivateTee, context: 448, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "Qwen/Qwen3.6-35B-A3B-FP8", name: "Qwen 3.6 35B", privacy: PrivateTee, context: 262144, workload: "text", summary: "Code explanation, structured output and multilingual text.", mark: "Q", color: "smoke", routes: List({ endpoint: ChatCompletions, modelId: "Qwen/Qwen3.6-35B-A3B-FP8", rates: List({ unit: Input, micros: 170000 }, { unit: Cached, micros: 56000 }, { unit: Output, micros: 1100000 }) }) },
    { provider: NearAI, upstreamId: "Qwen/Qwen3.8-27B", name: "Qwen 3.8 27B", privacy: PrivateTee, context: 262144, workload: "text", summary: "Long-context reasoning, coding, and text analysis.", mark: "Q", color: "pearl", routes: List({ endpoint: ChatCompletions, modelId: "Qwen/Qwen3.8-27B", rates: List({ unit: Input, micros: 40000 }, { unit: Cached, micros: 18000 }, { unit: Output, micros: 1350000 }) }) },
    { provider: NearAI, upstreamId: "Qwen/Qwen3.8-27B-abliterated", name: "Qwen 3.8 27B Abliterated", privacy: PrivateTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "Qwen/Qwen3.8-27B-abliterated", rates: List({ unit: Input, micros: 40000 }, { unit: Cached, micros: 18000 }, { unit: Output, micros: 1350000 }) }) },
    { provider: NearAI, upstreamId: "Qwen/Qwen3-Embedding-0.6B", name: "Qwen3-Embedding-0.6B", privacy: PrivateTee, context: 32768, workload: "embedding", summary: "", mark: "", color: "", routes: List({ endpoint: Embeddings, modelId: "Qwen/Qwen3-Embedding-0.6B", rates: List({ unit: Input, micros: 10000 }) }) },
    { provider: NearAI, upstreamId: "Qwen/Qwen3-Reranker-0.6B", name: "Qwen3-Reranker-0.6B", privacy: PrivateTee, context: 40960, workload: "reranking", summary: "", mark: "", color: "", routes: List({ endpoint: Rerank, modelId: "Qwen/Qwen3-Reranker-0.6B", rates: List({ unit: Input, micros: 10000 }) }) },
    { provider: NearAI, upstreamId: "Qwen/Qwen3-VL-30B-A3B-Instruct", name: "Qwen3 VL 30B Instruct", privacy: PrivateTee, context: 16384, workload: "text", summary: "Instruction following and document analysis through Sonnely’s text endpoint.", mark: "Q", color: "smoke", routes: List({ endpoint: ChatCompletions, modelId: "Qwen/Qwen3-VL-30B-A3B-Instruct", rates: List({ unit: Input, micros: 150000 }, { unit: Cached, micros: 30000 }, { unit: Output, micros: 550000 }) }) },
    { provider: NearAI, upstreamId: "typesafe/jev-1.13", name: "Jev 1.13", privacy: Incognito, context: 32000, workload: "decisions", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "x-ai/grok-4.6", name: "Grok 4.6", privacy: Incognito, context: 500000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "x-ai/grok-4.7", name: "Grok 4.7", privacy: Incognito, context: 500000, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "z-ai/glm-5.3", name: "GLM 5.3", privacy: Private3pTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: NearAI, upstreamId: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash", privacy: PrivateTee, context: 1048576, workload: "text", summary: "Fast classification, extraction and short replies.", mark: "G", color: "signal-mark", routes: List({ endpoint: ChatCompletions, modelId: "z-ai/glm-5.3-flash", rates: List({ unit: Input, micros: 80000 }, { unit: Cached, micros: 12000 }, { unit: Output, micros: 500000 }) }) },
    { provider: Phala, upstreamId: "deepseek/deepseek-v4-flash-0731", name: "DeepSeek: DeepSeek V4 Flash 0731", privacy: PrivateTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "phala/deepseek-v4.1-flash-1017-uncensored", name: "Phala: DeepSeek V4.1 Flash 1017 Uncensored", privacy: PrivateTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "phala/deepseek-v4.1-flash-1017-uncensored", rates: List({ unit: Input, micros: 300000 }, { unit: Cached, micros: 6000 }, { unit: Output, micros: 1200000 }) }) },
    { provider: Phala, upstreamId: "moonshotai/kimi-k3.1-pro", name: "MoonshotAI: Kimi K3.1 Pro", privacy: PrivateTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "phala/moonshotai/kimi-k3.1-pro", rates: List({ unit: Input, micros: 2000000 }, { unit: Cached, micros: 200000 }, { unit: Output, micros: 10000000 }) }) },
    { provider: Phala, upstreamId: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 klein 4B", privacy: PrivateTee, context: 4096, workload: "image", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "z-ai/glm-5.3-flash", name: "Z.ai: GLM 5.3 Flash", privacy: PrivateTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "openai/whisper-large-v3", name: "Whisper Large v3", privacy: PrivateTee, context: 4096, workload: "transcription", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "mistralai/voxtral-small-24b-2507", name: "Voxtral Small 24B", privacy: PrivateTee, context: 4096, workload: "transcription", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "meta-llama/llama-3.3-70b-instruct", name: "Meta: Llama 3.3 70B Instruct", privacy: PrivateTee, context: 131072, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", privacy: PrivateTee, context: 1000000, workload: "text", summary: "Long-context reasoning, coding, and text analysis.", mark: "Q", color: "pearl", routes: List({ endpoint: ChatCompletions, modelId: "Qwen/Qwen3.8-27B", rates: List({ unit: Input, micros: 200000 }, { unit: Cached, micros: 50000 }, { unit: Output, micros: 2500000 }) }) },
    { provider: Phala, upstreamId: "z-ai/glm-5.2", name: "Z.ai: GLM 5.2", privacy: PrivateTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen3.5-27b", name: "Qwen: Qwen3.5-27B", privacy: PrivateTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen3.5-397b-a17b", name: "Qwen: Qwen3.5 397B A17B", privacy: PrivateTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen-2.5-7b-instruct", name: "Qwen2.5 7B Instruct", privacy: PrivateTee, context: 32768, workload: "text", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "phala/qwen/qwen-2.5-7b-instruct", rates: List({ unit: Input, micros: 100000 }, { unit: Cached, micros: 100000 }, { unit: Output, micros: 200000 }) }) },
    { provider: Phala, upstreamId: "deepseek/deepseek-v3.2", name: "DeepSeek: DeepSeek V3.2", privacy: PrivateTee, context: 163840, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "deepseek/deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash", privacy: PrivateTee, context: 1048576, workload: "text", summary: "General-purpose reasoning and long document workflows.", mark: "D", color: "pearl", routes: List({ endpoint: ChatCompletions, modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", rates: List({ unit: Input, micros: 300000 }, { unit: Cached, micros: 6000 }, { unit: Output, micros: 1200000 }) }) },
    { provider: Phala, upstreamId: "google/gemma-4-31b-it", name: "Google: Gemma 4 31B", privacy: PrivateTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen3.6-27b", name: "Qwen: Qwen3.6 27B", privacy: PrivateTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "z-ai/glm-5.3", name: "Z.ai: GLM 5.3", privacy: PrivateTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "jaredpalmer/kev-4b", name: "Jared Palmer: Kev 4B", privacy: PrivateTee, context: 8192, workload: "decisions", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "openai/gpt-oss-120b", name: "OpenAI: GPT OSS 120B", privacy: PrivateTee, context: 131072, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "paddlepaddle/paddleocr-vl-1.6", name: "PaddlePaddle: PaddleOCR-VL 1.6", privacy: PrivateTee, context: 8192, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "moonshotai/kimi-k2.6", name: "MoonshotAI: Kimi K2.6", privacy: PrivateTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen3-asr-1.7b", name: "Qwen: Qwen3 ASR 1.7B", privacy: PrivateTee, context: 4096, workload: "transcription", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen3.6-35b-a3b", name: "Qwen: Qwen3.6 35B A3B", privacy: PrivateTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen3-asr-0.6b", name: "Qwen: Qwen3 ASR 0.6B", privacy: PrivateTee, context: 4096, workload: "transcription", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "z-ai/glm-5.1", name: "Z.ai: GLM 5.1", privacy: PrivateTee, context: 202752, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "qwen/qwen3-vl-30b-a3b-instruct", name: "Qwen: Qwen3 VL 30B A3B Instruct", privacy: PrivateTee, context: 16384, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "phala/qwen3.8-27b-uncensored", name: "Phala: Qwen3.8 27B Uncensored", privacy: PrivateTee, context: 1000000, workload: "text", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "phala/qwen3.8-27b-uncensored", rates: List({ unit: Input, micros: 300000 }, { unit: Cached, micros: 50000 }, { unit: Output, micros: 1500000 }) }) },
    { provider: Phala, upstreamId: "phala/gemma-4-26b-a4b-uncensored", name: "Phala: Gemma-4 26B-A4B Uncensored (Heretic)", privacy: PrivateTee, context: 262144, workload: "text", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "phala/gemma-4-26b-a4b-uncensored", rates: List({ unit: Input, micros: 150000 }, { unit: Cached, micros: 50000 }, { unit: Output, micros: 700000 }) }) },
    { provider: Phala, upstreamId: "moonshotai/kimi-k3", name: "MoonshotAI: Kimi K3", privacy: PrivateTee, context: 1048576, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "ath-maas/ovisocr3", name: "ATH-MaaS: OvisOCR3", privacy: PrivateTee, context: 8192, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "z-ai/glm-ocr", name: "Z.ai: GLM-OCR", privacy: PrivateTee, context: 8192, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Phala, upstreamId: "xiaomi/xiaomi-ocr-0", name: "Xiaomi: Xiaomi-OCR-0", privacy: PrivateTee, context: 8192, workload: "text", summary: "", mark: "", color: "", routes: List() },
    { provider: Tinfoil, upstreamId: "deepseek-v4-1-flash", name: "DeepSeek V4.1 Flash", privacy: PrivateTee, context: 1048576, workload: "chat/completions, responses", summary: "General-purpose reasoning and long document workflows.", mark: "D", color: "pearl", routes: List({ endpoint: ChatCompletions, modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", rates: List({ unit: Input, micros: 600000 }, { unit: Cached, micros: 10000 }, { unit: Output, micros: 1450000 }) }, { endpoint: Responses, modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", rates: List({ unit: Input, micros: 600000 }, { unit: Output, micros: 1450000 }) }) },
    { provider: Tinfoil, upstreamId: "glm-5-3", name: "GLM-5.3", privacy: PrivateTee, context: 1048576, workload: "chat/completions, responses", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "z-ai/glm-5.3", rates: List({ unit: Input, micros: 1800000 }, { unit: Cached, micros: 450000 }, { unit: Output, micros: 5750000 }) }, { endpoint: Responses, modelId: "z-ai/glm-5.3", rates: List({ unit: Input, micros: 1800000 }, { unit: Output, micros: 5750000 }) }) },
    { provider: Tinfoil, upstreamId: "inkling-2-small", name: "Inkling 2 Small", privacy: PrivateTee, context: 524288, workload: "chat/completions, responses", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "tinfoil/inkling-2-small", rates: List({ unit: Input, micros: 300000 }, { unit: Cached, micros: 30000 }, { unit: Output, micros: 1000000 }) }, { endpoint: Responses, modelId: "tinfoil/inkling-2-small", rates: List({ unit: Input, micros: 300000 }, { unit: Output, micros: 1000000 }) }) },
    { provider: Tinfoil, upstreamId: "kimi-k3-1-pro", name: "Kimi K3.1 Pro", privacy: PrivateTee, context: 262144, workload: "chat/completions, responses", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "tinfoil/kimi-k3-1-pro", rates: List({ unit: Input, micros: 4000000 }, { unit: Cached, micros: 400000 }, { unit: Output, micros: 20000000 }) }, { endpoint: Responses, modelId: "tinfoil/kimi-k3-1-pro", rates: List({ unit: Input, micros: 4000000 }, { unit: Output, micros: 20000000 }) }) },
    { provider: Tinfoil, upstreamId: "llama3-3-70b", name: "Llama 3.3 70B", privacy: PrivateTee, context: 131072, workload: "chat/completions", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "tinfoil/llama3-3-70b", rates: List({ unit: Input, micros: 1750000 }, { unit: Cached, micros: 1750000 }, { unit: Output, micros: 2750000 }) }) },
    { provider: Tinfoil, upstreamId: "gemma4-31b", name: "Gemma 4 31B", privacy: PrivateTee, context: 262144, workload: "chat/completions, responses", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "tinfoil/gemma4-31b", rates: List({ unit: Input, micros: 400000 }, { unit: Cached, micros: 400000 }, { unit: Output, micros: 1000000 }) }, { endpoint: Responses, modelId: "tinfoil/gemma4-31b", rates: List({ unit: Input, micros: 400000 }, { unit: Output, micros: 1000000 }) }) },
    { provider: Tinfoil, upstreamId: "gpt-oss-120b", name: "GPT-OSS 120B", privacy: PrivateTee, context: 131072, workload: "chat/completions, responses", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "tinfoil/gpt-oss-120b", rates: List({ unit: Input, micros: 150000 }, { unit: Cached, micros: 150000 }, { unit: Output, micros: 600000 }) }, { endpoint: Responses, modelId: "tinfoil/gpt-oss-120b", rates: List({ unit: Input, micros: 150000 }, { unit: Output, micros: 600000 }) }) },
    { provider: Tinfoil, upstreamId: "gpt-oss-safeguard-120b", name: "GPT-OSS Safeguard 120B", privacy: PrivateTee, context: 131072, workload: "chat/completions, responses", summary: "", mark: "", color: "", routes: List({ endpoint: ChatCompletions, modelId: "tinfoil/gpt-oss-safeguard-120b", rates: List({ unit: Input, micros: 150000 }, { unit: Cached, micros: 150000 }, { unit: Output, micros: 600000 }) }) },
    { provider: Tinfoil, upstreamId: "pii-filter", name: "Privacy Filter", privacy: PrivateTee, context: 80000, workload: "/redact", summary: "", mark: "", color: "", routes: List({ endpoint: Redact, modelId: "pii-filter", rates: List({ unit: Input, micros: 800000 }, { unit: PerRequest, micros: 200 }) }) },
    { provider: Tinfoil, upstreamId: "nomic-embed-text", name: "Nomic Embed Text", privacy: PrivateTee, context: 8192, workload: "embeddings", summary: "", mark: "", color: "", routes: List({ endpoint: Embeddings, modelId: "nomic-embed-text", rates: List({ unit: Input, micros: 16000 }) }) },
    { provider: Tinfoil, upstreamId: "doc-upload", name: "Private Document Processing", privacy: PrivateTee, context: 0, workload: "convert/file", summary: "", mark: "", color: "", routes: List({ endpoint: ConvertFile, modelId: "doc-upload", rates: List({ unit: PerRequest, micros: 50000 }) }) },
    { provider: Tinfoil, upstreamId: "voxtral-small-24b", name: "Voxtral Small 24B", privacy: PrivateTee, context: 32768, workload: "audio/transcriptions, audio/translations, chat/completions", summary: "", mark: "", color: "", routes: List({ endpoint: AudioTranslations, modelId: "voxtral-small-24b", rates: List({ unit: PerRequest, micros: 2500 }) }) },
    { provider: Tinfoil, upstreamId: "websearch", name: "Private Web Search", privacy: PrivateTee, context: 0, workload: "chat/completions, responses", summary: "", mark: "", color: "", routes: List() },
    { provider: Tinfoil, upstreamId: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo", privacy: PrivateTee, context: 0, workload: "audio/transcriptions", summary: "", mark: "", color: "", routes: List({ endpoint: AudioTranscriptions, modelId: "whisper-large-v3-turbo", rates: List({ unit: PerRequest, micros: 10000 }) }) },
    { provider: Tinfoil, upstreamId: "qwen3-tts", name: "Qwen3-TTS 1.7B", privacy: PrivateTee, context: 0, workload: "audio/speech", summary: "", mark: "", color: "", routes: List() },
    { provider: Tinfoil, upstreamId: "voxtral-tts", name: "Voxtral TTS", privacy: PrivateTee, context: 0, workload: "audio/speech", summary: "", mark: "", color: "", routes: List({ endpoint: AudioSpeech, modelId: "voxtral-tts", rates: List({ unit: PerRequest, micros: 2000 }) }) },
    { provider: Tinfoil, upstreamId: "voxtral-mini-4b-realtime", name: "Voxtral Mini 4B Realtime", privacy: PrivateTee, context: 0, workload: "realtime", summary: "", mark: "", color: "", routes: List({ endpoint: Realtime, modelId: "voxtral-mini-4b-realtime", rates: List({ unit: PerSession, micros: 2000 }) }) },
    { provider: Tinfoil, upstreamId: "decision-large", name: "Decision Large", privacy: PrivateTee, context: 32768, workload: "decisions", summary: "", mark: "", color: "", routes: List() },
    { provider: Tinfoil, upstreamId: "decision-medium", name: "Decision Medium", privacy: PrivateTee, context: 32768, workload: "decisions", summary: "", mark: "", color: "", routes: List() },
    { provider: Tinfoil, upstreamId: "decision-small", name: "Decision Small", privacy: PrivateTee, context: 32768, workload: "decisions", summary: "", mark: "", color: "", routes: List() },
  )
```

## Story: Filter the catalog

> As a visitor, I want to search, filter and sort the catalog, so that I can
> find the model that fits my workload and budget.

### The catalog opens unfiltered

A `ProviderChoice` narrows to one provider or keeps them all, a
`WorkloadChoice` to models served on one endpoint, `Availability` to the
models that can be called, and `Sort` orders the list.

```quint
type ProviderChoice = EveryProvider | Only({ provider: ProviderId })
type WorkloadChoice = EveryWorkload | OnEndpoint({ endpoint: Endpoint })
type Availability = AnyAvailability | Available | CatalogOnly
type Sort = AvailableFirst | ByName | ByInputRate | ByOutputRate

type CatalogFilter = {
  query: str,
  provider: ProviderChoice,
  workload: WorkloadChoice,
  availability: Availability,
  sort: Sort,
}

pure val initial: CatalogFilter = {
  query: "",
  provider: EveryProvider,
  workload: EveryWorkload,
  availability: AnyAvailability,
  sort: AvailableFirst,
}
```

### Typing a search keeps every other choice

```quint
pure def search(f: CatalogFilter, query: str): CatalogFilter = { ...f, query: query }
```

### Choosing a provider keeps every other choice

```quint
pure def chooseProvider(f: CatalogFilter, provider: ProviderChoice): CatalogFilter = { ...f, provider: provider }
```

### Choosing a workload keeps every other choice

```quint
pure def chooseWorkload(f: CatalogFilter, workload: WorkloadChoice): CatalogFilter = { ...f, workload: workload }
```

### Choosing availability keeps every other choice

```quint
pure def chooseAvailability(f: CatalogFilter, availability: Availability): CatalogFilter = { ...f, availability: availability }
```

### Choosing a sort keeps every other choice

```quint
pure def chooseSort(f: CatalogFilter, sort: Sort): CatalogFilter = { ...f, sort: sort }
```

### Each choice moves only its own field

```quint
pure def stepOnlyItsFieldMoves(before: CatalogFilter, via: str, after: CatalogFilter): bool =
  and {
    via != "search" or after == { ...before, query: after.query },
    via != "chooseProvider" or after == { ...before, provider: after.provider },
    via != "chooseWorkload" or after == { ...before, workload: after.workload },
    via != "chooseAvailability" or after == { ...before, availability: after.availability },
    via != "chooseSort" or after == { ...before, sort: after.sort },
  }
```

### A filter can be narrowed

```quint
pure def sometimesNarrowed(f: CatalogFilter): bool = f != initial
```

### The markup never lowers a positive rate

```quint
pure def lawMarkupNeverLowers(micros: int): bool = micros <= 0 or markedUp(micros) >= micros
```

```quint
pure val queryValues = Set("", "deepseek", "qwen", "embed")

pure val providerValues = Set(
  EveryProvider, Only({ provider: NearAI }), Only({ provider: Phala }), Only({ provider: Tinfoil }),
)

pure val workloadValues = Set(
  EveryWorkload, OnEndpoint({ endpoint: ChatCompletions }), OnEndpoint({ endpoint: Embeddings }),
)

pure val availabilityValues = Set(AnyAvailability, Available, CatalogOnly)

pure val sortValues = Set(AvailableFirst, ByName, ByInputRate, ByOutputRate)

pure val microsValues = Set(0, 100, 2500, 5500000)
```
