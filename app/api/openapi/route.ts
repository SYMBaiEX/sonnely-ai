import { apiBasePath, apiOrigin, limits } from "@/lib/api-contract";
import { models } from "@/lib/models";

const jsonSchema = (schema: string) => ({
  "application/json": { schema: { $ref: "#/components/schemas/" + schema } },
});

const errors = Object.fromEntries(
  [
    [400, "Invalid request or unsupported parameters"],
    [401, "A valid Sonnely API key is required"],
    [402, "Insufficient credits or API key budget"],
    [403, "Current terms must be accepted"],
    [404, "Model is outside the Sonnely catalog"],
    [413, "Request exceeds the body size limit"],
    [415, "Use application/json"],
    [429, "Wallet request limit reached"],
    [500, "Sonnely could not complete the request"],
    [502, "Provider failure or incomplete usage"],
    [503, "Managed inference is unavailable"],
  ].map(([code, description]) => [code, { description, content: jsonSchema("Error") }]),
);

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Sonnely Inference API",
    version: "1.0.0",
    description:
      "Confidential text inference through NEAR AI, metered in compute credits funded with Solana mainnet USDC.",
  },
  servers: [
    { url: apiOrigin + apiBasePath },
    { url: apiOrigin + "/v1", description: "Compatibility base URL" },
  ],
  paths: {
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
        summary: "Generate a non-streaming text completion",
        security: [{ SonnelyKey: [] }],
        description:
          "Use a key from the console with available credits. The JSON body is limited to " +
          limits.bodyBytes +
          " bytes.",
        requestBody: { required: true, content: jsonSchema("CompletionRequest") },
        responses: {
          200: { description: "Text completion and token usage", content: jsonSchema("Completion") },
          ...errors,
        },
      },
    },
  },
  components: {
    securitySchemes: { SonnelyKey: { type: "http", scheme: "bearer", bearerFormat: "Sonnely API key" } },
    schemas: {
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
              },
            },
          },
        },
      },
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
            items: {
              type: "object",
              required: ["role", "content"],
              additionalProperties: false,
              properties: {
                role: { enum: ["system", "user", "assistant"] },
                content: { type: "string", minLength: 1, maxLength: limits.charactersPerMessage },
              },
            },
          },
          max_tokens: {
            type: "integer",
            minimum: 1,
            maximum: limits.maxOutputTokens,
            default: limits.defaultOutputTokens,
          },
          stream: { const: false },
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
