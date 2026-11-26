// spec/app/models.md, "Story: Filter the catalog"
import {
  catalog,
  type CatalogEntry,
  type Endpoint,
  type ProviderId,
  type RateUnit,
  type Route,
} from "../../../../gen/app__models.ts";
import {
  apiBasePath,
  endpointDocs,
  endpointPaths,
  formatRate,
  modelDetailHref,
  modelPlaygroundHref,
  providerNames,
  providerSlugs,
  routeLabels,
  routeRates,
  upstreamWorkloadLabel,
  workloadNames,
} from "./data.ts";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { groupCatalog } from "./catalog-groups.ts";
import type { CatalogDisplayEntry, CatalogRateKind, CatalogStatus } from "./catalog-cards.tsx";

const rateKinds: Record<RateUnit, CatalogRateKind> = {
  Input: "input",
  Cached: "cache",
  Output: "output",
  PerRequest: "request",
  PerSession: "session",
};

const rateDescriptions: Record<RateUnit, string> = {
  Input: "input / 1M tokens",
  Cached: "cached input / 1M tokens",
  Output: "output / 1M tokens",
  PerRequest: "per request",
  PerSession: "per session",
};

const rateOrder: readonly RateUnit[] = ["Input", "Cached", "Output", "PerRequest", "PerSession"];

function displayEntry(model: CatalogEntry): CatalogDisplayEntry {
  const key = model.provider + "/" + model.upstreamId;
  return {
    key,
    provider: model.provider,
    upstreamId: model.upstreamId,
    name: model.name,
    workload: model.workload,
    summary: model.summary,
    context: model.context,
    mark: model.mark,
    providerName: providerNames[model.provider],
    privacyLabel: routeLabels[model.privacy],
    workloadLabel: upstreamWorkloadLabel(model.workload),
    detailHref: modelDetailHref(model),
    status: model.routes.length
      ? { label: "Routed", tone: "info" }
      : { label: "Catalog only", tone: "muted" },
    routes: model.routes.map((route) => {
      const rates = routeRates(route);
      return {
        endpoint: route.endpoint,
        endpointLabel: workloadNames[route.endpoint],
        endpointPath: endpointPaths[route.endpoint],
        docsHref: endpointDocs(route.endpoint),
        modelId: route.modelId,
        chatHref: route.endpoint === "ChatCompletions" ? modelPlaygroundHref(route.modelId, model.provider) : undefined,
        rates: rateOrder.flatMap((unit) => {
          const value = rates[unit];
          return value === undefined || value < 0
            ? []
            : [{ kind: rateKinds[unit], label: rateDescriptions[unit], value, text: formatRate(value) }];
        }),
      };
    }),
  };
}

export const canonicalGroups = groupCatalog(catalog.map(displayEntry));

export const chatModels = catalog.filter((entry) =>
  entry.routes.some((route) => route.endpoint === "ChatCompletions"),
);

export function chatModelRoute(entry: CatalogEntry): Route | undefined {
  return entry.routes.find((route) => route.endpoint === "ChatCompletions");
}

export const endpointIds = Object.keys(workloadNames) as Endpoint[];

const liveModelsSchema = z.looseObject({
  data: z.array(z.looseObject({
    id: z.string(),
    sonnely: z.looseObject({ routes: z.array(z.looseObject({ provider: z.string() })) }),
  })),
});

const liveInventorySchema = z.looseObject({ providers: z.array(z.string()) });

export interface LiveAvailability {
  readonly loaded: boolean;
  readonly chatModelIds: ReadonlySet<string>;
  readonly providers: ReadonlySet<string>;
}

const unloaded: LiveAvailability = { loaded: false, chatModelIds: new Set(), providers: new Set() };
let liveSnapshot: LiveAvailability = unloaded;
const liveListeners = new Set<() => void>();
let liveRequested = false;

async function loadAvailability() {
  try {
    const [modelsAnswer, inventoryAnswer] = await Promise.all([
      fetch(apiBasePath + "/models"),
      fetch(apiBasePath + "/provider-models"),
    ]);
    if (!modelsAnswer.ok || !inventoryAnswer.ok) return;
    const models = liveModelsSchema.safeParse(await modelsAnswer.json());
    const inventory = liveInventorySchema.safeParse(await inventoryAnswer.json());
    if (!models.success || !inventory.success) return;
    liveSnapshot = {
      loaded: true,
      chatModelIds: new Set(models.data.data.filter((model) => model.sonnely.routes.length > 0).map((model) => model.id)),
      providers: new Set(inventory.data.providers),
    };
    for (const notify of liveListeners) notify();
  } catch {
    return;
  }
}

function subscribeLive(notify: () => void) {
  liveListeners.add(notify);
  if (!liveRequested) {
    liveRequested = true;
    void loadAvailability();
  }
  return () => liveListeners.delete(notify);
}

export function useLiveAvailability(): LiveAvailability {
  return useSyncExternalStore(subscribeLive, () => liveSnapshot, () => unloaded);
}

function routeServed(endpoint: Endpoint, modelId: string, provider: ProviderId, live: LiveAvailability) {
  if (endpoint === "Realtime") return false;
  if (endpoint === "ChatCompletions") return live.chatModelIds.has(modelId);
  return live.providers.has(providerSlugs[provider]);
}

type AvailabilityEntry = Pick<CatalogEntry, "provider" | "routes">;

export function availabilityStatus(entry: AvailabilityEntry, live: LiveAvailability): CatalogStatus {
  if (entry.routes.length === 0) return { label: "Catalog only", tone: "muted" };
  if (entry.routes.every((route) => route.endpoint === "Realtime")) return { label: "Planned", tone: "muted" };
  if (!live.loaded) return { label: "Routed", tone: "info" };
  const served = entry.routes.some((route) => routeServed(route.endpoint, route.modelId, entry.provider, live));
  return served ? { label: "Available", tone: "ok" } : { label: "Unavailable", tone: "warn" };
}

export function liveStatuses(live: LiveAvailability): ReadonlyMap<string, CatalogStatus> {
  return new Map(catalog.map((entry) => [entry.provider + "/" + entry.upstreamId, availabilityStatus(entry, live)]));
}
