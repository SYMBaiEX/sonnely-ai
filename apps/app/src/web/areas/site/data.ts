// spec/app/models.md, "Domain"
import type {
  CatalogEntry,
  Endpoint,
  PrivacyRoute,
  ProviderId,
  RateUnit,
  Route,
} from "../../../../gen/app__models.ts";
import { markedUp } from "../../../../gen/app__models.ts";

export const apiOrigin = "https://sonnely.com";
export const apiBasePath = "/api/sonnely/v1";
export const limits = {
  bodyBytes: 36_000,
  messages: 32,
  charactersPerMessage: 12_000,
  defaultOutputTokens: 512,
  maxOutputTokens: 2_048,
} as const;
export const termsVersion = "2026-11-21";
export const markupPercent = 10;

export const providerSlugs: Record<ProviderId, string> = {
  NearAI: "near-ai",
  Phala: "phala",
  Tinfoil: "tinfoil",
};
export const providerOfSlug: Record<string, ProviderId | undefined> = {
  "near-ai": "NearAI",
  phala: "Phala",
  tinfoil: "Tinfoil",
};
export const providerNames: Record<ProviderId, string> = {
  NearAI: "NEAR AI",
  Phala: "Phala",
  Tinfoil: "Tinfoil",
};
export const providerSources: Record<ProviderId, string> = {
  NearAI: "https://near.ai/models",
  Phala: "https://phala.com/models",
  Tinfoil: "https://tinfoil.sh/models",
};

export const routeLabels: Record<PrivacyRoute, string> = {
  PrivateTee: "Private TEE",
  Private3pTee: "Private 3P TEE",
  Incognito: "Incognito",
  Unclassified: "Unclassified",
};

export const privacyDescriptions: Record<PrivacyRoute, string> = {
  PrivateTee:
    "The provider classifies model execution as running in a trusted execution environment.",
  Private3pTee:
    "The provider classifies model execution as running in a third-party trusted execution environment.",
  Incognito:
    "Incognito is a provider catalog classification. Model execution follows the upstream operator’s data handling terms.",
  Unclassified: "The provider’s privacy classification for this catalog entry is unpublished.",
};

export const endpointPaths: Record<Endpoint, string> = {
  ChatCompletions: "chat/completions",
  Responses: "responses",
  Embeddings: "embeddings",
  Rerank: "rerank",
  Systemone: "systemone",
  ImagesGenerations: "images/generations",
  ImagesEdits: "images/edits",
  AudioTranscriptions: "audio/transcriptions",
  AudioTranslations: "audio/translations",
  AudioSpeech: "audio/speech",
  ConvertFile: "convert/file",
  Redact: "redact",
  Realtime: "realtime",
};

export const workloadNames: Record<Endpoint, string> = {
  ChatCompletions: "Chat Completions",
  Responses: "Responses",
  Embeddings: "Embeddings",
  Rerank: "Reranking",
  Systemone: "System One decisions",
  ImagesGenerations: "Image generation",
  ImagesEdits: "Image editing",
  AudioTranscriptions: "Audio transcription",
  Realtime: "Realtime transcription",
  AudioTranslations: "Audio translation",
  AudioSpeech: "Speech synthesis",
  ConvertFile: "Document conversion",
  Redact: "Redaction",
};

const tinfoilDocsEndpoints: Endpoint[] = [
  "Realtime",
  "AudioTranslations",
  "ConvertFile",
  "Redact",
  "Responses",
];

export function endpointDocs(endpoint: Endpoint) {
  if (endpoint === "ChatCompletions") return "/docs/api#create-a-completion";
  if (tinfoilDocsEndpoints.includes(endpoint)) return "/docs/providers#additional-tinfoil-endpoints";
  return "/docs/providers#embeddings-decisions-images-and-audio";
}

export const rateLabels: readonly (readonly [RateUnit, string])[] = [
  ["Input", "input / 1M tokens"],
  ["Cached", "cached input / 1M tokens"],
  ["Output", "output / 1M tokens"],
  ["PerRequest", "per request"],
  ["PerSession", "per session"],
];

export const contextFormat = new Intl.NumberFormat("en");
const rateFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 5,
});

// spec/app/models.md, "Rates are upstream micro-dollars"
export const formatRate = (micros: number) => "$" + rateFormat.format(markedUp(micros) / 1_000_000);

const scaleBig = BigInt(1_000_000);

export function creditDecimal(micros: number, minimumDecimals = 0) {
  const units = BigInt(micros);
  const whole = units / scaleBig;
  const fraction = (units % scaleBig)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(minimumDecimals, "0");
  return whole + (fraction ? "." + fraction : "");
}

export const creditBalance = (micros: number) => "$" + creditDecimal(micros, 2);

export function requestCharge(
  rates: Partial<Record<RateUnit, number>>,
  input: number,
  cached: number,
  output: number,
) {
  const micros =
    (input - cached) * markedUp(rates.Input ?? 0) +
    cached * markedUp(rates.Cached ?? rates.Input ?? 0) +
    output * markedUp(rates.Output ?? 0);
  return Math.ceil(micros / 1_000_000);
}

export function modelDetailHref({ provider, upstreamId }: Pick<CatalogEntry, "provider" | "upstreamId">) {
  return (
    "/models/" +
    providerSlugs[provider] +
    "/" +
    upstreamId
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")
  );
}

export function modelPlaygroundHref(model: string, provider: ProviderId) {
  return `/console/chat?${new URLSearchParams({ model, provider: providerSlugs[provider] })}`;
}

