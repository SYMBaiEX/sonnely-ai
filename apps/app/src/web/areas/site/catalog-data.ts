// spec/app/models.md, "Story: Filter the catalog"
import {
  catalog,
  type CatalogEntry,
  type Endpoint,
  type RateUnit,
  type Route,
} from "../../../../gen/app__models.ts";
import {
  endpointDocs,
  endpointPaths,
  formatRate,
  modelDetailHref,
  modelPlaygroundHref,
  providerNames,
  routeLabels,
  routeRates,
  upstreamWorkloadLabel,
  workloadNames,
} from "./data.ts";
import { groupCatalog } from "./catalog-groups.ts";
import type { CatalogDisplayEntry, CatalogRateKind } from "./catalog-cards.tsx";

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
