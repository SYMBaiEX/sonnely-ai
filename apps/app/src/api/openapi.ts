// spec/app/docs/index.md, "Every endpoint the reference lists is documented"

const provider = { type: "string", enum: ["near-ai", "phala", "tinfoil"] };

const microUsd = { type: "integer", description: "Integer micro-USD (1/1,000,000 USD)." };

const errorShape = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        message: { type: "string" },
        type: { type: "string", enum: ["invalid_request_error", "insufficient_quota", "server_error", "sonnely_error", "gone"] },
      },
      required: ["message", "type"],
    },
  },
  required: ["error"],
};

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const requestIdHeaders = {
  "X-Sonnely-Request-Id": { description: "The request reference for Usage and Request logs.", schema: { type: "string" } },
  "X-Sonnely-Provider": { description: "The provider that served the request.", schema: provider },
};

const usage = {
  type: "object",
  properties: {
    prompt_tokens: { type: "integer" },
    completion_tokens: { type: "integer" },
    total_tokens: { type: "integer" },
  },
  required: ["prompt_tokens", "completion_tokens", "total_tokens"],
};

const toolCall = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1, maxLength: 200 },
    type: { type: "string", const: "function" },
    function: {
      type: "object",
      properties: {
        name: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
        arguments: { type: "string" },
      },
      required: ["name", "arguments"],
    },
  },
  required: ["id", "type", "function"],
};

const messageText = { type: "string", minLength: 1, maxLength: 12_000 };

