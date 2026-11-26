// spec/app/models.md, "Story: Filter the catalog"
import { ArrowDown, ArrowRight, ArrowUpRight, Search } from "lucide-react";
import { Input } from "@repo/ui";
import { useMachine } from "../../../../gen/app__models.react.ts";
import {
  catalog,
  type Availability,
  type CatalogEntry,
  type CatalogFilter,
  type Event,
  type Endpoint,
  type ProviderId,
  type Sort,
} from "../../../../gen/app__models.ts";
import type { Board, ProbeState } from "../../../../gen/app__site.ts";
import { useRemote } from "../../remote.ts";
import { canonicalGroups, endpointIds } from "./catalog-data.ts";
import { SiteLead } from "./chrome.tsx";
import {
  apiBasePath,
  featuredTypes,
  featuredUpstreamIds,
  limits,
  providerNames,
  providerOfSlug,
  upstreamCoversEndpoint,
  workloadGuide,
  workloadNames,
} from "./data.ts";
import { catalogRuntime } from "./filter.ts";
import { entryActions, pages } from "./content.ts";
import { PlatformLinks } from "./products.tsx";
import {
  buttonAccent,
  searchBox,
  sectionHead,
  selectClass,
  serif,
  textLink,
  wrap,
} from "./ui.ts";
import type { CanonicalModel } from "./catalog-groups.ts";
import {
  CatalogCards,
  type CatalogDisplayEntry,
  type CatalogRateKind,
  type CatalogStatus,
} from "./catalog-cards.tsx";

function probeStates(board: Board | undefined): Partial<Record<ProviderId, ProbeState>> {
  if (board?.tag !== "Live") return {};
  const states: Partial<Record<ProviderId, ProbeState>> = {};
  for (const probe of board.report.probes) {
    const provider = providerOfSlug[probe.provider];
    if (provider) states[provider] = probe.state;
  }
  return states;
}

function statusFor(model: CatalogEntry, probes: Partial<Record<ProviderId, ProbeState>>, probed: boolean): CatalogStatus {
  if (model.routes.length === 0) return { label: "Catalog only", tone: "muted" };
  if (!probed) return { label: "Routed", tone: "info" };
  const state = probes[model.provider];
  if (state === "Ok") return { label: "Available", tone: "ok" };
  if (state === "Down") return { label: "Provider down", tone: "warn" };
  if (state === "Disabled") return { label: "Probe disabled", tone: "warn" };
  return { label: "Probe pending", tone: "info" };
}

