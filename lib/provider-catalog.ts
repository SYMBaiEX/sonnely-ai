import { models } from "./models";
import { markedUpRates } from "./pricing";

import { chatRoutes, providerNames, type ProviderId } from "./provider-models";

export { providerIds, providerNames, type ProviderId } from "./provider-models";
export type Model = (typeof models)[number];

export function providerRoute(model: Model, provider: ProviderId) {
  return chatRoutes.find((route) => route.id === model.id && route.provider === provider);
}

export function agentCapabilities(model: Model, provider: ProviderId, enabled: boolean) {
  const deepseek = enabled && model.id === "deepseek-ai/DeepSeek-V4.1-Flash-1017";
  return {
    tools: deepseek && (provider === "phala" || provider === "tinfoil"),
    structured_outputs: deepseek && provider === "tinfoil",
  };
}

export function listModelRoutes(model: Model, enabled: readonly ProviderId[], agentFeatures = false) {
  return enabled.flatMap((id) => {
    const route = providerRoute(model, id);
    return route
      ? [
          {
            provider: id,
            provider_name: providerNames[id],
            upstream_model: route.upstreamModel,
            capabilities: agentCapabilities(model, id, agentFeatures),
            price_usd_per_million: markedUpRates(route),
          },
        ]
      : [];
  });
}
