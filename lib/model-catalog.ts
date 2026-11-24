import type { PrivacyRoute } from "./model-privacy";
import { featuredModels } from "./models";
import { markedUpRates, markupPercent } from "./pricing";
import { chatRoutes, providerCatalog, providerIds, type ProviderId } from "./provider-models";
import {
  realtimeModel,
  specializedModels,
  type SpecializedEndpoint,
  type specializedRoute,
} from "./specialized-models";

export type ModelCatalogEndpoint = "chat/completions" | SpecializedEndpoint | "realtime";

export type ModelCatalogRates = Readonly<{
  input?: number;
  cache?: number;
  output?: number;
  request?: number;
  session?: number;
}>;

export type ModelCatalogRoute = Readonly<{
  endpoint: ModelCatalogEndpoint;
  modelId: string;
  rates: ModelCatalogRates;
}>;

export type ModelCatalogEntry = Readonly<{
  provider: ProviderId;
  upstreamId: string;
  name: string;
  privacyRoute: PrivacyRoute;
  context: number | null;
  workload: string;
  summary?: string;
  mark?: string;
  color?: string;
  routes: readonly ModelCatalogRoute[];
}>;

type EntryDraft = Omit<ModelCatalogEntry, "routes"> & { routes: ModelCatalogRoute[] };

function markedUpRequestRate(rate: number) {
  return Math.round(rate * (100 + markupPercent) * 10_000) / 1_000_000;
}

function buildCatalog(): readonly ModelCatalogEntry[] {
  const entries: EntryDraft[] = providerIds.flatMap((provider) =>
    providerCatalog.providers[provider].map((model) => {
      const chat = chatRoutes.find(
        (route) => route.provider === provider && route.upstreamModel === model.id,
      );
      const featured = featuredModels.find((item) => item.provider === provider && item.id === chat?.id);
      return {
        provider,
        upstreamId: model.id,
        name: featured?.name ?? model.name,
        privacyRoute: model.route,
        context: model.context,
        workload: model.workload,
        ...(featured && { summary: featured.summary, mark: featured.mark, color: featured.color }),
        routes: chat ? [{ endpoint: "chat/completions", modelId: chat.id, rates: markedUpRates(chat) }] : [],
      };
    }),
  );

  function addRoute(provider: ProviderId, route: ModelCatalogRoute) {
    const entry =
      entries.find((item) => item.provider === provider && item.upstreamId === route.modelId) ??
      entries.find(
        (item) =>
          item.provider === provider &&
          item.routes.some((chat) => chat.endpoint === "chat/completions" && chat.modelId === route.modelId),
      );

    if (entry) {
      entry.routes.push(route);
      return;
    }
    // A newly routed model can precede the next upstream inventory snapshot.
    entries.push({
      provider,
      upstreamId: route.modelId,
      name: route.modelId,
      privacyRoute: "unclassified",
      context: null,
      workload: route.endpoint,
      routes: [route],
    });
  }

  const specialized: Record<
    SpecializedEndpoint,
    Record<string, NonNullable<ReturnType<typeof specializedRoute>>>
  > = specializedModels;
  for (const endpoint of Object.keys(specialized) as SpecializedEndpoint[]) {
    for (const [modelId, { provider, rate, outputRate, requestRate, unit }] of Object.entries(
      specialized[endpoint],
    )) {
      const tokens = markedUpRates({ input: rate, cache: 0, output: outputRate ?? 0 });
      const rates =
        unit === "request"
          ? { request: markedUpRequestRate(rate) }
          : {
              input: tokens.input,
              ...(outputRate !== undefined && { output: tokens.output }),
              ...(requestRate !== undefined && { request: markedUpRequestRate(requestRate) }),
            };
      addRoute(provider, { endpoint, modelId, rates });
    }
  }

  addRoute(realtimeModel.provider, {
    endpoint: "realtime",
    modelId: realtimeModel.id,
    rates: { session: markedUpRequestRate(realtimeModel.rate) },
  });

  return entries;
}

export const modelCatalogEntries = buildCatalog();

export function countRunnableModels(providers: readonly ProviderId[]) {
  const configured = new Set(providers);
  return new Set(
    modelCatalogEntries.flatMap((entry) =>
      configured.has(entry.provider) ? entry.routes.map((route) => route.modelId) : [],
    ),
  ).size;
}
