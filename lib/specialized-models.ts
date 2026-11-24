import type { ProviderId } from "./provider-models";

export const realtimeModel = { id: "voxtral-mini-4b-realtime", provider: "tinfoil", rate: 0.002 } as const;

export const specializedModels = {
  "audio/translations": {
    "voxtral-small-24b": { provider: "tinfoil", rate: 0.2, outputRate: 0.6 },
  },
  "convert/file": {
    "doc-upload": { provider: "tinfoil", rate: 0.05, unit: "request" },
  },
  redact: {
    "pii-filter": { provider: "tinfoil", rate: 0.8, requestRate: 0.0002 },
  },
  responses: {
    "deepseek-ai/DeepSeek-V4.1-Flash-1017": { provider: "tinfoil", rate: 0.6, outputRate: 1.45 },
    "z-ai/glm-5.3": { provider: "tinfoil", rate: 1.8, outputRate: 5.75 },
    "tinfoil/inkling-2-small": { provider: "tinfoil", rate: 0.3, outputRate: 1 },
    "tinfoil/kimi-k3-1-pro": { provider: "tinfoil", rate: 4, outputRate: 20 },
    "tinfoil/gemma4-31b": { provider: "tinfoil", rate: 0.4, outputRate: 1 },
    "tinfoil/gpt-oss-120b": { provider: "tinfoil", rate: 0.15, outputRate: 0.6 },
  },
  "audio/transcriptions": {
    "whisper-large-v3-turbo": { provider: "tinfoil", rate: 0.01, unit: "request" },
  },
  "audio/speech": {
    "voxtral-tts": { provider: "tinfoil", rate: 0.002, unit: "request" },
  },
  "images/edits": {
    "black-forest-labs/FLUX.2-klein-4B": { provider: "near-ai", rate: 0.012, unit: "request" },
  },
  systemone: {
    "levanto/sage-2": { provider: "near-ai", rate: 0.07, outputRate: 2 },
  },
  embeddings: {
    "Qwen/Qwen3-Embedding-0.6B": { provider: "near-ai", rate: 0.01 },
    "nomic-embed-text": { provider: "tinfoil", rate: 0.016 },
  },
  rerank: {
    "Qwen/Qwen3-Reranker-0.6B": { provider: "near-ai", rate: 0.01 },
  },
  "images/generations": {
    "black-forest-labs/FLUX.2-klein-4B": { provider: "near-ai", rate: 0.012, unit: "request" },
  },
} satisfies Record<
  string,
  Record<
    string,
    { provider: ProviderId; rate: number; outputRate?: number; requestRate?: number; unit?: "request" }
  >
>;

export type SpecializedEndpoint = keyof typeof specializedModels;

export function specializedRoute(endpoint: SpecializedEndpoint, model: string) {
  const routes: Record<
    string,
    {
      provider: "near-ai" | "tinfoil";
      rate: number;
      outputRate?: number;
      requestRate?: number;
      unit?: "request";
    }
  > = specializedModels[endpoint];
  return Object.hasOwn(routes, model) ? routes[model] : undefined;
}

export function isSpecializedMultipart(endpoint: string) {
  return (
    endpoint === "audio/transcriptions" ||
    endpoint === "audio/translations" ||
    endpoint === "images/edits" ||
    endpoint === "convert/file"
  );
}
