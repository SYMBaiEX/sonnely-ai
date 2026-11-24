import { z } from "zod";
import { completionMessage, functionTool, responseFormat, toolCall, toolChoice } from "@/lib/inference-tools";
import { apiBasePath, apiOrigin, limits } from "@/lib/api-contract";
import { receiptHeader, receiptVersion } from "@/lib/inference-receipt";
import { models } from "@/lib/models";
import { providerIds } from "@/lib/provider-catalog";
import { isSpecializedMultipart } from "@/lib/specialized-models";
import { specializedRequests } from "@/lib/specialized-requests";

const specializedDescriptions = {
  "audio/translations": "Translate a WAV recording into English text",
  "convert/file": "Convert one PDF to Markdown",
  redact: "Redact detected personal information",
  responses: "Generate a single-turn text response",
  "audio/speech": "Synthesize WAV audio from text",
  "audio/transcriptions": "Transcribe an uploaded audio file",
  "images/edits": "Edit one uploaded image",
  systemone: "Return probabilities for typed text questions",
  embeddings: "Generate embeddings for text",
  rerank: "Rank documents against a text query",
  "images/generations": "Generate one 512×512 image",
};

const jsonSchema = (schema: string) => ({
  "application/json": { schema: { $ref: "#/components/schemas/" + schema } },
});

const errors = Object.fromEntries(
  [
    [400, "Invalid request or unsupported parameters"],
    [401, "A valid Sonnely API key is required"],
    [402, "Insufficient credits or API key budget"],
    [403, "Current terms must be accepted"],
    [
      409,
      "Idempotency-Key already reserved a request. Check X-Sonnely-Request-Id for the original reference.",
    ],
    [404, "Model is outside the Sonnely catalog"],
    [413, "Request exceeds the body size limit"],
    [415, "Use application/json"],
    [429, "Wallet request limit reached"],
    [500, "Sonnely could not complete the request"],
    [502, "Provider failure or incomplete usage"],
    [503, "Managed inference is unavailable"],
  ].map(([code, description]) => [code, { description, content: jsonSchema("Error") }]),
);