export function routeRates(route: Route): Partial<Record<RateUnit, number>> {
  const rates: Partial<Record<RateUnit, number>> = {};
  for (const rate of route.rates) rates[rate.unit] = rate.micros;
  return rates;
}

const upstreamWorkloads: Record<string, Endpoint[]> = {
  text: ["ChatCompletions"],
  embedding: ["Embeddings"],
  reranking: ["Rerank"],
  decisions: ["Systemone"],
  image: ["ImagesGenerations", "ImagesEdits"],
  transcription: ["AudioTranscriptions"],
};

export function upstreamEndpoints(workload: string): string[] {
  return workload
    .split(",")
    .map((item) => item.trim().replace(/^\//, ""));
}

export function upstreamCoversEndpoint(workload: string, endpoint: Endpoint) {
  return upstreamEndpoints(workload).some(
    (name) =>
      name === endpointPaths[endpoint] || upstreamWorkloads[name]?.includes(endpoint) === true,
  );
}

const endpointOfPath: Record<string, Endpoint | undefined> = Object.fromEntries(
  Object.entries(endpointPaths).map(([endpoint, path]) => [path, endpoint as Endpoint]),
);

export function upstreamWorkloadLabel(workload: string) {
  return upstreamEndpoints(workload)
    .map((name) => {
      const endpoint = endpointOfPath[name];
      if (endpoint) return workloadNames[endpoint];
      return name === "text" ? "Text" : name;
    })
    .join(", ");
}

export const featuredUpstreamIds = [
  "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  "z-ai/glm-5.3-flash",
  "Qwen/Qwen3.6-35B-A3B-FP8",
  "Qwen/Qwen3.8-27B",
  "Qwen/Qwen3-VL-30B-A3B-Instruct",
] as const;

export const featuredTypes: Record<string, { type: string; context: string }> = {
  "deepseek-ai/DeepSeek-V4.1-Flash-1017": { type: "General", context: "1.05M" },
  "z-ai/glm-5.3-flash": { type: "Fast", context: "1.05M" },
  "Qwen/Qwen3.6-35B-A3B-FP8": { type: "Coding", context: "262K" },
  "Qwen/Qwen3.8-27B": { type: "Reasoning", context: "262K" },
  "Qwen/Qwen3-VL-30B-A3B-Instruct": { type: "General", context: "16K" },
};

export const workloadGuide = {
  General: "Summarize notes or synthesize findings across several short excerpts.",
  Fast: "Extract fields, tag documents, or classify brief requests.",
  Coding:
    "Explain a function, review a short diff, or draft structured text for a developer workflow.",
  Reasoning:
    "Compare alternatives, work through a multi-step problem, or analyze a long document.",
} as const;

export const computeFee = 10_000;
export const computeMarkup = 25;
export const artifactLimit = 5 * 1024 * 1024;
export const computeRetentionDays = 7;
export const imagePattern =
  /^(?:docker\.io|ghcr\.io)\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*){0,4}@sha256:[0-9a-f]{64}$/;
export const repositoryPattern = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
export const revisionPattern = /^[0-9a-f]{40}$/i;

export const blackboxMachineIds = ["tdx.small", "tdx.medium", "tdx.large"] as const;
export type BlackboxMachine = (typeof blackboxMachineIds)[number];
export const blackboxMachines = {
  "tdx.small": { name: "Small", cpu: 1, ram: 2, hourlyCompute: 58_000 },
  "tdx.medium": { name: "Medium", cpu: 2, ram: 4, hourlyCompute: 116_000 },
  "tdx.large": { name: "Large", cpu: 4, ram: 8, hourlyCompute: 232_000 },
} as const;
export const blackboxDiskSizes = [20, 40, 80] as const;
export type BlackboxDisk = (typeof blackboxDiskSizes)[number];
export const defaultBlackboxMachine: BlackboxMachine = "tdx.small";
export const defaultBlackboxDisk: BlackboxDisk = 20;
export const blackboxDiskHourlyRate = 139;

export function blackboxHourlyBase(
  machine: BlackboxMachine = defaultBlackboxMachine,
  disk: BlackboxDisk = defaultBlackboxDisk,
) {
  return blackboxMachines[machine].hourlyCompute + disk * blackboxDiskHourlyRate;
}

export function blackboxSize(
  machine: BlackboxMachine = defaultBlackboxMachine,
  disk: BlackboxDisk = defaultBlackboxDisk,
) {
  const { cpu, ram } = blackboxMachines[machine];
  return `${cpu} vCPU · ${ram} GB RAM · ${disk} GB SSD`;
}

export const computePlans = {
  blackboxes: {
    title: "Blackboxes",
    provider: "Confidential cloud",
    size: blackboxSize(),
    hourlyBase: blackboxHourlyBase(),
    unitSeconds: 60,
    minutes: [15, 30, 60, 120],
  },
  "dry-docks": {
    title: "Dry Docks",
    provider: "Boat",
    size: "2 vCPU · 4 GB RAM",
    hourlyBase: 18_000,
    unitSeconds: 1,
    minutes: [5, 10, 15],
  },
} as const;

export type ComputeKind = keyof typeof computePlans;

export function computePrice(hourlyBase: number, unitSeconds: number, seconds: number) {
  const units = Math.ceil(seconds / unitSeconds);
  const base = Math.ceil((hourlyBase * units * unitSeconds) / 3600);
  const fee = units ? computeFee + Math.ceil((base * computeMarkup) / 100) : 0;
  return { base, fee, total: base + fee };
}

export const computeQuote = (kind: ComputeKind, minutes: number) =>
  computePrice(computePlans[kind].hourlyBase, computePlans[kind].unitSeconds, minutes * 60);
