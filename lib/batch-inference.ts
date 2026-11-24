import { z } from "zod";
import { apiBasePath, limits } from "./api-contract";
import { completionMessage, functionTool, responseFormat, toolChoice } from "./inference-tools";
import { models } from "./models";
import { agentCapabilities, providerIds, providerRoute, type ProviderId } from "./provider-catalog";
import { requestCharge } from "./pricing";

export const batchLimits = { rows: 200, bytes: 4 * 1024 * 1024, delayMs: 5000 } as const;
export const batchEndpoint = "/v1/chat/completions";
export const batchKeyPattern =
  /^batch:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:\d{1,3}$/;

const pin = z.strictObject({ only: z.tuple([z.enum(providerIds)]) });
const batchBody = z.strictObject({
  model: z.string().min(1).max(100),
  messages: z.array(completionMessage).min(1).max(limits.messages),
  max_tokens: z.int().min(1).max(limits.maxOutputTokens).optional(),
  max_cost_microusd: z.int().positive().optional(),
  provider: pin.optional(),
  stream: z.literal(false).optional(),
  tools: z.array(functionTool).min(1).max(16).optional(),
  tool_choice: toolChoice.optional(),
  response_format: responseFormat.optional(),
});

export const batchRequestBody = batchBody.extend({ provider: pin, max_cost_microusd: z.int().positive() });
export type BatchRequestBody = z.infer<typeof batchRequestBody>;
const inputLine = z.strictObject({
  custom_id: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\p{Cc}]+$/u),
  method: z.literal("POST"),
  url: z.enum([batchEndpoint, apiBasePath + "/chat/completions", "/chat/completions"]),
  body: batchBody,
});

export const batchStatuses = [
  "queued",
  "sending",
  "succeeded",
  "failed",
  "blocked",
  "interrupted",
  "review",
] as const;

export const batchRowSchema = z.object({
  customId: z.string(),
  body: batchRequestBody,
  estimatedMaximum: z.int().nonnegative(),
  status: z.enum(batchStatuses),
  detail: z.string().optional(),
  reference: z.string().optional(),
  httpStatus: z.int().optional(),
  output: z.unknown().optional(),
});

export const batchJobSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  filename: z.string(),
  createdAt: z.int(),
  lastSentAt: z.int().optional(),
  rows: z.array(batchRowSchema).min(1).max(batchLimits.rows),
});

export type BatchRow = z.infer<typeof batchRowSchema>;
export type BatchJob = z.infer<typeof batchJobSchema>;
export type BatchIssue = { line: number; detail: string };
export type BatchPreflight = { rows: BatchRow[]; issues: BatchIssue[]; issueCount: number };

const utf8 = new TextEncoder();

function prepareBatchLine(
  value: unknown,
  available: readonly ProviderId[],
  agentFeatures: boolean,
): { row: BatchRow } | { issue: string } {
  const record = inputLine.safeParse(value);
  if (!record.success) {
    const path = record.error.issues[0]?.path.join(".");
    return {
      issue: path ? "Check " + path + " for a nonstreaming chat request." : "Expected a JSONL chat request.",
    };
  }
  const { custom_id: customId, body } = record.data;
  const model = models.find((item) => item.id === body.model);
  if (!model) return { issue: "The model is not in the Sonnely chat catalog." };
  const requested = body.provider?.only[0];
  const provider =
    requested ??
    (available.includes(model.provider)
      ? model.provider
      : available.find((candidate) => providerRoute(model, candidate)));
  const route = provider && available.includes(provider) ? providerRoute(model, provider) : undefined;
  if (!provider || !route) return { issue: "No available route matches this model and provider." };

  const capabilities = agentCapabilities(model, provider, agentFeatures);
  const usesTools =
    body.tools ||
    body.tool_choice !== undefined ||
    body.messages.some((item) => item.role === "tool" || (item.role === "assistant" && item.tool_calls));
  if (usesTools && !capabilities.tools) return { issue: "Tool calls are unavailable on this route." };
  if (body.response_format && body.response_format.type !== "text" && !capabilities.structured_outputs)
    return { issue: "Structured output is unavailable on this route." };
  if (body.tool_choice && !body.tools) return { issue: "tool_choice requires tools." };
  if (body.messages.some((item) => item.role === "assistant" && !item.content && !item.tool_calls))
    return { issue: "Assistant messages require content or tool calls." };

  const shape = { tools: body.tools, tool_choice: body.tool_choice, response_format: body.response_format };
  const bytes =
    utf8.encode(JSON.stringify(body.messages)).length +
    (body.tools || body.tool_choice || body.response_format ? utf8.encode(JSON.stringify(shape)).length : 0);
  const estimatedMaximum = requestCharge(
    route,
    bytes + 256,
    0,
    body.max_tokens ?? limits.defaultOutputTokens,
  );
  if (body.max_cost_microusd !== undefined && estimatedMaximum > body.max_cost_microusd)
    return { issue: "The reservation estimate exceeds max_cost_microusd." };
  const request: BatchRequestBody = {
    ...body,
    provider: { only: [provider] },
    max_cost_microusd: body.max_cost_microusd ?? Math.max(1, estimatedMaximum),
  };
  if (utf8.encode(JSON.stringify(request)).length > limits.bodyBytes)
    return { issue: "The request exceeds Sonnely’s per-request body limit." };
  return { row: { customId, body: request, estimatedMaximum, status: "queued" } };
}

export function preflightBatch(
  text: string,
  available: readonly ProviderId[],
  agentFeatures: boolean,
): BatchPreflight {
  const rows: BatchRow[] = [];
  const issues: BatchIssue[] = [];
  const ids = new Set<string>();
  let issueCount = 0;
  const reject = (line: number, detail: string) => {
    issueCount++;
    if (issues.length < 12) issues.push({ line, detail });
  };
  if (utf8.encode(text).length > batchLimits.bytes) {
    reject(0, "Choose a file up to 4 MiB.");
    return { rows, issues, issueCount };
  }
  let inputCount = 0;
  for (const [index, raw] of text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    if (!raw.trim()) continue;
    const line = index + 1;
    if (++inputCount > batchLimits.rows) {
      reject(line, "Split this file into batches of at most 200 requests.");
      break;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      reject(line, "Expected one complete JSON object on this line.");
      continue;
    }
    const result = prepareBatchLine(data, available, agentFeatures);
    if ("issue" in result) {
      reject(line, result.issue);
    } else if (ids.has(result.row.customId)) {
      reject(line, "Each custom_id must be unique.");
    } else {
      ids.add(result.row.customId);
      rows.push(result.row);
    }
  }
  if (inputCount === 0) reject(0, "The file contains no requests.");
  return { rows, issues, issueCount };
}

export function batchExport(job: BatchJob, kind: "results" | "needs-attention") {
  const rows = job.rows.flatMap((row) => {
    const succeeded = row.status === "succeeded";
    if ((kind === "results") !== succeeded) return [];
    return [
      JSON.stringify({
        custom_id: row.customId,
        status: row.status === "sending" ? "interrupted" : row.status,
        request_id: row.reference ?? null,
        response: succeeded ? { status_code: row.httpStatus, body: row.output } : null,
        error: succeeded ? null : { status_code: row.httpStatus ?? null, message: row.detail ?? null },
      }),
    ];
  });
  return rows.length ? rows.join("\n") + "\n" : "";
}
