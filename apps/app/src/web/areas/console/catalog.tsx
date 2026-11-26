// spec/app/console/catalog.md, "Story: Browse the catalog"
import { useState } from "react";
import { Search } from "lucide-react";
import type { CatalogModel } from "../../../../gen/app__console__catalog.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import { formatRate } from "./bits.tsx";
import { groupCatalog, type CanonicalModel } from "../site/catalog-groups.ts";
import {
  CatalogCards,
  type CatalogDisplayEntry,
  type CatalogRateKind,
} from "../site/catalog-cards.tsx";

const providerNames: Record<string, string> = {
  "near-ai": "NEAR AI",
  phala: "Phala",
  tinfoil: "Tinfoil",
};
const providerIds = ["near-ai", "phala", "tinfoil"] as const;

const workloadNames: Record<string, string> = {
  "chat/completions": "Chat Completions",
  responses: "Responses",
  embeddings: "Embeddings",
  rerank: "Reranking",
  systemone: "System One decisions",
  "images/generations": "Image generation",
  "images/edits": "Image editing",
  "audio/transcriptions": "Audio transcription",
  realtime: "Realtime transcription",
  "audio/translations": "Audio translation",
  "audio/speech": "Speech synthesis",
  "convert/file": "Document conversion",
  redact: "Redaction",
};

const routeLabels: Record<string, string> = {
  "private-tee": "Private TEE",
  "private-3p-tee": "Private 3P TEE",
  incognito: "Incognito",
  unclassified: "Unclassified",
};

const rateLabels = [
  ["input", "input / 1M tokens"],
  ["cache", "cached input / 1M tokens"],
  ["output", "output / 1M tokens"],
  ["request", "per request"],
  ["session", "per session"],
] as const;

const upstreamWorkloads: Record<string, readonly string[]> = {
  text: ["chat/completions"],
  embedding: ["embeddings"],
  reranking: ["rerank"],
  decisions: ["systemone"],
  image: ["images/generations", "images/edits"],
  transcription: ["audio/transcriptions"],
};

function endpointDocs(endpoint: string) {
  if (endpoint === "chat/completions") return "/docs/api#create-a-completion";
  if (["realtime", "audio/translations", "convert/file", "redact", "responses"].includes(endpoint))
    return "/docs/providers#additional-tinfoil-endpoints";
  return "/docs/providers#embeddings-decisions-images-and-audio";
}

function detailHref(model: CatalogModel) {
  return (
    "/models/" +
    model.provider +
    "/" +
    model.upstreamId
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")
  );
}

