# Catalog

The models the console lists in its browser and offers in the playground:
the providers' upstream inventories with the Sonnely endpoints each model
is routed on and the marked-up rates the workspace pays. Rates are
micro-USD per million tokens (`input`, `cache`, `output`) or per request or
session (`request`, `session`); a rate of -1 means the route is not billed
that way. The markup is the platform's ten percent.

This module is a contract, not a machine: it holds the catalog rows and the
lookups other console modules use, verified as data.

## Domain

### A route is one endpoint, one routed model id and its rates

The chat route's `modelId` is the id clients send to the gateway.

```quint
type ModelRoute = {
  endpoint: str,
  modelId: str,
  input: int,
  cache: int,
  output: int,
  request: int,
  session: int,
}
```

### A catalog row is a provider model and the routes it is served on

`upstreamId` is the id the provider lists; `route` is its privacy route;
`context` is the context window in tokens (0 when the provider does not
say); `workload` is the provider's workload label; `mark` is the letter the
model's badge shows.

```quint
type CatalogModel = {
  provider: str,
  upstreamId: str,
  name: str,
  route: str,
  context: int,
  workload: str,
  summary: str,
  mark: str,
  routes: List[ModelRoute],
}
```

## Story: Browse the catalog

> As a user, I want to see every model Sonnely can route with its context,
> workload and marked-up rates, so that I can pick one for my workload.

### The catalog lists the providers' models verbatim