const keyBudgetProperties = {
  cap_microusd: { type: ["integer", "null"], minimum: 0 },
  used_microusd: { type: "integer", minimum: 0 },
  remaining_microusd: { type: ["integer", "null"], minimum: 0 },
};
const keyBudgetFields = Object.keys(keyBudgetProperties);

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Sonnely Inference API",
    version: "1.0.0",
    description:
      "Confidential text inference on attested compute, metered in compute credits funded with Solana mainnet USDC.",
  },
  servers: [
    { url: apiOrigin + apiBasePath },
    { url: apiOrigin + "/v1", description: "Compatibility base URL" },
  ],
  paths: {
    "/realtime": {
      get: {
        summary: "Upgrade to one native realtime transcription WebSocket session",
        security: [{ SonnelyKey: [] }],
        parameters: [
          { in: "query", name: "model", required: true, schema: { const: "voxtral-mini-4b-realtime" } },
        ],
        responses: {
          101: { description: "WebSocket upgrade. Wait for session.created before sending PCM16 audio." },
          426: { description: "WebSocket upgrade required" },
          ...errors,
        },
      },
    },
    "/key": {
      get: {
        operationId: "getCurrentApiKey",
        summary: "Check the authenticated API key’s budget and expiry",
        description: "Budget usage includes settled charges and active reservations.",
        security: [{ SonnelyKey: [] }],
        responses: {
          200: { description: "Current key budget and expiry", content: jsonSchema("CurrentApiKey") },
          401: errors[401],
          500: errors[500],
          503: { description: "Account service unavailable", content: jsonSchema("Error") },
        },
      },
    },
    "/provider-models": {
      get: {
        operationId: "listProviderModels",
        summary: "List complete upstream model inventories and Sonnely endpoint mappings",
        responses: { 200: { description: "Provider inventories and configured providers" } },
      },
    },
    ...Object.fromEntries(
      Object.entries(specializedRequests).map(([endpoint, schema]) => [
        "/" + endpoint,
        {
          post: {
            summary: specializedDescriptions[endpoint as keyof typeof specializedDescriptions],
            security: [{ SonnelyKey: [] }],
            parameters: [
              {
                in: "header",
                name: "Idempotency-Key",
                required: false,
                schema: { type: "string", pattern: "^[A-Za-z0-9_.:-]{8,128}$" },
              },
            ],
            requestBody: {
              required: true,
              content: {
                [isSpecializedMultipart(endpoint) ? "multipart/form-data" : "application/json"]: {
                  schema: z.toJSONSchema(schema, {
                    target: "draft-2020-12",
                    io: "input",
                    unrepresentable: "any",
                  }),
                },
              },
            },
            responses: {
              200: {
                description: "Settled inference result and X-Sonnely-Request-Id reference",
                ...(endpoint === "audio/speech"
                  ? { content: { "audio/wav": { schema: { type: "string", format: "binary" } } } }
                  : {}),
              },
              ...errors,
            },
          },
        },
      ]),
    ),
    "/models": {
      get: {
        operationId: "listModels",
        summary: "List the Sonnely model catalog",
        responses: { 200: { description: "Model catalog", content: jsonSchema("ModelList") } },
      },
    },
    "/chat/completions": {
      post: {
        operationId: "createChatCompletion",
        summary: "Generate a text completion with optional streaming",
        security: [{ SonnelyKey: [] }],
        description:
          "Use a key from the console with available credits. The JSON body is limited to " +
          limits.bodyBytes +
          " bytes.",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: false,
            description:
              "Use the same key for retries of one operation. A repeat returns 409 and the original reference.",
            schema: { type: "string", pattern: "^[A-Za-z0-9_.:-]{8,128}$" },
          },
          {
            in: "header",
            name: receiptHeader,
            required: false,
            description: "Return Sonnely’s private completion receipt and any matching provider evidence.",
            schema: { const: receiptVersion },
          },
        ],
        requestBody: { required: true, content: jsonSchema("CompletionRequest") },
        responses: {
          200: {
            description: "Text completion or an OpenAI-compatible event stream.",
            headers: {
              "X-Sonnely-Request-Id": {
                schema: { type: "string" },
                description: "Reference in workspace Usage.",
              },
            },
            content: {
              ...jsonSchema("Completion"),
              "text/event-stream": {
                schema: { type: "string" },
                description:
                  "Completion chunks, optional final usage and receipt, and [DONE] after settlement. Missing final provider usage produces an error event and can leave a reservation held.",
              },
            },
          },
          ...errors,
        },
      },
    },
  },
  components: {
    securitySchemes: { SonnelyKey: { type: "http", scheme: "bearer", bearerFormat: "Sonnely API key" } },
    schemas: {
      CurrentApiKey: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "object",
            required: ["name", "expires_at_ms", "daily", "lifetime"],
            properties: {
              name: { type: "string" },
              expires_at_ms: { type: ["integer", "null"], minimum: 0 },
              daily: {
                type: "object",
                required: [...keyBudgetFields, "resets_at"],
                properties: {
                  ...keyBudgetProperties,
                  resets_at: { type: "string", format: "date-time" },
                },
              },
              lifetime: {
                type: "object",
                required: keyBudgetFields,
                properties: keyBudgetProperties,
              },
            },
          },
        },
      },
      ModelList: {
        type: "object",
        required: ["object", "data"],
        properties: {
          object: { const: "list" },
          data: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "object", "created", "owned_by", "tier", "privacy_route"],
              properties: {
                id: { type: "string" },
                object: { const: "model" },
                created: { type: "integer" },
                owned_by: { type: "string" },
                tier: { const: "confidential" },
                privacy_route: { const: "private-tee" },
                routes: { type: "array", items: { $ref: "#/components/schemas/ModelRoute" } },
              },
            },
          },
        },
      },
      ModelRoute: {
        type: "object",
        required: ["provider", "provider_name", "upstream_model", "price_usd_per_million"],
        properties: {
          provider: { enum: providerIds },
          provider_name: { type: "string" },
          upstream_model: { type: "string" },
          capabilities: {
            type: "object",
            properties: { tools: { type: "boolean" }, structured_outputs: { type: "boolean" } },
          },
          price_usd_per_million: {
            type: "object",
            required: ["input", "cache", "output"],
            properties: {
              input: { type: "number", minimum: 0 },
              cache: { type: "number", minimum: 0 },
              output: { type: "number", minimum: 0 },
            },
          },
        },
      },
      CompletionMessage: z.toJSONSchema(completionMessage, { io: "input" }),
      FunctionTool: z.toJSONSchema(functionTool, { io: "input" }),
      ToolChoice: z.toJSONSchema(toolChoice, { io: "input" }),
      ToolCall: z.toJSONSchema(toolCall),
      ResponseFormat: z.toJSONSchema(responseFormat, { io: "input" }),
      CompletionRequest: {
        type: "object",
        additionalProperties: false,
        required: ["model", "messages"],
        properties: {
          model: { type: "string", enum: models.map(({ id }) => id) },
          messages: {
            type: "array",
            minItems: 1,
            maxItems: limits.messages,
            items: { $ref: "#/components/schemas/CompletionMessage" },
          },
          tools: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: { $ref: "#/components/schemas/FunctionTool" },
          },
          tool_choice: { $ref: "#/components/schemas/ToolChoice" },
          response_format: { $ref: "#/components/schemas/ResponseFormat" },
          max_tokens: {
            type: "integer",
            minimum: 1,
            maximum: limits.maxOutputTokens,
            default: limits.defaultOutputTokens,
          },
          stream: { type: "boolean", default: false },
          stream_options: {
            type: "object",
            additionalProperties: false,
            properties: { include_usage: { type: "boolean", default: false } },
            description: "For stream: true, request that the final settled usage be included in the stream.",
          },
          provider: {
            type: "object",
            additionalProperties: false,
            required: ["only"],
            properties: {
              only: {
                type: "array",
                minItems: 1,
                maxItems: 1,
                items: { enum: providerIds },
              },
            },
            description:
              "Pin the request to one advertised route. Routing is automatic by default. There is no fallback.",
          },
          max_cost_microusd: {
            type: "integer",
            minimum: 1,
            maximum: Number.MAX_SAFE_INTEGER,
            description:
              "Reject the request before sending it upstream if the credit reservation exceeds this limit.",
          },
        },
      },
      Completion: {
        type: "object",
        required: ["id", "object", "created", "model", "choices", "usage"],
        properties: {
          id: { type: "string" },
          object: { const: "chat.completion" },
          created: { type: "number" },
          model: { type: "string" },
          sonnely_request_id: { type: "string" },
          sonnely_receipt: { $ref: "#/components/schemas/InferenceReceipt" },
          choices: {
            type: "array",
            items: {
              type: "object",
              required: ["index", "message", "finish_reason"],
              properties: {
                index: { type: "number" },
                message: {
                  type: "object",
                  required: ["role", "content"],
                  properties: {
                    role: { const: "assistant" },
                    content: { type: ["string", "null"] },
                    tool_calls: { type: "array", items: { $ref: "#/components/schemas/ToolCall" } },
                  },
                },
                finish_reason: { type: ["string", "null"] },
              },
            },
          },
          usage: {
            type: "object",
            required: ["prompt_tokens", "completion_tokens", "total_tokens"],
            properties: {
              prompt_tokens: { type: "integer" },
              completion_tokens: { type: "integer" },
              total_tokens: { type: "integer" },
              prompt_tokens_details: {
                type: ["object", "null"],
                properties: { cached_tokens: { type: ["integer", "null"] } },
              },
            },
          },
        },
      },
      InferenceReceipt: {
        type: "object",
        required: [
          "version",
          "provider",
          "requested_model",
          "provider_completion_id",
          "billing_reference",
          "charged_microusd",
          "cached_input_tokens",
          "upstream_request_sha256",
          "upstream_response_sha256",
          "evidence",
        ],
        properties: {
          version: { const: receiptVersion },
          provider: { type: "string" },
          requested_model: { type: "string" },
          reported_model: { type: "string", description: "Model label in the upstream response." },
          provider_completion_id: { type: "string" },
          billing_reference: { type: "string", description: "Reference used for provider reconciliation." },
          charged_microusd: { type: "integer", minimum: 0 },
          cached_input_tokens: { type: "integer", minimum: 0 },
          upstream_request_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          upstream_response_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          evidence: {
            description:
              "A matched signature confirms the signed byte hashes and declared signing key. It does not verify hardware attestation or model execution.",
            oneOf: [
              {
                type: "object",
                required: ["status"],
                properties: { status: { enum: ["unavailable", "payload_mismatch", "invalid_signature"] } },
              },
              {
                type: "object",
                required: [
                  "status",
                  "signature_kind",
                  "signing_algo",
                  "signing_address",
                  "signature",
                  "text",
                ],
                properties: {
                  status: { const: "signature_matched" },
                  signature_kind: { enum: ["provider_tee", "gateway"] },
                  signing_algo: { const: "ecdsa" },
                  signing_address: { type: "string" },
                  signature: { type: "string" },
                  text: { type: "string" },
                },
              },
              {
                type: "object",
                required: [
                  "status",
                  "aci_receipt_id",
                  "aci_keyset_digest",
                  "operator_route",
                  "upstream_session_id",
                ],
                properties: {
                  status: { const: "aci_payload_matched" },
                  aci_receipt_id: { type: "string" },
                  aci_keyset_digest: { type: "string" },
                  operator_route: { type: "string" },
                  upstream_session_id: { type: "string" },
                },
              },
              {
                type: "object",
                required: ["status", "config_repo", "release_digest"],
                properties: {
                  status: { const: "attested_router" },
                  config_repo: { type: "string" },
                  release_digest: { type: "string" },
                },
              },
            ],
          },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["message", "type", "code"],
            properties: {
              message: { type: "string" },
              type: { const: "sonnely_error" },
              code: { type: "integer" },
            },
          },
        },
      },
    },
  },
};

export function GET() {
  return Response.json(spec);
}
