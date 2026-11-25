import { catalog, type CatalogModel, type ModelRoute } from "../../../../gen/app__console__catalog.ts";

export const providerIds = ["near-ai", "phala", "tinfoil"] as const;
export type ProviderId = (typeof providerIds)[number];

export const providerNames: Record<ProviderId, string> = {
  "near-ai": "NEAR AI",
  phala: "Phala",
  tinfoil: "Tinfoil",
};

export type ChatRoute = Pick<ModelRoute, "modelId" | "input" | "cache" | "output"> & {
  provider: ProviderId;
  context: number;
  privacyRoute: string;
};

export type ChatModel = {
  id: string;
  name: string;
  mark: string;
  type: string;
  context: number;
  routes: ChatRoute[];
};

export type SpecializedRoute = ModelRoute & {
  provider: ProviderId;
  privacyRoute: string;
  name: string;
};

const typeById: Record<string, string> = {
  "deepseek-ai/DeepSeek-V4.1-Flash-1017": "General",
  "z-ai/glm-5.3-flash": "Fast",
  "Qwen/Qwen3.6-35B-A3B-FP8": "Coding",
  "Qwen/Qwen3.8-27B": "Reasoning",
  "Qwen/Qwen3-VL-30B-A3B-Instruct": "General",
};

const featuredOrder = [
  "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  "z-ai/glm-5.3-flash",
  "Qwen/Qwen3.6-35B-A3B-FP8",
  "Qwen/Qwen3.8-27B",
  "Qwen/Qwen3-VL-30B-A3B-Instruct",
];

function isProviderId(value: string): value is ProviderId {
  return (providerIds as readonly string[]).includes(value);
}

function routeFor(entry: CatalogModel, route: ModelRoute): ChatRoute | undefined {
  if (!isProviderId(entry.provider)) return undefined;
  return {
    provider: entry.provider,
    modelId: route.modelId,
    input: route.input,
    cache: route.cache,
    output: route.output,
    context: entry.context,
    privacyRoute: entry.route,
  };
}

function buildModels() {
  const byId = new Map<string, ChatModel>();
  for (const entry of catalog) {
    for (const route of entry.routes) {
      if (route.endpoint !== "chat/completions") continue;
      const chatRoute = routeFor(entry, route);
      if (!chatRoute) continue;
      const existing = byId.get(route.modelId);
      if (existing) {
        if (!existing.routes.some((item) => item.provider === chatRoute.provider)) existing.routes.push(chatRoute);
        continue;
      }
      byId.set(route.modelId, {
        id: route.modelId,
        name: entry.name || route.modelId,
        mark: entry.mark || route.modelId.match(/[a-z0-9]/i)?.[0]?.toUpperCase() || "•",
        type: typeById[route.modelId] ?? "General",
        context: entry.context,
        routes: [chatRoute],
      });
    }
  }
  return [...byId.values()].sort((a, b) => {
    const first = featuredOrder.indexOf(a.id);
    const second = featuredOrder.indexOf(b.id);
    if (first >= 0 || second >= 0) return (first < 0 ? featuredOrder.length : first) - (second < 0 ? featuredOrder.length : second);
    return 0;
  });
}

export const models = buildModels();

export function providerRoute(model: ChatModel, provider: ProviderId) {
  return model.routes.find((route) => route.provider === provider);
}

export function privateFailoverProviders(model: ChatModel, configured: readonly ProviderId[]) {
  return configured.filter((provider) => providerRoute(model, provider)?.privacyRoute === "private-tee");
}

export const contextFormat = new Intl.NumberFormat("en");

export function formatRate(micros: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(micros / 1_000_000);
}

export function specializedRoutes(endpoint: string) {
  const found = new Map<string, SpecializedRoute>();
  for (const entry of catalog) {
    if (!isProviderId(entry.provider)) continue;
    for (const route of entry.routes) {
      if (route.endpoint !== endpoint || found.has(route.modelId)) continue;
      found.set(route.modelId, { ...route, provider: entry.provider, privacyRoute: entry.route, name: entry.name });
    }
  }
  return [...found.values()];
}
