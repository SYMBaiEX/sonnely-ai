import type { ProviderId } from "./provider-models";

export const specializedModels = {
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
  Record<string, { provider: ProviderId; rate: number; outputRate?: number; unit?: "request" }>
>;

export type SpecializedEndpoint = keyof typeof specializedModels;

export function specializedRoute(endpoint: SpecializedEndpoint, model: string) {
  const routes: Record<
    string,
    { provider: "near-ai" | "tinfoil"; rate: number; outputRate?: number; unit?: "request" }
  > = specializedModels[endpoint];
  return Object.hasOwn(routes, model) ? routes[model] : undefined;
}

export function isSpecializedMultipart(endpoint: string) {
  return endpoint === "audio/transcriptions" || endpoint === "images/edits";
}
