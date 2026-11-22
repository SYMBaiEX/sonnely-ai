import { z } from "zod";
import { limits } from "./api-contract";

const name = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const callId = z.string().min(1).max(200);
const schema = z.record(z.string(), z.json());

export const functionTool = z.strictObject({
  type: z.literal("function"),
  function: z.strictObject({
    name,
    description: z.string().max(2048).optional(),
    parameters: schema.optional(),
    strict: z.boolean().nullable().optional(),
  }),
});

export const toolChoice = z.union([
  z.enum(["auto", "none", "required"]),
  z.strictObject({ type: z.literal("function"), function: z.strictObject({ name }) }),
]);

export const toolCall = z.object({
  id: callId,
  type: z.literal("function"),
  function: z.object({ name, arguments: z.string() }),
});

export const toolDelta = z.object({
  index: z.int().nonnegative(),
  id: callId.optional(),
  type: z.literal("function").optional(),
  function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
});

export const responseFormat = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text") }),
  z.strictObject({ type: z.literal("json_object") }),
  z.strictObject({
    type: z.literal("json_schema"),
    json_schema: z.strictObject({
      name,
      description: z.string().max(2048).optional(),
      schema,
      strict: z.boolean().nullable().optional(),
    }),
  }),
]);

const text = z.string().min(1).max(limits.charactersPerMessage);
export const completionMessage = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("system"), content: text }),
  z.strictObject({ role: z.literal("user"), content: text }),
  z.strictObject({
    role: z.literal("assistant"),
    content: text.nullable().optional(),
    tool_calls: z.array(toolCall).min(1).max(16).optional(),
  }),
  z.strictObject({ role: z.literal("tool"), content: text, tool_call_id: z.string().min(1).max(200) }),
]);