const chatMessage = {
  oneOf: [
    {
      type: "object",
      properties: { role: { type: "string", const: "system" }, content: messageText },
      required: ["role", "content"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { role: { type: "string", const: "user" }, content: messageText },
      required: ["role", "content"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        role: { type: "string", const: "assistant" },
        content: { ...messageText, nullable: true },
        tool_calls: { type: "array", items: toolCall, minItems: 1, maxItems: 16 },
      },
      required: ["role"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { role: { type: "string", const: "tool" }, content: messageText, tool_call_id: { type: "string", minLength: 1, maxLength: 200 } },
      required: ["role", "content", "tool_call_id"],
      additionalProperties: false,
    },
  ],
};

const providerPolicy = {
  type: "object",
  description: "Pin one route, or list two or three distinct providers in order with allow_fallbacks: true.",
  properties: {
    only: { type: "array", items: provider, minItems: 1, maxItems: 3, uniqueItems: true },
    allow_fallbacks: { type: "boolean" },
  },
  required: ["only"],
  additionalProperties: false,
};

const functionTool = {
  type: "object",
  properties: {
    type: { type: "string", const: "function" },
    function: {
      type: "object",
      properties: {
        name: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
        description: { type: "string", maxLength: 2048 },
        parameters: { type: "object" },
        strict: { type: "boolean", nullable: true },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  required: ["type", "function"],
  additionalProperties: false,
};

const responseFormat = {
  oneOf: [
    { type: "object", properties: { type: { type: "string", const: "text" } }, required: ["type"], additionalProperties: false },
    { type: "object", properties: { type: { type: "string", const: "json_object" } }, required: ["type"], additionalProperties: false },
    {
      type: "object",
      properties: {
        type: { type: "string", const: "json_schema" },
        json_schema: {
          type: "object",
          properties: {
            name: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
            description: { type: "string", maxLength: 2048 },
            schema: { type: "object" },
            strict: { type: "boolean", nullable: true },
          },
          required: ["name", "schema"],
          additionalProperties: false,
        },
      },
      required: ["type", "json_schema"],
      additionalProperties: false,
    },
  ],
};

const costCeiling = { ...microUsd, exclusiveMinimum: 0, description: "Optional positive integer ceiling on the credit reservation, in micro-USD." };

const chatCompletionRequest = {
  type: "object",
  description: "Strict object: unknown fields are refused. Up to 36,000 bytes of JSON.",
  properties: {
    model: { type: "string", minLength: 1, maxLength: 100, description: "An exact public model ID from GET /api/sonnely/v1/models." },
    messages: { type: "array", items: chatMessage, minItems: 1, maxItems: 32 },
    max_tokens: { type: "integer", minimum: 1, maximum: 2048, description: "Output allowance. Defaults to 512." },
    max_cost_microusd: costCeiling,
    stream: { type: "boolean" },
    stream_options: {
      type: "object",
      properties: { include_usage: { type: "boolean", const: true } },
      required: ["include_usage"],
      additionalProperties: false,
      description: "Requires stream: true.",
    },
    provider: providerPolicy,
    tools: { type: "array", items: functionTool, minItems: 1, maxItems: 16 },
    tool_choice: {
      oneOf: [
        { type: "string", enum: ["auto", "none", "required"] },
        {
          type: "object",
          properties: { type: { type: "string", const: "function" }, function: { type: "object", properties: { name: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" } }, required: ["name"], additionalProperties: false } },
          required: ["type", "function"],
          additionalProperties: false,
        },
      ],
      description: "Requires tools.",
    },
    response_format: responseFormat,
  },
  required: ["model", "messages"],
  additionalProperties: false,
};

const receipt = {
  type: "object",
  properties: {
    version: { type: "string", const: "v1" },
    provider,
    requested_model: { type: "string" },
    reported_model: { type: "string" },
    provider_completion_id: { type: "string" },
    billing_reference: { type: "string" },
    charged_microusd: microUsd,
    cached_input_tokens: { type: "integer" },
    upstream_request_sha256: { type: "string", description: "SHA-256 hex of the exact upstream request body." },
    upstream_response_sha256: { type: "string", description: "SHA-256 hex of the upstream response body or stream bytes." },
    evidence: { type: "object", description: "Provider attestation evidence; the status field reports the outcome.", properties: { status: { type: "string" } }, required: ["status"] },
  },
  required: ["version", "provider", "requested_model", "provider_completion_id", "charged_microusd", "cached_input_tokens", "upstream_request_sha256", "upstream_response_sha256", "evidence"],
};

const chatCompletion = {
  type: "object",
  description: "The provider completion with the requested model ID, public usage totals and Sonnely settlement fields.",
  properties: {
    id: { type: "string" },
    object: { type: "string", const: "chat.completion" },
    created: { type: "number" },
    model: { type: "string" },
    choices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          message: {
            type: "object",
            properties: {
              role: { type: "string", const: "assistant" },
              content: { type: "string", nullable: true },
              reasoning_content: { type: "string", nullable: true },
              tool_calls: { type: "array", items: toolCall },
            },
            required: ["role"],
          },
          finish_reason: { type: "string", nullable: true },
        },
        required: ["index", "message", "finish_reason"],
      },
    },
    usage,
    sonnely_request_id: { type: "string" },
    sonnely_provider: provider,
    sonnely_receipt: receipt,
  },
  required: ["id", "object", "created", "model", "choices", "usage", "sonnely_request_id", "sonnely_provider"],
};

const chatCompletionChunk = {
  type: "object",
  properties: {
    id: { type: "string" },
    object: { type: "string", const: "chat.completion.chunk" },
    created: { type: "number" },
    model: { type: "string" },
    choices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          delta: {
            type: "object",
            properties: {
              role: { type: "string", const: "assistant" },
              content: { type: "string", nullable: true },
              reasoning_content: { type: "string", nullable: true },
            },
          },
          finish_reason: { type: "string", nullable: true },
        },
        required: ["index", "delta"],
      },
    },
    usage: { ...usage, nullable: true },
    sonnely_receipt: receipt,
  },
  required: ["id", "object", "created", "model", "choices"],
};

const modelRoute = {
  type: "object",
  properties: {
    provider,
    upstream_model: { type: "string" },
    private_failover: { type: "boolean" },
    capabilities: {
      type: "object",
      properties: { tools: { type: "boolean" }, structured_outputs: { type: "boolean" } },
      required: ["tools", "structured_outputs"],
    },
    price_usd_per_million: {
      type: "object",
      properties: { input: { type: "number" }, cache: { type: "number" }, output: { type: "number" } },
      required: ["input", "cache", "output"],
    },
    agent: { type: "boolean" },
  },
  required: ["provider", "upstream_model", "private_failover", "capabilities", "price_usd_per_million", "agent"],
};

const modelList = {
  type: "object",
  properties: {
    object: { type: "string", const: "list" },
    data: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The public model ID to send in requests." },
          object: { type: "string", const: "model" },
          created: { type: "integer" },
          owned_by: { type: "string" },
          sonnely: {
            type: "object",
            properties: {
              context_length: { type: "integer" },
              privacy_route: { type: "string" },
              routes: { type: "array", items: modelRoute, description: "Only the routes of currently configured providers are listed." },
            },
            required: ["context_length", "privacy_route", "routes"],
          },
        },
        required: ["id", "object", "created", "owned_by", "sonnely"],
      },
    },
  },
  required: ["object", "data"],
};