function upstreamNames(workload: string) {
  return workload
    .split(",")
    .map((item) => item.trim().replace(/^\//, ""))
    .filter(Boolean);
}

function workloadLabel(model: CatalogModel) {
  return upstreamNames(model.workload)
    .map((name) => workloadNames[name] ?? (name === "text" ? "Text" : name))
    .join(", ");
}

function displayEntry(model: CatalogModel): CatalogDisplayEntry {
  return {
    key: model.provider + "/" + model.upstreamId,
    provider: model.provider,
    upstreamId: model.upstreamId,
    name: model.name,
    workload: model.workload,
    summary: model.summary,
    context: model.context,
    mark: model.mark,
    providerName: providerNames[model.provider] ?? model.provider,
    privacyLabel: routeLabels[model.route] ?? model.route,
    workloadLabel: workloadLabel(model),
    detailHref: detailHref(model),
    status: model.routes.length
      ? { label: "Routed", tone: "info" }
      : { label: "Catalog only", tone: "muted" },
    routes: model.routes.map((route) => ({
      endpoint: route.endpoint,
      endpointLabel: workloadNames[route.endpoint] ?? route.endpoint,
      endpointPath: route.endpoint,
      docsHref: endpointDocs(route.endpoint),
      modelId: route.modelId,
      chatHref: route.endpoint === "chat/completions" ? "/console/chat" : undefined,
      rates: rateLabels.flatMap(([key, label]) =>
        route[key] < 0
          ? []
          : [{ kind: key, label, value: route[key], text: formatRate(route[key]) }],
      ),
    })),
  };
}

const catalogEntries = catalog.map(displayEntry);
const canonicalGroups = groupCatalog(catalogEntries);

function bestDisplayRate(group: CanonicalModel<CatalogDisplayEntry>, kind: CatalogRateKind) {
  let best = Infinity;
  for (const entry of group.entries) {
    for (const route of entry.routes) {
      for (const rate of route.rates) {
        if (rate.kind === kind) best = Math.min(best, rate.value);
      }
    }
  }
  return best;
}

function matchesQuery(group: CanonicalModel<CatalogDisplayEntry>, query: readonly string[]) {
  if (!query.length) return true;
  const searchable = [
    group.searchText,
    ...group.entries.flatMap((entry) => [
      entry.providerName,
      entry.privacyLabel,
      entry.workloadLabel,
      ...entry.routes.flatMap((route) => [route.endpointLabel, route.endpointPath]),
    ]),
  ]
    .join(" ")
    .toLowerCase();
  return query.every((term) => searchable.includes(term));
}

export function CatalogSection() {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("default");
  const [provider, setProvider] = useState("all");
  const [workload, setWorkload] = useState("all");
  const [availability, setAvailability] = useState("available");
  const query = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const inventory = availability === "catalog";
  const displayed = canonicalGroups.filter((group) => {
    if (inventory !== group.catalogOnly) return false;
    if (provider !== "all" && !group.entries.some((entry) => entry.provider === provider)) return false;
    if (
      workload !== "all" &&
      !group.entries.some(
        (entry) =>
          entry.routes.some((route) => route.endpoint === workload) ||
          (entry.routes.length === 0 &&
            upstreamNames(entry.workload).some(
              (name) => name === workload || upstreamWorkloads[name]?.some((endpoint) => endpoint === workload),
            )),
      )
    )
      return false;
    return matchesQuery(group, query);
  });

  if (sort === "input" || sort === "output") {
    displayed.sort((a, b) => bestDisplayRate(a, sort) - bestDisplayRate(b, sort));
  } else if (sort === "name") {
    displayed.sort((a, b) => a.name.localeCompare(b.name));
  }

  const routableCount = canonicalGroups.filter((group) => !group.catalogOnly).length;
  const inventoryCount = canonicalGroups.length - routableCount;
  const filterSignature = [filter, sort, provider, workload, availability].join("|");
  const activeSurface = "border-primary bg-primary text-primary-foreground";
  const inactiveSurface = "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground";
  const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="Catalog inventory">
        <button
          type="button"
          aria-pressed={!inventory}
          onClick={() => setAvailability("available")}
          className={"min-h-10 rounded-full border px-4 text-sm font-medium transition-colors " + (inventory ? inactiveSurface : activeSurface)}
        >
          On Sonnely · {routableCount}
        </button>
        <button
          type="button"
          aria-pressed={inventory}
          onClick={() => setAvailability("catalog")}
          className={"min-h-10 rounded-full border px-4 text-sm font-medium transition-colors " + (inventory ? activeSurface : inactiveSurface)}
        >
          Provider inventory · {inventoryCount}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(0,1fr))]">
        <label className="catalog-search col-span-2 self-end xl:col-span-1">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a model"
            aria-label="Find a model"
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          <span>Provider</span>
          <select className={selectClass} value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="all">All providers</option>
            {providerIds.map((id) => (
              <option key={id} value={id}>
                {providerNames[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          <span>Workload</span>
          <select className={selectClass} value={workload} onChange={(event) => setWorkload(event.target.value)}>
            <option value="all">All workloads</option>
            {Object.entries(workloadNames).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          <span>Sort models</span>
          <select className={selectClass} value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="default">Catalog order</option>
            <option value="name">Model name</option>
            <option value="input">Lowest input token rate</option>
            <option value="output">Lowest output token rate</option>
          </select>
        </label>
      </div>
      <CatalogCards groups={displayed} filterSignature={filterSignature} />
      <aside className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Rates shown are the final Sonnely rates.{" "}
        <a href="/pricing" className="text-primary hover:underline">How billing works</a>
        {" · "}
        <a href="/api/console/catalog" className="text-primary hover:underline">Catalog JSON</a>
      </aside>
    </div>
  );
}
