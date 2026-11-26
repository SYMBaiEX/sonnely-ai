# Gateway requests

The ledger of requests the OpenAI-compatible API serves: an authorized
credential, a registered model, and spend recorded exactly once per request.
The keyring a credential resolves to lives in [keyring](./keyring.md) under
the shared `keys` store; this machine records what was served and how it
ended.

## Domain

### The endpoints and the model registry

Every public inference endpoint and the models it accepts, mirroring the
catalog the shell serves from `/v1/models` and the specialized endpoint
tables. A request that names a pair outside the registry never opens.

```quint
import keyring as K from "./keyring"

type Endpoint =
  | ChatCompletions | Embeddings | Rerank | ResponsesApi | Redact | Systemone
  | ImageGenerations | ImageEdits | AudioSpeech | AudioTranscriptions
  | AudioTranslations | ConvertFile | Realtime

pure val chatModels = List(
  "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  "deepseek-ai/DeepSeek-V4.1-Flash-1017-abliterated",
  "z-ai/glm-5.3-flash",
  "Qwen/Qwen3.6-35B-A3B-FP8",
  "Qwen/Qwen3.8-27B",
  "Qwen/Qwen3.8-27B-abliterated",
  "Qwen/Qwen3-VL-30B-A3B-Instruct",
  "phala/deepseek-v4.1-flash-1017-uncensored",
  "phala/moonshotai/kimi-k3.1-pro",
  "phala/qwen/qwen-2.5-7b-instruct",
  "phala/qwen3.8-27b-uncensored",
  "phala/gemma-4-26b-a4b-uncensored",
  "z-ai/glm-5.3",
  "tinfoil/inkling-2-small",
  "tinfoil/kimi-k3-1-pro",
  "tinfoil/llama3-3-70b",
  "tinfoil/gemma4-31b",
  "tinfoil/gpt-oss-120b",
  "tinfoil/gpt-oss-safeguard-120b"
)

pure def registered(endpoint: Endpoint, model: str): bool =
  match endpoint {
  | ChatCompletions => chatModels.includes(model)
  | Embeddings => List("Qwen/Qwen3-Embedding-0.6B", "nomic-embed-text").includes(model)
  | Rerank => List("Qwen/Qwen3-Reranker-0.6B").includes(model)
  | ResponsesApi => List("deepseek-ai/DeepSeek-V4.1-Flash-1017", "z-ai/glm-5.3", "tinfoil/inkling-2-small", "tinfoil/kimi-k3-1-pro", "tinfoil/gemma4-31b", "tinfoil/gpt-oss-120b").includes(model)
  | Redact => List("pii-filter").includes(model)
  | Systemone => List("levanto/sage-2").includes(model)
  | ImageGenerations => List("black-forest-labs/FLUX.2-klein-4B").includes(model)
  | ImageEdits => List("black-forest-labs/FLUX.2-klein-4B").includes(model)
  | AudioSpeech => List("voxtral-tts").includes(model)
  | AudioTranscriptions => List("whisper-large-v3-turbo").includes(model)
  | AudioTranslations => List("voxtral-small-24b").includes(model)
  | ConvertFile => List("doc-upload").includes(model)
  | Realtime => List("voxtral-mini-4b-realtime").includes(model)
  }
```

### A served request

Each entry keeps the request's reference, the key record the shell resolved
when it authorized the call, the endpoint and model, whether it streams, the
tokens it has emitted, where it stands and — once — what it was charged.
`charged` is `-1` until the request completes.

```quint
type RequestStatus = Serving | Complete | Failed

type Served = {
  ref: str,
  key: K::KeyRecord,
  endpoint: Endpoint,
  model: str,
  stream: bool,
  emitted: int,
  status: RequestStatus,
  charged: int
}

type Gateway = { requests: List[Served] }

pure val initial: Gateway = { requests: List() }
```

### Values the checks sample

```quint
pure val refValues = Set("req_alpha", "req_beta", "req_gamma")

pure val keyValues = Set(
  { id: "key_alpha", prefix: "sonnely_live_a", status: K::Active, spendLimit: -1, spent: 0 },
  { id: "key_beta", prefix: "sonnely_live_b", status: K::Active, spendLimit: 100, spent: 50 },
  { id: "key_gamma", prefix: "fr_live_g", status: K::Revoked, spendLimit: -1, spent: 0 },
  { id: "key_delta", prefix: "sonnely_live_d", status: K::Active, spendLimit: 0, spent: 0 }
)

pure val modelValues = Set("z-ai/glm-5.3-flash", "nomic-embed-text", "pii-filter", "unknown/model")

pure val tokensValues = Set(1, 2, 5)

pure val costValues = Set(0, 7, 250)
```

## Story: Serve a metered completion

> As the gateway, I want to open a request only for a live key and a listed
> model, stream or return its result, and record its spend exactly once, so
> that unauthorized keys never serve and no request is charged twice.

### A request opens only for a serving key and a registered model

The shell resolves the bearer credential to the stored key record and
presents it in the event. An idempotency-keyed retry reuses its reference,
so a reference already in the ledger is refused — the shell answers that
with `409` and the original reference.