function CatalogTools({
  filter,
  send,
}: {
  filter: CatalogFilter;
  send: (event: Event) => unknown;
}) {
  const providerValue = filter.provider.tag === "Only" ? filter.provider.provider : "";
  const workloadValue = filter.workload.tag === "OnEndpoint" ? filter.workload.endpoint : "";
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 min-[900px]:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] min-[900px]:items-end">
      <label className={searchBox + " col-span-2 min-[900px]:col-span-1"}>
        <Search size={17} aria-hidden="true" />
        <Input
          type="search"
          value={filter.query}
          onChange={(event) => void send({ type: "search", query: event.target.value })}
          placeholder="Find a model"
          aria-label="Find a model"
          className="border-0 bg-transparent px-0 shadow-none"
        />
      </label>
      <label className="grid gap-1.5 text-xs text-muted-foreground">
        <span>Provider</span>
        <select
          className={selectClass}
          value={providerValue}
          onChange={(event) =>
            void send({
              type: "chooseProvider",
              provider: event.target.value
                ? { tag: "Only", provider: event.target.value as ProviderId }
                : { tag: "EveryProvider" },
            })
          }
        >
          <option value="">All providers</option>
          {(Object.keys(providerNames) as ProviderId[]).map((id) => (
            <option key={id} value={id}>
              {providerNames[id]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs text-muted-foreground">
        <span>Workload</span>
        <select
          className={selectClass}
          value={workloadValue}
          onChange={(event) =>
            void send({
              type: "chooseWorkload",
              workload: event.target.value
                ? { tag: "OnEndpoint", endpoint: event.target.value as Endpoint }
                : { tag: "EveryWorkload" },
            })
          }
        >
          <option value="">All workloads</option>
          {endpointIds.map((id) => (
            <option key={id} value={id}>
              {workloadNames[id]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs text-muted-foreground">
        <span>Sort models</span>
        <select
          className={selectClass}
          value={filter.sort}
          onChange={(event) =>
            void send({ type: "chooseSort", sort: event.target.value as Sort })
          }
        >
          <option value="AvailableFirst">Available first</option>
          <option value="ByName">Model name</option>
          <option value="ByInputRate">Lowest input token rate</option>
          <option value="ByOutputRate">Lowest output token rate</option>
        </select>
      </label>
    </div>
  );
}

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

function statusRank(status: CatalogStatus) {
  if (status.tone === "ok") return 0;
  if (status.tone === "info") return 1;
  if (status.tone === "warn") return 2;
  return 3;
}

export function ModelCatalog() {
  const { state, send } = useMachine(catalogRuntime);
  const remote = useRemote<Board>("site");
  const probes = probeStates(remote.state);
  const probed = Object.keys(probes).length > 0;
  const filter = state ?? {
    query: "",
    provider: { tag: "EveryProvider" } as const,
    workload: { tag: "EveryWorkload" } as const,
    availability: "AnyAvailability" as Availability,
    sort: "AvailableFirst" as Sort,
  };

  const statuses = new Map(
    catalog.map((model) => [model.provider + "/" + model.upstreamId, statusFor(model, probes, probed)]),
  );
  const chosenProvider = filter.provider.tag === "Only" ? filter.provider.provider : undefined;
  const chosenEndpoint =
    filter.workload.tag === "OnEndpoint" ? filter.workload.endpoint : undefined;
  const query = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const inventory = filter.availability === "CatalogOnly";

  const displayed = canonicalGroups.filter((group) => {
    if (inventory !== group.catalogOnly) return false;
    if (chosenProvider && !group.entries.some((entry) => entry.provider === chosenProvider)) return false;
    if (
      chosenEndpoint !== undefined &&
      !group.entries.some(
        (entry) =>
          entry.routes.some((route) => route.endpoint === chosenEndpoint) ||
          (entry.routes.length === 0 && upstreamCoversEndpoint(entry.workload, chosenEndpoint)),
      )
    )
      return false;
    return matchesQuery(group, query);
  });

  if (filter.sort === "ByInputRate" || filter.sort === "ByOutputRate") {
    const unit: CatalogRateKind = filter.sort === "ByInputRate" ? "input" : "output";
    displayed.sort((a, b) => bestDisplayRate(a, unit) - bestDisplayRate(b, unit));
  } else if (filter.sort === "ByName") {
    displayed.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const rank = (group: CanonicalModel<CatalogDisplayEntry>) =>
      Math.min(...group.entries.map((entry) => statusRank(statuses.get(entry.key) ?? entry.status)));
    displayed.sort((a, b) => rank(a) - rank(b));
  }

  const routableCount = canonicalGroups.filter((group) => !group.catalogOnly).length;
  const inventoryCount = canonicalGroups.length - routableCount;
  const providerValue = filter.provider.tag === "Only" ? filter.provider.provider : "every";
  const workloadValue = filter.workload.tag === "OnEndpoint" ? filter.workload.endpoint : "every";
  const filterSignature = [filter.query, providerValue, workloadValue, filter.availability, filter.sort].join("|");
  const activeSurface = "border-primary bg-primary text-primary-foreground";
  const inactiveSurface = "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Catalog inventory">
        <button
          type="button"
          aria-pressed={!inventory}
          onClick={() => void send({ type: "chooseAvailability", availability: "Available" })}
          className={"min-h-10 rounded-full border px-4 text-sm font-medium transition-colors " + (inventory ? inactiveSurface : activeSurface)}
        >
          On Sonnely · {routableCount}
        </button>
        <button
          type="button"
          aria-pressed={inventory}
          onClick={() => void send({ type: "chooseAvailability", availability: "CatalogOnly" })}
          className={"min-h-10 rounded-full border px-4 text-sm font-medium transition-colors " + (inventory ? activeSurface : inactiveSurface)}
        >
          Provider inventory · {inventoryCount}
        </button>
      </div>
      <CatalogTools filter={filter} send={send} />
      <CatalogCards groups={displayed} filterSignature={filterSignature} statuses={statuses} />
      <aside className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Rates shown are the final Sonnely rates.{" "}
        <a className="text-primary hover:underline" href="/pricing">How billing works</a>
        {" · "}
        <a className="text-primary hover:underline" href={apiBasePath + "/provider-models"}>Catalog JSON</a>
      </aside>
    </>
  );
}


function ModelGuide() {
  const entries = featuredUpstreamIds
    .map((id) => catalog.find((entry) => entry.provider === "NearAI" && entry.upstreamId === id))
    .filter((entry): entry is CatalogEntry => entry !== undefined);
  return (
    <section className="my-14 grid max-w-200 gap-3" aria-labelledby="compare-models-heading">
      <h2 id="compare-models-heading" style={serif} className="text-[clamp(23px,3.5vw,32px)] font-normal">
        Compare models by workload
      </h2>
      <p className="text-sm text-muted-foreground">
        Chat Completions models accept and return text through Sonnely. Start with one
        representative prompt and compare the output before committing a budget.
      </p>
      <dl className="my-3 grid gap-3">
        {entries.map((model) => {
          const type = featuredTypes[model.upstreamId]?.type as keyof typeof workloadGuide | undefined;
          return (
            <div key={model.upstreamId} className="grid gap-0.5 min-[800px]:grid-cols-[180px_minmax(0,1fr)] min-[800px]:gap-6">
              <dt className="text-sm font-medium">{model.name}</dt>
              <dd className="text-sm text-muted-foreground">{type ? workloadGuide[type] : model.summary}</dd>
            </div>
          );
        })}
      </dl>
      <p className="text-sm text-muted-foreground">
        The context window describes the underlying model. Sonnely currently accepts up to{" "}
        {limits.bodyBytes.toLocaleString("en-US")} bytes per request and returns up to{" "}
        {limits.maxOutputTokens.toLocaleString("en-US")} output tokens.
      </p>
      <a className={textLink} href="/docs/api#request-limits">
        See request limits <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}

export function ModelsPage() {
  const [title, description] = pages.models;
  const entry = entryActions.models;
  const sonnelyModels = canonicalGroups.filter((group) => !group.catalogOnly).length;
  const inventoryModels = canonicalGroups.length - sonnelyModels;
  return (
    <div className={wrap + " py-8 md:py-14"}>
      <SiteLead
        title={title}
        description={description}
        brief={{
          title: "Sonnely catalog",
          rows: [
            ["Sonnely models", String(sonnelyModels)],
            ["Provider inventory", String(inventoryModels)],
            ["Providers", "NEAR AI, Phala, Tinfoil"],
          ],
        }}
      >
        <div className="mt-5.5 flex items-center gap-4">
          <a href={entry.section} className={buttonAccent}>
            {entry.label} <ArrowDown size={15} aria-hidden="true" />
          </a>
          <a href={entry.next} className={textLink}>
            {entry.action} <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </SiteLead>
      <section
        className="my-10 grid gap-4"
        id="available-models"
        aria-labelledby="model-comparison-title"
      >
        <header className={sectionHead}>
          <div>
            <h2 id="model-comparison-title" style={serif} className="text-[clamp(26px,4vw,38px)] font-normal leading-tight">
              Models and rates
            </h2>
            <p className="text-sm text-muted-foreground">Compare provider routes, supported endpoints, and pricing.</p>
          </div>
        </header>
        <ModelCatalog />
        <a className={textLink} href="/inference#routing">
          How routing works <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </section>
      <ModelGuide />
      <PlatformLinks compact />
    </div>
  );
}