```quint
pure val nearA: List[CatalogModel] = List(
    { provider: "near-ai", upstreamId: "anthropic/claude-fable-5", name: "Claude Fable 5", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-fable-5-1", name: "Claude Fable 5.1", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-fable-5-2", name: "Claude Fable 5.2", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5", route: "incognito", context: 200000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-haiku-5-5", name: "Claude Haiku 5.5", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-opus-4-6", name: "Claude Opus 4.6", route: "incognito", context: 200000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-opus-4-7", name: "Claude Opus 4.7", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-opus-4-8", name: "Claude Opus 4.8", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-opus-5", name: "Claude Opus 5", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5", route: "incognito", context: 200000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "anthropic/claude-sonnet-5-5", name: "Claude Sonnet 5.5", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "C", routes: List() },
    { provider: "near-ai", upstreamId: "black-forest-labs/FLUX.2-klein-4B", name: "FLUX.2-klein-4B", route: "private-tee", context: 128000, workload: "image", summary: "", mark: "F", routes: List({ endpoint: "images/edits", modelId: "black-forest-labs/FLUX.2-klein-4B", input: -1, cache: -1, output: -1, request: 13200, session: -1 }, { endpoint: "images/generations", modelId: "black-forest-labs/FLUX.2-klein-4B", input: -1, cache: -1, output: -1, request: 13200, session: -1 }) },
    { provider: "near-ai", upstreamId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", name: "DeepSeek V4.1 Flash", route: "private-tee", context: 1048576, workload: "text", summary: "General-purpose reasoning and long document workflows.", mark: "D", routes: List({ endpoint: "chat/completions", modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", input: 330000, cache: 6600, output: 1320000, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "deepseek-ai/DeepSeek-V4.1-Flash-1017-abliterated", name: "DeepSeek V4.1 Flash 1017 Abliterated", route: "private-tee", context: 1048576, workload: "text", summary: "", mark: "D", routes: List({ endpoint: "chat/completions", modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017-abliterated", input: 330000, cache: 6600, output: 1320000, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "deepseek/deepseek-v3.2", name: "deepseek-v3.2", route: "private-3p-tee", context: 128000, workload: "text", summary: "", mark: "D", routes: List() },
    { provider: "near-ai", upstreamId: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", route: "incognito", context: 1048576, workload: "text", summary: "", mark: "D", routes: List() },
    { provider: "near-ai", upstreamId: "deepseek/deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash 1017", route: "incognito", context: 1048576, workload: "text", summary: "", mark: "D", routes: List() },
    { provider: "near-ai", upstreamId: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", route: "incognito", context: 1048576, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", route: "incognito", context: 1048576, workload: "text", summary: "", mark: "G", routes: List() },
  )

pure val nearB: List[CatalogModel] = List(
    { provider: "near-ai", upstreamId: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "levanto/sage-2", name: "Levanto Sage 2", route: "private-tee", context: 32768, workload: "decisions", summary: "", mark: "L", routes: List({ endpoint: "systemone", modelId: "levanto/sage-2", input: 77000, cache: -1, output: 2200000, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "moonshotai/kimi-k2.6", name: "Kimi K2.6", route: "private-3p-tee", context: 262144, workload: "text", summary: "", mark: "K", routes: List() },
    { provider: "near-ai", upstreamId: "moonshotai/kimi-k3", name: "Kimi K3", route: "private-3p-tee", context: 1048576, workload: "text", summary: "", mark: "K", routes: List() },
    { provider: "near-ai", upstreamId: "moonshotai/kimi-k3.1-pro", name: "Kimi K3.1 Pro", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "K", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-4.1", name: "OpenAI GPT-4.1", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "O", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-4.1-mini", name: "OpenAI GPT-4.1 Mini", route: "incognito", context: 1000000, workload: "text", summary: "", mark: "O", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5", name: "OpenAI GPT-5", route: "incognito", context: 400000, workload: "text", summary: "", mark: "O", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5.1", name: "GPT-5.1", route: "incognito", context: 400000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5.2", name: "OpenAI GPT-5.2", route: "incognito", context: 400000, workload: "text", summary: "", mark: "O", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5.4", name: "GPT-5.4", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini", route: "incognito", context: 400000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano", route: "incognito", context: 400000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5.5", name: "GPT-5.5", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5-mini", name: "GPT-5 Mini", route: "incognito", context: 400000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-5-nano", name: "GPT-5 Nano", route: "incognito", context: 400000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-6.2-astra", name: "GPT-6.2 Astra", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-6.2-sol", name: "GPT-6.2 Sol", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-6-astra", name: "GPT-6 Astra", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/gpt-6-luna", name: "GPT-6 Luna", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
  )

pure val nearC: List[CatalogModel] = List(
    { provider: "near-ai", upstreamId: "openai/gpt-6-sol", name: "GPT-6 Sol", route: "incognito", context: 1050000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "openai/o3", name: "OpenAI o3", route: "incognito", context: 200000, workload: "text", summary: "", mark: "O", routes: List() },
    { provider: "near-ai", upstreamId: "openai/o3-mini", name: "o3 Mini", route: "incognito", context: 200000, workload: "text", summary: "", mark: "O", routes: List() },
    { provider: "near-ai", upstreamId: "openai/o4-mini", name: "OpenAI o4 Mini", route: "incognito", context: 200000, workload: "text", summary: "", mark: "O", routes: List() },
    { provider: "near-ai", upstreamId: "openai/privacy-filter", name: "Privacy Filter", route: "private-tee", context: 128000, workload: "text", summary: "", mark: "P", routes: List() },
    { provider: "near-ai", upstreamId: "openai/whisper-large-v3", name: "Whisper Large v3", route: "private-tee", context: 448, workload: "text", summary: "", mark: "W", routes: List() },
    { provider: "near-ai", upstreamId: "Qwen/Qwen3.6-35B-A3B-FP8", name: "Qwen 3.6 35B", route: "private-tee", context: 262144, workload: "text", summary: "Code explanation, structured output and multilingual text.", mark: "Q", routes: List({ endpoint: "chat/completions", modelId: "Qwen/Qwen3.6-35B-A3B-FP8", input: 187000, cache: 61600, output: 1210000, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "Qwen/Qwen3.8-27B", name: "Qwen 3.8 27B", route: "private-tee", context: 262144, workload: "text", summary: "Long-context reasoning, coding, and text analysis.", mark: "Q", routes: List({ endpoint: "chat/completions", modelId: "Qwen/Qwen3.8-27B", input: 44000, cache: 19800, output: 1485000, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "Qwen/Qwen3.8-27B-abliterated", name: "Qwen 3.8 27B Abliterated", route: "private-tee", context: 262144, workload: "text", summary: "", mark: "Q", routes: List({ endpoint: "chat/completions", modelId: "Qwen/Qwen3.8-27B-abliterated", input: 44000, cache: 19800, output: 1485000, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "Qwen/Qwen3-Embedding-0.6B", name: "Qwen3-Embedding-0.6B", route: "private-tee", context: 32768, workload: "embedding", summary: "", mark: "Q", routes: List({ endpoint: "embeddings", modelId: "Qwen/Qwen3-Embedding-0.6B", input: 11000, cache: -1, output: -1, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "Qwen/Qwen3-Reranker-0.6B", name: "Qwen3-Reranker-0.6B", route: "private-tee", context: 40960, workload: "reranking", summary: "", mark: "Q", routes: List({ endpoint: "rerank", modelId: "Qwen/Qwen3-Reranker-0.6B", input: 11000, cache: -1, output: -1, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "Qwen/Qwen3-VL-30B-A3B-Instruct", name: "Qwen3 VL 30B Instruct", route: "private-tee", context: 16384, workload: "text", summary: "Instruction following and document analysis through Sonnely’s text endpoint.", mark: "Q", routes: List({ endpoint: "chat/completions", modelId: "Qwen/Qwen3-VL-30B-A3B-Instruct", input: 165000, cache: 33000, output: 605000, request: -1, session: -1 }) },
    { provider: "near-ai", upstreamId: "typesafe/jev-1.13", name: "Jev 1.13", route: "incognito", context: 32000, workload: "decisions", summary: "", mark: "J", routes: List() },
    { provider: "near-ai", upstreamId: "x-ai/grok-4.6", name: "Grok 4.6", route: "incognito", context: 500000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "x-ai/grok-4.7", name: "Grok 4.7", route: "incognito", context: 500000, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "z-ai/glm-5.3", name: "GLM 5.3", route: "private-3p-tee", context: 1048576, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "near-ai", upstreamId: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash", route: "private-tee", context: 1048576, workload: "text", summary: "Fast classification, extraction and short replies.", mark: "G", routes: List({ endpoint: "chat/completions", modelId: "z-ai/glm-5.3-flash", input: 88000, cache: 13200, output: 550000, request: -1, session: -1 }) },
  )

pure val phalaA: List[CatalogModel] = List(
    { provider: "phala", upstreamId: "deepseek/deepseek-v4-flash-0731", name: "DeepSeek: DeepSeek V4 Flash 0731", route: "private-tee", context: 1048576, workload: "text", summary: "", mark: "D", routes: List() },
    { provider: "phala", upstreamId: "phala/deepseek-v4.1-flash-1017-uncensored", name: "Phala: DeepSeek V4.1 Flash 1017 Uncensored", route: "private-tee", context: 1048576, workload: "text", summary: "", mark: "P", routes: List({ endpoint: "chat/completions", modelId: "phala/deepseek-v4.1-flash-1017-uncensored", input: 330000, cache: 6600, output: 1320000, request: -1, session: -1 }) },
    { provider: "phala", upstreamId: "moonshotai/kimi-k3.1-pro", name: "MoonshotAI: Kimi K3.1 Pro", route: "private-tee", context: 1048576, workload: "text", summary: "", mark: "M", routes: List({ endpoint: "chat/completions", modelId: "phala/moonshotai/kimi-k3.1-pro", input: 2200000, cache: 220000, output: 11000000, request: -1, session: -1 }) },
    { provider: "phala", upstreamId: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 klein 4B", route: "private-tee", context: 4096, workload: "image", summary: "", mark: "F", routes: List() },
    { provider: "phala", upstreamId: "z-ai/glm-5.3-flash", name: "Z.ai: GLM 5.3 Flash", route: "private-tee", context: 1048576, workload: "text", summary: "", mark: "Z", routes: List() },
    { provider: "phala", upstreamId: "openai/whisper-large-v3", name: "Whisper Large v3", route: "private-tee", context: 4096, workload: "transcription", summary: "", mark: "W", routes: List() },
    { provider: "phala", upstreamId: "mistralai/voxtral-small-24b-2507", name: "Voxtral Small 24B", route: "private-tee", context: 4096, workload: "transcription", summary: "", mark: "V", routes: List() },
    { provider: "phala", upstreamId: "meta-llama/llama-3.3-70b-instruct", name: "Meta: Llama 3.3 70B Instruct", route: "private-tee", context: 131072, workload: "text", summary: "", mark: "M", routes: List() },
    { provider: "phala", upstreamId: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", route: "private-tee", context: 1000000, workload: "text", summary: "Long-context reasoning, coding, and text analysis.", mark: "Q", routes: List({ endpoint: "chat/completions", modelId: "Qwen/Qwen3.8-27B", input: 220000, cache: 55000, output: 2750000, request: -1, session: -1 }) },
    { provider: "phala", upstreamId: "z-ai/glm-5.2", name: "Z.ai: GLM 5.2", route: "private-tee", context: 1048576, workload: "text", summary: "", mark: "Z", routes: List() },
    { provider: "phala", upstreamId: "qwen/qwen3.5-27b", name: "Qwen: Qwen3.5-27B", route: "private-tee", context: 262144, workload: "text", summary: "", mark: "Q", routes: List() },
    { provider: "phala", upstreamId: "qwen/qwen3.5-397b-a17b", name: "Qwen: Qwen3.5 397B A17B", route: "private-tee", context: 262144, workload: "text", summary: "", mark: "Q", routes: List() },
    { provider: "phala", upstreamId: "qwen/qwen-2.5-7b-instruct", name: "Qwen2.5 7B Instruct", route: "private-tee", context: 32768, workload: "text", summary: "", mark: "Q", routes: List({ endpoint: "chat/completions", modelId: "phala/qwen/qwen-2.5-7b-instruct", input: 110000, cache: 110000, output: 220000, request: -1, session: -1 }) },
    { provider: "phala", upstreamId: "deepseek/deepseek-v3.2", name: "DeepSeek: DeepSeek V3.2", route: "private-tee", context: 163840, workload: "text", summary: "", mark: "D", routes: List() },
    { provider: "phala", upstreamId: "deepseek/deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash", route: "private-tee", context: 1048576, workload: "text", summary: "General-purpose reasoning and long document workflows.", mark: "D", routes: List({ endpoint: "chat/completions", modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", input: 330000, cache: 6600, output: 1320000, request: -1, session: -1 }) },
    { provider: "phala", upstreamId: "google/gemma-4-31b-it", name: "Google: Gemma 4 31B", route: "private-tee", context: 262144, workload: "text", summary: "", mark: "G", routes: List() },
    { provider: "phala", upstreamId: "qwen/qwen3.6-27b", name: "Qwen: Qwen3.6 27B", route: "private-tee", context: 262144, workload: "text", summary: "", mark: "Q", routes: List() },
    { provider: "phala", upstreamId: "z-ai/glm-5.3", name: "Z.ai: GLM 5.3", route: "private-tee", context: 1048576, workload: "text", summary: "", mark: "Z", routes: List() },
    { provider: "phala", upstreamId: "jaredpalmer/kev-4b", name: "Jared Palmer: Kev 4B", route: "private-tee", context: 8192, workload: "decisions", summary: "", mark: "J", routes: List() },
    { provider: "phala", upstreamId: "openai/gpt-oss-120b", name: "OpenAI: GPT OSS 120B", route: "private-tee", context: 131072, workload: "text", summary: "", mark: "O", routes: List() },
    { provider: "phala", upstreamId: "paddlepaddle/paddleocr-vl-1.6", name: "PaddlePaddle: PaddleOCR-VL 1.6", route: "private-tee", context: 8192, workload: "text", summary: "", mark: "P", routes: List() },
    { provider: "phala", upstreamId: "moonshotai/kimi-k2.6", name: "MoonshotAI: Kimi K2.6", route: "private-tee", context: 262144, workload: "text", summary: "", mark: "M", routes: List() },
    { provider: "phala", upstreamId: "qwen/qwen3-asr-1.7b", name: "Qwen: Qwen3 ASR 1.7B", route: "private-tee", context: 4096, workload: "transcription", summary: "", mark: "Q", routes: List() },
    { provider: "phala", upstreamId: "qwen/qwen3.6-35b-a3b", name: "Qwen: Qwen3.6 35B A3B", route: "private-tee", context: 262144, workload: "text", summary: "", mark: "Q", routes: List() },
  )

pure val phalaB: List[CatalogModel] = List(
    { provider: "phala", upstreamId: "qwen/qwen3-asr-0.6b", name: "Qwen: Qwen3 ASR 0.6B", route: "private-tee", context: 4096, workload: "transcription", summary: "", mark: "Q", routes: List() },
    { provider: "phala", upstreamId: "z-ai/glm-5.1", name: "Z.ai: GLM 5.1", route: "private-tee", context: 202752, workload: "text", summary: "", mark: "Z", routes: List() },
    { provider: "phala", upstreamId: "qwen/qwen3-vl-30b-a3b-instruct", name: "Qwen: Qwen3 VL 30B A3B Instruct", route: "private-tee", context: 16384, workload: "text", summary: "", mark: "Q", routes: List() },
    { provider: "phala", upstreamId: "phala/qwen3.8-27b-uncensored", name: "Phala: Qwen3.8 27B Uncensored", route: "private-tee", context: 1000000, workload: "text", summary: "", mark: "P", routes: List({ endpoint: "chat/completions", modelId: "phala/qwen3.8-27b-uncensored", input: 330000, cache: 55000, output: 1650000, request: -1, session: -1 }) },
    { provider: "phala", upstreamId: "phala/gemma-4-26b-a4b-uncensored", name: "Phala: Gemma-4 26B-A4B Uncensored (Heretic)", route: "private-tee", context: 262144, workload: "text", summary: "", mark: "P", routes: List({ endpoint: "chat/completions", modelId: "phala/gemma-4-26b-a4b-uncensored", input: 165000, cache: 55000, output: 770000, request: -1, session: -1 }) },
    { provider: "phala", upstreamId: "moonshotai/kimi-k3", name: "MoonshotAI: Kimi K3", route: "private-tee", context: 1048576, workload: "text", summary: "", mark: "M", routes: List() },
    { provider: "phala", upstreamId: "ath-maas/ovisocr3", name: "ATH-MaaS: OvisOCR3", route: "private-tee", context: 8192, workload: "text", summary: "", mark: "A", routes: List() },
    { provider: "phala", upstreamId: "z-ai/glm-ocr", name: "Z.ai: GLM-OCR", route: "private-tee", context: 8192, workload: "text", summary: "", mark: "Z", routes: List() },
    { provider: "phala", upstreamId: "xiaomi/xiaomi-ocr-0", name: "Xiaomi: Xiaomi-OCR-0", route: "private-tee", context: 8192, workload: "text", summary: "", mark: "X", routes: List() },
  )

pure val tinfoil: List[CatalogModel] = List(
    { provider: "tinfoil", upstreamId: "deepseek-v4-1-flash", name: "DeepSeek V4.1 Flash", route: "private-tee", context: 1048576, workload: "chat/completions, responses", summary: "General-purpose reasoning and long document workflows.", mark: "D", routes: List({ endpoint: "chat/completions", modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", input: 660000, cache: 11000, output: 1595000, request: -1, session: -1 }, { endpoint: "responses", modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", input: 660000, cache: -1, output: 1595000, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "glm-5-3", name: "GLM-5.3", route: "private-tee", context: 1048576, workload: "chat/completions, responses", summary: "", mark: "G", routes: List({ endpoint: "chat/completions", modelId: "z-ai/glm-5.3", input: 1980000, cache: 495000, output: 6325000, request: -1, session: -1 }, { endpoint: "responses", modelId: "z-ai/glm-5.3", input: 1980000, cache: -1, output: 6325000, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "inkling-2-small", name: "Inkling 2 Small", route: "private-tee", context: 524288, workload: "chat/completions, responses", summary: "", mark: "I", routes: List({ endpoint: "chat/completions", modelId: "tinfoil/inkling-2-small", input: 330000, cache: 33000, output: 1100000, request: -1, session: -1 }, { endpoint: "responses", modelId: "tinfoil/inkling-2-small", input: 330000, cache: -1, output: 1100000, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "kimi-k3-1-pro", name: "Kimi K3.1 Pro", route: "private-tee", context: 262144, workload: "chat/completions, responses", summary: "", mark: "K", routes: List({ endpoint: "chat/completions", modelId: "tinfoil/kimi-k3-1-pro", input: 4400000, cache: 440000, output: 22000000, request: -1, session: -1 }, { endpoint: "responses", modelId: "tinfoil/kimi-k3-1-pro", input: 4400000, cache: -1, output: 22000000, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "llama3-3-70b", name: "Llama 3.3 70B", route: "private-tee", context: 131072, workload: "chat/completions", summary: "", mark: "L", routes: List({ endpoint: "chat/completions", modelId: "tinfoil/llama3-3-70b", input: 1925000, cache: 1925000, output: 3025000, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "gemma4-31b", name: "Gemma 4 31B", route: "private-tee", context: 262144, workload: "chat/completions, responses", summary: "", mark: "G", routes: List({ endpoint: "chat/completions", modelId: "tinfoil/gemma4-31b", input: 440000, cache: 440000, output: 1100000, request: -1, session: -1 }, { endpoint: "responses", modelId: "tinfoil/gemma4-31b", input: 440000, cache: -1, output: 1100000, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "gpt-oss-120b", name: "GPT-OSS 120B", route: "private-tee", context: 131072, workload: "chat/completions, responses", summary: "", mark: "G", routes: List({ endpoint: "chat/completions", modelId: "tinfoil/gpt-oss-120b", input: 165000, cache: 165000, output: 660000, request: -1, session: -1 }, { endpoint: "responses", modelId: "tinfoil/gpt-oss-120b", input: 165000, cache: -1, output: 660000, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "gpt-oss-safeguard-120b", name: "GPT-OSS Safeguard 120B", route: "private-tee", context: 131072, workload: "chat/completions, responses", summary: "", mark: "G", routes: List({ endpoint: "chat/completions", modelId: "tinfoil/gpt-oss-safeguard-120b", input: 165000, cache: 165000, output: 660000, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "pii-filter", name: "Privacy Filter", route: "private-tee", context: 80000, workload: "/redact", summary: "", mark: "P", routes: List({ endpoint: "redact", modelId: "pii-filter", input: 880000, cache: -1, output: -1, request: 220, session: -1 }) },
    { provider: "tinfoil", upstreamId: "nomic-embed-text", name: "Nomic Embed Text", route: "private-tee", context: 8192, workload: "embeddings", summary: "", mark: "N", routes: List({ endpoint: "embeddings", modelId: "nomic-embed-text", input: 17600, cache: -1, output: -1, request: -1, session: -1 }) },
    { provider: "tinfoil", upstreamId: "doc-upload", name: "Private Document Processing", route: "private-tee", context: 0, workload: "convert/file", summary: "", mark: "P", routes: List({ endpoint: "convert/file", modelId: "doc-upload", input: -1, cache: -1, output: -1, request: 55000, session: -1 }) },
    { provider: "tinfoil", upstreamId: "voxtral-small-24b", name: "Voxtral Small 24B", route: "private-tee", context: 32768, workload: "audio/transcriptions, audio/translations, chat/completions", summary: "", mark: "V", routes: List({ endpoint: "audio/translations", modelId: "voxtral-small-24b", input: -1, cache: -1, output: -1, request: 2750, session: -1 }) },
    { provider: "tinfoil", upstreamId: "websearch", name: "Private Web Search", route: "private-tee", context: 0, workload: "chat/completions, responses", summary: "", mark: "P", routes: List() },
    { provider: "tinfoil", upstreamId: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo", route: "private-tee", context: 0, workload: "audio/transcriptions", summary: "", mark: "W", routes: List({ endpoint: "audio/transcriptions", modelId: "whisper-large-v3-turbo", input: -1, cache: -1, output: -1, request: 11000, session: -1 }) },
    { provider: "tinfoil", upstreamId: "qwen3-tts", name: "Qwen3-TTS 1.7B", route: "private-tee", context: 0, workload: "audio/speech", summary: "", mark: "Q", routes: List() },
    { provider: "tinfoil", upstreamId: "voxtral-tts", name: "Voxtral TTS", route: "private-tee", context: 0, workload: "audio/speech", summary: "", mark: "V", routes: List({ endpoint: "audio/speech", modelId: "voxtral-tts", input: -1, cache: -1, output: -1, request: 2200, session: -1 }) },
    { provider: "tinfoil", upstreamId: "voxtral-mini-4b-realtime", name: "Voxtral Mini 4B Realtime", route: "private-tee", context: 0, workload: "realtime", summary: "", mark: "V", routes: List({ endpoint: "realtime", modelId: "voxtral-mini-4b-realtime", input: -1, cache: -1, output: -1, request: -1, session: 2200 }) },
    { provider: "tinfoil", upstreamId: "decision-large", name: "Decision Large", route: "private-tee", context: 32768, workload: "decisions", summary: "", mark: "D", routes: List() },
    { provider: "tinfoil", upstreamId: "decision-medium", name: "Decision Medium", route: "private-tee", context: 32768, workload: "decisions", summary: "", mark: "D", routes: List() },
    { provider: "tinfoil", upstreamId: "decision-small", name: "Decision Small", route: "private-tee", context: 32768, workload: "decisions", summary: "", mark: "D", routes: List() }
  )

pure def joinCatalog(
  a: List[CatalogModel], b: List[CatalogModel], c: List[CatalogModel],
  d: List[CatalogModel], e: List[CatalogModel], f: List[CatalogModel]
): List[CatalogModel] =
  a.concat(b).concat(c).concat(d).concat(e).concat(f)

pure val catalog: List[CatalogModel] =
  joinCatalog(nearA, nearB, nearC, phalaA, phalaB, tinfoil)
```