```quint
pure def canOpen(g: Gateway, ref: str, key: K::KeyRecord, endpoint: Endpoint, model: str): bool =
  key.spent >= 0 and key.spendLimit >= -1 and
  not(g.requests.some((r) => r.ref == ref)) and
  K::mayServe(key) and
  registered(endpoint, model)

pure def open(g: Gateway, ref: str, key: K::KeyRecord, endpoint: Endpoint, model: str, stream: bool): Gateway =
  { requests: g.requests.concat(List({ ref: ref, key: key, endpoint: endpoint, model: model, stream: stream, emitted: 0, status: Serving, charged: -1 })) }
```

### A streamed request emits tokens while it is open

Only a request opened with `stream` emits, and only while it is serving.
Each emission adds a positive number of tokens.

```quint
pure def canEmit(g: Gateway, ref: str, tokens: int): bool =
  tokens > 0 and g.requests.some((r) => r.ref == ref and r.stream and r.status == Serving)

pure def emit(g: Gateway, ref: str, tokens: int): Gateway =
  { requests: g.requests.listMap((r) => if (r.ref == ref) { ...r, emitted: r.emitted + tokens } else r) }
```

### Finishing records the request's spend exactly once

Finishing writes the settled charge and closes the request. A second
finish, emit or fault finds the request already closed and is refused, so
the reference a client is given settles at most one charge. The shell
applies the same amount to the keyring's `charge` on the shared `keys`
store.

```quint
pure def canFinish(g: Gateway, ref: str, cost: int): bool =
  cost >= 0 and g.requests.some((r) => r.ref == ref and r.status == Serving)

pure def finish(g: Gateway, ref: str, cost: int): Gateway =
  { requests: g.requests.listMap((r) => if (r.ref == ref) { ...r, status: Complete, charged: cost } else r) }
```

### A request that cannot be served fails without a charge

```quint
pure def canFault(g: Gateway, ref: str): bool =
  g.requests.some((r) => r.ref == ref and r.status == Serving)

pure def fault(g: Gateway, ref: str): Gateway =
  { requests: g.requests.listMap((r) => if (r.ref == ref) { ...r, status: Failed } else r) }
```

### Every request reference is unique

Two entries that carry the same reference are the same entry — a reference
resolves to exactly one request.

```quint
pure def sameKey(a: K::KeyRecord, b: K::KeyRecord): bool =
  a.prefix == b.prefix and a.status == b.status and a.spendLimit == b.spendLimit and a.spent == b.spent

pure def sameServed(a: Served, b: Served): bool =
  a.key.id == b.key.id and sameKey(a.key, b.key) and a.endpoint == b.endpoint and
  a.model == b.model and a.stream == b.stream and a.emitted == b.emitted and
  a.status == b.status and a.charged == b.charged

pure def alwaysRefsUnique(g: Gateway): bool =
  g.requests.every((a) => g.requests.every((b) => a.ref != b.ref or sameServed(a, b)))
```

### Unauthorized keys never serve

Every request in the ledger was opened by a key that could serve at that
moment: active, under its limit, well-formed.

```quint
pure def alwaysOnlyServingKeys(g: Gateway): bool =
  g.requests.every((r) => K::mayServe(r.key) and r.key.spent >= 0 and r.key.spendLimit >= -1)
```

### Every request names a registered model

```quint
pure def alwaysRegisteredModels(g: Gateway): bool =
  g.requests.every((r) => registered(r.endpoint, r.model))
```

### Charge is recorded exactly on completion

A completed request carries a non-negative charge; a request still serving
or failed carries none.

```quint
pure def alwaysChargeSettledOnce(g: Gateway): bool =
  g.requests.every((r) => (r.charged >= 0) iff (r.status == Complete))
```

### Emitted tokens never go back

```quint
pure def stepEmittedNeverShrinks(before: Gateway, after: Gateway): bool =
  before.requests.every((b) => after.requests.every((a) => a.ref != b.ref or a.emitted >= b.emitted))
```

### A recorded charge never changes

Once a charge is written it is neither removed nor rewritten — spend is
recorded once.

```quint
pure def stepChargedWrittenOnce(before: Gateway, after: Gateway): bool =
  before.requests.every((b) => after.requests.every((a) => a.ref != b.ref or b.charged < 0 or a.charged == b.charged))
```

### A closed request never reopens

A completed or failed request keeps its status in every later step — a
stream terminates exactly once.

```quint
pure def stepTerminalStays(before: Gateway, after: Gateway): bool =
  before.requests.every((b) => after.requests.every((a) => a.ref != b.ref or b.status == Serving or a.status == b.status))
```

### A settled request cannot emit, settle or fail again

```quint
pure def lawTerminalIsFinal(g: Gateway, ref: str, tokens: int, cost: int): bool =
  not(alwaysRefsUnique(g) and g.requests.some((r) => r.ref == ref and r.status != Serving)) or
  (not(canEmit(g, ref, tokens)) and not(canFinish(g, ref, cost)) and not(canFault(g, ref)))
```

### A request can complete

```quint
pure def sometimesServed(g: Gateway): bool = g.requests.some((r) => r.status == Complete)
```

### A request can fail

```quint
pure def sometimesFailed(g: Gateway): bool = g.requests.some((r) => r.status == Failed)
```

### A stream can emit tokens and terminate

```quint
pure def sometimesStreamed(g: Gateway): bool =
  g.requests.some((r) => r.stream and r.emitted > 1 and r.status == Complete)
```