const catalogRoute = {
  type: "object",
  properties: {
    endpoint: { type: "string" },
    modelId: { type: "string" },
    input: { ...microUsd, description: "Micro-USD per million input tokens, or -1 when not applicable." },
    cache: { ...microUsd, description: "Micro-USD per million cached input tokens, or -1 when not applicable." },
    output: { ...microUsd, description: "Micro-USD per million output tokens, or -1 when not applicable." },
    request: { ...microUsd, description: "Micro-USD per request, or -1 when not applicable." },
    session: { ...microUsd, description: "Micro-USD per session, or -1 when not applicable." },
  },
  required: ["endpoint", "modelId", "input", "cache", "output", "request", "session"],
};

const catalogRow = {
  type: "object",
  properties: {
    provider: { type: "string" },
    upstreamId: { type: "string" },
    name: { type: "string" },
    route: { type: "string", description: "The provider privacy classification, for example private-tee." },
    context: { type: "integer" },
    workload: { type: "string" },
    summary: { type: "string" },
    mark: { type: "string" },
    routes: { type: "array", items: catalogRoute },
  },
  required: ["provider", "upstreamId", "name", "route", "context", "workload", "summary", "mark", "routes"],
};

const providerModels = {
  type: "object",
  properties: {
    providers: { type: "array", items: provider, description: "The providers currently configured for live inference." },
    catalog: { type: "array", items: catalogRow, description: "Full upstream inventories, including entries Sonnely lists for discovery only." },
    specialized: {
      type: "array",
      items: {
        allOf: [
          catalogRoute,
          { type: "object", properties: { provider: { type: "string" }, upstream_model: { type: "string" } }, required: ["provider", "upstream_model"] },
        ],
      },
    },
    realtime_model: { type: "string", description: "The upstream realtime transcription model ID. The realtime endpoint itself is not yet served." },
  },
  required: ["providers", "catalog", "specialized", "realtime_model"],
};

const keyStatus = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        prefix: { type: "string", description: "The key's display prefix; the secret is never stored or returned." },
        status: { type: "string", enum: ["Active", "Revoked"] },
        spendLimit: { ...microUsd, description: "Lifetime spend cap in micro-USD, or -1 when unlimited." },
        spent: { ...microUsd, description: "Lifetime spend in micro-USD." },
      },
      required: ["prefix", "status", "spendLimit", "spent"],
    },
  },
  required: ["data"],
};

const sonnelyFields = {
  model: { type: "string" },
  sonnely_request_id: { type: "string" },
  sonnely_provider: provider,
};

const passthrough = (description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  description: description + " The response is the provider's JSON with model, sonnely_request_id and sonnely_provider set by Sonnely.",
  properties: { ...properties, ...sonnelyFields },
  required: [...required, "model", "sonnely_request_id", "sonnely_provider"],
});

