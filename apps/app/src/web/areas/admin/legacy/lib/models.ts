// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { chatRoutes } from "./provider-models.ts";

export const featuredModels = [
  {
    id: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    name: "DeepSeek V4.1 Flash",
    tier: "confidential",
    privacyRoute: "private-tee",
    provider: "near-ai",
    type: "General",
    context: "1.05M",
    input: 0.3,
    output: 1.2,
    cache: 0.006,
    mark: "D",
    color: "pearl",
    summary: "General-purpose reasoning and long document workflows.",
  },
  {
    id: "z-ai/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    tier: "confidential",
    privacyRoute: "private-tee",
    provider: "near-ai",
    type: "Fast",
    context: "1.05M",
    input: 0.08,
    output: 0.5,
    cache: 0.012,
    mark: "G",
    color: "signal-mark",
    summary: "Fast classification, extraction and short replies.",
  },
  {
    id: "Qwen/Qwen3.6-35B-A3B-FP8",
    name: "Qwen 3.6 35B",
    tier: "confidential",
    privacyRoute: "private-tee",
    provider: "near-ai",
    type: "Coding",
    context: "262K",
    input: 0.17,
    output: 1.1,
    cache: 0.056,
    mark: "Q",
    color: "smoke",
    summary: "Code explanation, structured output and multilingual text.",
  },
  {
    id: "Qwen/Qwen3.8-27B",
    name: "Qwen 3.8 27B",
    tier: "confidential",
    privacyRoute: "private-tee",
    provider: "near-ai",
    type: "Reasoning",
    context: "262K",
    input: 0.04,
    output: 1.35,
    cache: 0.018,
    mark: "Q",
    color: "pearl",
    summary: "Long-context reasoning, coding, and text analysis.",
  },
  {
    id: "Qwen/Qwen3-VL-30B-A3B-Instruct",
    name: "Qwen3 VL 30B Instruct",
    tier: "confidential",
    privacyRoute: "private-tee",
    provider: "near-ai",
    type: "General",
    context: "16K",
    input: 0.15,
    output: 0.55,
    cache: 0.03,
    mark: "Q",
    color: "smoke",
    summary: "Instruction following and document analysis through Sonnely’s text endpoint.",
  },
] as const;
const listed = new Set<string>(featuredModels.map(({ id }) => id));
const extraModels = chatRoutes.flatMap((route) => {
  if (listed.has(route.id)) return [];
  listed.add(route.id);
  return [
    {
      ...route,
      tier: "confidential",
      type: "General" as const,
      context: route.context
        ? Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(route.context)
        : "—",
      mark: route.name.match(/[a-z0-9]/i)?.[0].toUpperCase() ?? "•",
      color: "smoke",
      summary: "",
    },
  ];
});

export const models = [...featuredModels, ...extraModels];
export const usd = (micros: number) =>
  "$" + (micros / 1_000_000).toFixed(micros > 0 && micros < 10_000 ? 6 : 2);
export const shorten = (wallet: string) => wallet.slice(0, 4) + "…" + wallet.slice(-4);