The workspace's list is these provider groups joined, in this order.

### Every row names a provider Sonnely routes

```quint
pure val providers = Set("near-ai", "phala", "tinfoil")

pure def providersKnown(xs: List[CatalogModel]): bool =
  xs.every((m) => providers.contains(m.provider))

pure def lawCatalogProvidersAreKnown(at: int): bool =
  providersKnown(nearA) and providersKnown(nearB) and providersKnown(nearC) and
  providersKnown(phalaA) and providersKnown(phalaB) and providersKnown(tinfoil)
```

### Chat routes always price input and output tokens

```quint
pure def chatRoutesPriced(xs: List[CatalogModel]): bool =
  xs.every((m) => m.routes.every((r) =>
    r.endpoint != "chat/completions" or (r.input >= 0 and r.output >= 0)))

pure def lawChatRoutesPriceTokens(at: int): bool =
  chatRoutesPriced(nearA) and chatRoutesPriced(nearB) and chatRoutesPriced(nearC) and
  chatRoutesPriced(phalaA) and chatRoutesPriced(phalaB) and chatRoutesPriced(tinfoil)
```

### Rates are never negative except the -1 "does not apply" mark

A rate is a price in millionths of a dollar, or exactly `-1` where the
unit does not apply to the route — no other negative appears.

