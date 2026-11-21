import { models } from "./models";
import { markedUpRates } from "./pricing";

export const providerIds = ["near-ai", "phala", "tinfoil"] as const;
export type ProviderId = (typeof providerIds)[number];
export const providerNames: Record<ProviderId, string> = {
  "near-ai": "NEAR AI",
  phala: "Phala",
  tinfoil: "Tinfoil",
};

export type Model = (typeof models)[number];
type Route = { upstreamModel: string; input: number; cache: number; output: number };

const phalaRoutes: Partial<Record<Model["id"], Route>> = {
  "deepseek-ai/DeepSeek-V4.1-Flash-1017": {
    upstreamModel: "deepseek/deepseek-v4.1-flash-1017",
    input: 0.3,
    cache: 0.006,
    output: 1.2,
  },
};
const tinfoilRoutes: Partial<Record<Model["id"], Route>> = {
  "deepseek-ai/DeepSeek-V4.1-Flash-1017": {
    upstreamModel: "deepseek-v4-1-flash",
    input: 0.6,
    cache: 0.01,
    output: 1.45,
  },
};

export function providerRoute(model: Model, provider: ProviderId) {
  if (provider === "phala") return phalaRoutes[model.id];
  if (provider === "tinfoil") return tinfoilRoutes[model.id];
  return { ...model, upstreamModel: model.id };
}

export function listModelRoutes(model: Model, enabled: readonly ProviderId[]) {
  return enabled.flatMap((id) => {
    const route = providerRoute(model, id);
    return route
      ? [
          {
            provider: id,
            provider_name: providerNames[id],
            upstream_model: route.upstreamModel,
            price_usd_per_million: markedUpRates(route),
          },
        ]
      : [];
  });
}
