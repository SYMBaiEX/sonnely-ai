import { z } from "zod";
import { limits } from "./api-contract";

const text = z
  .string()
  .min(1)
  .max(limits.charactersPerMessage)
  .refine((value) => value.trim().length > 0);
const requestFields = {
  model: z.string().min(1).max(100),
  max_cost_microusd: z.int().positive().optional(),
};
const embeddings = z.strictObject({
  ...requestFields,
  input: z.union([text, z.array(text).min(1).max(16)]),
  encoding_format: z.literal("float").optional(),
});
const rerank = z.strictObject({
  ...requestFields,
  query: text,
  documents: z.array(text).min(1).max(16),
  top_n: z.int().min(1).max(16).optional(),
});
const images = z.strictObject({
  ...requestFields,
  prompt: text,
  n: z.literal(1).optional(),
  size: z.literal("512x512").optional(),
  response_format: z.literal("b64_json").optional(),
});
export const specializedRequests = {
  "audio/translations": z.strictObject({
    ...requestFields,
    file: z.file().min(44).max(960_044).mime(["audio/wav", "audio/x-wav"]),
  }),
  "convert/file": z.strictObject({
    ...requestFields,
    files: z.file().min(5).max(2_000_000).mime(["application/pdf"]),
  }),
  redact: z.strictObject({
    ...requestFields,
    text: text.refine((value) => new TextEncoder().encode(value).length <= 4096),
  }),
  responses: z.strictObject({
    ...requestFields,
    input: text,
    instructions: text.optional(),
    max_output_tokens: z.int().min(16).max(limits.maxOutputTokens).optional(),
    stream: z.literal(false).optional(),
    store: z.literal(false).optional(),
  }),
  "audio/transcriptions": z.strictObject({
    ...requestFields,
    file: z
      .file()
      .min(1)
      .max(2_000_000)
      .mime(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "audio/flac"]),
  }),
  "audio/speech": z.strictObject({
    ...requestFields,
    input: text.pipe(z.string().max(1000)),
    voice: z.literal("neutral_female").optional(),
    response_format: z.literal("wav").optional(),
  }),
  "images/edits": z.strictObject({
    ...requestFields,
    image: z.file().min(1).max(2_000_000).mime(["image/png", "image/jpeg", "image/webp"]),
    prompt: text,
    size: z.literal("512x512").optional(),
    response_format: z.literal("b64_json").optional(),
  }),
  systemone: z.strictObject({
    ...requestFields,
    state: text,
    questions: z
      .record(
        z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
        z.strictObject({ type: z.literal("noul"), instructions: text }),
      )
      .refine((questions) => Object.keys(questions).length >= 1 && Object.keys(questions).length <= 8),
  }),
  embeddings,
  rerank,
  "images/generations": images,
};