const embeddingsResponse = passthrough(
  "Embedding vectors as float arrays.",
  {
    object: { type: "string", const: "list" },
    data: { type: "array", items: { type: "object", properties: { object: { type: "string", const: "embedding" }, embedding: { type: "array", items: { type: "number" } }, index: { type: "integer" } }, required: ["object", "embedding", "index"] } },
    usage: { type: "object" },
  },
  ["object", "data"],
);

const rerankResponse = passthrough(
  "Document indexes and relevance scores.",
  {
    results: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, relevance_score: { type: "number" }, document: { type: "object" } }, required: ["index", "relevance_score"] } },
  },
  ["results"],
);

const responsesResponse = passthrough(
  "A Responses API object.",
  {
    id: { type: "string" },
    object: { type: "string", const: "response" },
    output: { type: "array", items: { type: "object" } },
    status: { type: "string" },
  },
  ["id"],
);

const redactResponse = passthrough("The redacted text.", { redacted_text: { type: "string" } }, []);

const systemoneResponse = passthrough(
  "A System One decision object.",
  { id: { type: "string" }, object: { type: "string", const: "systemone.completion" }, output_text: { type: "string" } },
  ["id"],
);

const imageResponse = passthrough(
  "One base64-encoded image.",
  {
    created: { type: "integer" },
    data: { type: "array", items: { type: "object", properties: { b64_json: { type: "string" } }, required: ["b64_json"] } },
  },
  ["created", "data"],
);

const transcriptionResponse = passthrough("The transcribed or translated text.", { text: { type: "string" } }, ["text"]);

const convertResponse = passthrough(
  "The converted document as Markdown.",
  { document: { type: "object", properties: { md_content: { type: "string" } } } },
  [],
);

const batchState = {
  oneOf: [
    { type: "object", properties: { tag: { type: "string", const: "Empty" } }, required: ["tag"] },
    {
      type: "object",
      properties: {
        tag: { type: "string", const: "Running" },
        job: {
          type: "object",
          properties: {
            id: { type: "string" },
            filename: { type: "string" },
            createdAt: { type: "integer" },
            lastSentAt: { type: "integer" },
            inFlight: { type: "string" },
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  customId: { type: "string" },
                  status: { type: "string", enum: ["Queued", "Sending", "Interrupted", "Succeeded", "Failed", "Blocked", "Review"] },
                },
                required: ["customId", "status"],
              },
            },
          },
          required: ["id", "filename", "createdAt", "lastSentAt", "inFlight", "rows"],
        },
      },
      required: ["tag", "job"],
    },
  ],
};

const jsonContent = (schema: unknown) => ({ "application/json": { schema } });

const jsonRequest = (schema: unknown) => ({ required: true, content: jsonContent(schema) });

const multipartRequest = (properties: Record<string, unknown>, required: string[]) => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema: { type: "object", properties: { model: { type: "string", description: "The endpoint's model ID. Defaults to the endpoint's documented model." }, ...properties }, required },
    },
  },
});

const jsonSuccess = (schema: unknown, headers: boolean = false) => ({
  description: "The served response.",
  content: jsonContent(schema),
  ...(headers ? { headers: requestIdHeaders } : {}),
});

const authedErrors = {
  "400": errorResponse("The request fields failed validation."),
  "401": errorResponse("The bearer key is missing, revoked or expired."),
  "402": errorResponse("The key, project or balance budget would be exceeded."),
  "404": errorResponse("The model is unavailable on this endpoint or provider."),
  "409": errorResponse("An Idempotency-Key repeat or a conflicting batch state."),
  "413": errorResponse("The request is too large."),
  "415": errorResponse("The wrong content type for this endpoint."),
  "502": errorResponse("The provider could not complete this request."),
  "503": errorResponse("Managed inference is awaiting provider activation."),
} as const;

const idempotencyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  schema: { type: "string", pattern: "^[a-zA-Z0-9_.:-]{8,128}$" },
  description: "A value unique to the operation, 8 to 128 letters, numbers, dots, underscores, colons or hyphens. A repeat returns HTTP 409 with the original request reference and does not reserve credits again.",
};