```quint
pure def ratesWhole(xs: List[CatalogModel]): bool =
  xs.every((m) => m.routes.every((r) =>
    r.input >= -1 and r.cache >= -1 and r.output >= -1 and
    r.request >= -1 and r.session >= -1))

pure def lawRatesAreWhole(at: int): bool =
  ratesWhole(nearA) and ratesWhole(nearB) and ratesWhole(nearC) and
  ratesWhole(phalaA) and ratesWhole(phalaB) and ratesWhole(tinfoil)
```

### The catalog keeps the ids the models are routed on

The model ids a chat client may send are exactly the chat routes' model
ids.

```quint
pure val chatIds: List[str] =
  catalog.foldl(List(), (acc, m) =>
    acc.concat(m.routes.select((r) => r.endpoint == "chat/completions").listMap((r) => r.modelId)))

pure def providerOf(models: List[CatalogModel], modelId: str): str =
  models.select((m) =>
    m.routes.some((r) => r.endpoint == "chat/completions" and r.modelId == modelId)
  ).nthOr(0, { provider: "near-ai", upstreamId: "", name: "", route: "", context: 0, workload: "", summary: "", mark: "", routes: List() }).provider
```

### Each provider serves a chat model id once

Several providers can route the same model id — that is how the gateway
fails over — but no provider lists it twice.

```quint
pure def chatIdsOncePerProvider(xs: List[CatalogModel]): bool =
  xs.every((m) =>
    m.routes.every((r) =>
      r.endpoint != "chat/completions" or
      m.routes.select((x) => x.endpoint == "chat/completions" and x.modelId == r.modelId).length() == 1))

pure def lawProviderChatIdsUnique(at: int): bool =
  chatIdsOncePerProvider(nearA) and chatIdsOncePerProvider(nearB) and chatIdsOncePerProvider(nearC) and
  chatIdsOncePerProvider(phalaA) and chatIdsOncePerProvider(phalaB) and chatIdsOncePerProvider(tinfoil)
```