const receiptParameter = {
  name: "X-Sonnely-Receipt",
  in: "header",
  required: false,
  schema: { type: "string", enum: ["v1"] },
  description: "Set to v1 to include sonnely_receipt in the completion or terminal stream event.",
};

const costField = { max_cost_microusd: costCeiling };

const specializedSecurity = [{ bearerAuth: [] }];

const specializedOperation = (summary: string, schema: unknown, response: unknown): Record<string, unknown> => ({
  post: {
    summary,
    security: specializedSecurity,
    parameters: [{ ...idempotencyParameter }],
    requestBody: jsonRequest(schema),
    responses: { "200": jsonSuccess(response, true), ...authedErrors },
  },
});

const embeddingsInput = {
  type: "object",
  properties: {
    model: { type: "string", description: "Qwen/Qwen3-Embedding-0.6B or nomic-embed-text." },
    input: { oneOf: [{ type: "string", minLength: 1, maxLength: 8192 }, { type: "array", items: { type: "string", minLength: 1, maxLength: 8192 }, minItems: 1, maxItems: 32 }] },
    encoding_format: { type: "string", enum: ["float", "base64"] },
    ...costField,
  },
  required: ["model", "input"],
  additionalProperties: false,
};

const rerankInput = {
  type: "object",
  properties: {
    model: { type: "string", description: "Qwen/Qwen3-Reranker-0.6B." },
    query: { type: "string", minLength: 1, maxLength: 4096 },
    documents: { type: "array", items: { type: "string", minLength: 1, maxLength: 8192 }, minItems: 1, maxItems: 16 },
    ...costField,
  },
  required: ["model", "query", "documents"],
  additionalProperties: false,
};

const responsesInput = {
  type: "object",
  properties: {
    model: { type: "string", description: "A Tinfoil-routed text model ID." },
    input: { type: "string", minLength: 1, maxLength: 32_000 },
    max_output_tokens: { type: "integer", minimum: 1, maximum: 4096 },
    ...costField,
  },
  required: ["model", "input"],
  additionalProperties: false,
};

const redactInput = {
  type: "object",
  properties: {
    model: { type: "string", description: "Defaults to pii-filter." },
    text: { type: "string", minLength: 1, maxLength: 32_000 },
    ...costField,
  },
  required: ["text"],
  additionalProperties: false,
};

const systemoneInput = {
  type: "object",
  properties: {
    model: { type: "string", description: "Defaults to levanto/sage-2." },
    state: { type: "string", minLength: 1, maxLength: 32_000 },
    questions: {
      type: "object",
      description: "One to eight named noul questions.",
      additionalProperties: {
        type: "object",
        properties: { type: { type: "string", const: "noul" }, instructions: {} },
        required: ["type"],
      },
    },
    ...costField,
  },
  required: ["state", "questions"],
  additionalProperties: false,
};

const imageInput = {
  type: "object",
  properties: {
    model: { type: "string", description: "black-forest-labs/FLUX.2-klein-4B." },
    prompt: { type: "string", minLength: 1, maxLength: 4096 },
    size: { type: "string", maxLength: 40 },
    n: { type: "integer", const: 1 },
    ...costField,
  },
  required: ["model", "prompt"],
  additionalProperties: false,
};

const speechInput = {
  type: "object",
  properties: {
    model: { type: "string", description: "voxtral-tts." },
    input: { type: "string", minLength: 1, maxLength: 4096, description: "The text to speak, up to 1,000 characters for the serving provider." },
    voice: { type: "string", maxLength: 80, description: "Defaults to neutral_female." },
    response_format: { type: "string", enum: ["mp3", "wav"] },
    ...costField,
  },
  required: ["model", "input"],
  additionalProperties: false,
};

const multipartOperation = (summary: string, properties: Record<string, unknown>, required: string[], response: unknown): Record<string, unknown> => ({
  post: {
    summary,
    security: specializedSecurity,
    parameters: [{ ...idempotencyParameter }],
    requestBody: multipartRequest(properties, required),
    responses: { "200": jsonSuccess(response, true), ...authedErrors },
  },
});

const fileField = { type: "string", format: "binary", description: "Up to 2 MB." };

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Sonnely Inference API",
    version: "0.1.6",
    description:
      "Confidential inference over OpenAI-compatible endpoints. Requests authenticate with a Sonnely API key as a bearer token and settle against workspace credits in micro-USD. Every served response carries an X-Sonnely-Request-Id header; inference responses also carry X-Sonnely-Provider. Errors use the OpenAI error shape.",
  },
  servers: [{ url: "https://sonnely.com" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "A Sonnely API key created in the console." },
    },
    schemas: {
      Error: errorShape,
      Usage: usage,
      ChatMessage: chatMessage,
      ChatCompletionRequest: chatCompletionRequest,
      ChatCompletion: chatCompletion,
      ChatCompletionChunk: chatCompletionChunk,
      Receipt: receipt,
      ModelList: modelList,
      ProviderModels: providerModels,
      KeyStatus: keyStatus,
      BatchState: batchState,
    },
  },
  paths: {
    "/api/sonnely/v1/models": {
      get: {
        summary: "List the public chat model IDs and their currently configured routes.",
        security: [],
        responses: {
          "200": { description: "The model list in the OpenAI shape.", content: jsonContent({ $ref: "#/components/schemas/ModelList" }) },
        },
      },
    },
    "/api/sonnely/v1/provider-models": {
      get: {
        summary: "Return the full upstream provider inventories and the specialized endpoint mappings.",
        security: [],
        responses: {
          "200": { description: "The provider inventory.", content: jsonContent({ $ref: "#/components/schemas/ProviderModels" }) },
        },
      },
    },
    "/api/sonnely/v1/key": {
      get: {
        summary: "Report the authenticated key's prefix, status and lifetime spend.",
        security: specializedSecurity,
        responses: {
          "200": { description: "The key status.", content: jsonContent({ $ref: "#/components/schemas/KeyStatus" }) },
          "401": errorResponse("A valid bearer key is required."),
        },
      },
    },
    "/api/sonnely/v1/chat/completions": {
      post: {
        summary: "Create a chat completion or a server-sent event stream.",
        security: specializedSecurity,
        parameters: [idempotencyParameter, receiptParameter],
        requestBody: jsonRequest({ $ref: "#/components/schemas/ChatCompletionRequest" }),
        responses: {
          "200": {
            description: "The completion, or an SSE stream when stream is true.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ChatCompletion" } },
              "text/event-stream": { schema: { $ref: "#/components/schemas/ChatCompletionChunk" } },
            },
            headers: requestIdHeaders,
          },
          ...authedErrors,
        },
      },
    },
    "/api/sonnely/v1/embeddings": specializedOperation("Create embeddings for one string or an array of strings.", embeddingsInput, embeddingsResponse),
    "/api/sonnely/v1/rerank": specializedOperation("Rank documents against a query.", rerankInput, rerankResponse),
    "/api/sonnely/v1/responses": specializedOperation("Create a single-turn Responses API object.", responsesInput, responsesResponse),
    "/api/sonnely/v1/redact": specializedOperation("Redact sensitive information from text.", redactInput, redactResponse),
    "/api/sonnely/v1/systemone": specializedOperation("Score named noul questions against a decision state.", systemoneInput, systemoneResponse),
    "/api/sonnely/v1/images/generations": specializedOperation("Generate one image from a prompt.", imageInput, imageResponse),
    "/api/sonnely/v1/images/edits": multipartOperation("Edit an uploaded image with a prompt.", { image: fileField, prompt: { type: "string", minLength: 1, maxLength: 4096 }, ...costField }, ["image", "prompt"], imageResponse),
    "/api/sonnely/v1/audio/speech": {
      post: {
        summary: "Synthesize speech from text.",
        security: specializedSecurity,
        parameters: [{ ...idempotencyParameter }],
        requestBody: jsonRequest(speechInput),
        responses: {
          "200": {
            description: "The synthesized audio as binary data.",
            content: { "audio/mpeg": { schema: { type: "string", format: "binary" } }, "audio/wav": { schema: { type: "string", format: "binary" } } },
            headers: requestIdHeaders,
          },
          ...authedErrors,
        },
      },
    },
    "/api/sonnely/v1/audio/transcriptions": multipartOperation("Transcribe an audio file.", { file: fileField, ...costField }, ["file"], transcriptionResponse),
    "/api/sonnely/v1/audio/translations": multipartOperation("Translate audio into English text.", { file: fileField, ...costField }, ["file"], transcriptionResponse),
    "/api/sonnely/v1/convert/file": multipartOperation("Convert one PDF into Markdown with OCR for scans.", { files: { ...fileField, description: "One PDF up to 2 MB." }, ...costField }, ["files"], convertResponse),
    "/api/sonnely/batch": {
      post: {
        summary: "Create the workspace batch job, replacing any job under a different ID.",
        security: specializedSecurity,
        requestBody: jsonRequest({
          type: "object",
          properties: {
            id: { type: "string" },
            filename: { type: "string" },
            customIds: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 200, description: "1 to 200 non-empty custom IDs; repeats keep their first row." },
          },
        }),
        responses: {
          "200": jsonSuccess({ type: "object", properties: { ok: { type: "boolean", const: true }, job: { type: "string" } }, required: ["ok", "job"] }),
          "401": errorResponse("The bearer key is missing, revoked or expired."),
          "409": errorResponse("A different batch job is running, or the rows do not fit."),
          "415": errorResponse("Send application/json."),
        },
      },
      get: {
        summary: "Read the batch job state.",
        security: specializedSecurity,
        responses: {
          "200": { description: "The batch state.", content: jsonContent({ $ref: "#/components/schemas/BatchState" }) },
          "401": errorResponse("The bearer key is missing, revoked or expired."),
        },
      },
      delete: {
        summary: "Clear the running batch job.",
        security: specializedSecurity,
        responses: {
          "200": jsonSuccess({ type: "object", properties: { ok: { type: "boolean", const: true } }, required: ["ok"] }),
          "401": errorResponse("The bearer key is missing, revoked or expired."),
          "409": errorResponse("No batch job is running."),
        },
      },
    },
    "/api/sonnely/batch/interrupt": {
      post: {
        summary: "Mark the in-flight row interrupted so it can be sent again.",
        security: specializedSecurity,
        requestBody: jsonRequest({ type: "object", properties: { customId: { type: "string" } } }),
        responses: {
          "200": jsonSuccess({ type: "object", properties: { ok: { type: "boolean", const: true } }, required: ["ok"] }),
          "401": errorResponse("The bearer key is missing, revoked or expired."),
          "409": errorResponse("That row is not in flight."),
          "415": errorResponse("Send application/json."),
        },
      },
    },
    "/api/sonnely/batch/chat": {
      post: {
        summary: "Serve one non-streaming batch row as a chat completion.",
        description: "Requires the X-Sonnely-Batch-Wallet header matching the key's workspace wallet and an Idempotency-Key of the form batch:<uuidv4>:<row index>.",
        security: specializedSecurity,
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", pattern: "^batch:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:\\d+$" },
            description: "The row checkpoint key: batch:<job uuidv4>:<row index>.",
          },
          {
            name: "X-Sonnely-Batch-Wallet",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "The workspace wallet the key belongs to.",
          },
        ],
        requestBody: jsonRequest({ ...chatCompletionRequest, description: "A chat completion request. Streaming rows are refused." }),
        responses: {
          "200": { description: "The row completion.", content: jsonContent({ $ref: "#/components/schemas/ChatCompletion" }), headers: requestIdHeaders },
          ...authedErrors,
        },
      },
    },
  },
};
