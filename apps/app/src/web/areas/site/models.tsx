// spec/app/models.md, "Story: Filter the catalog"
import { ArrowDown, ArrowRight, ArrowUpRight, Network, SlidersHorizontal } from "lucide-react";
import { useRef, useState, type Ref } from "react";
import { Button, Card, Field, SegmentedControl, SegmentedControlItem, Select } from "@repo/ui";
import { SearchField } from "../../search.tsx";
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
import { canonicalGroups, endpointIds, liveStatuses, useLiveAvailability } from "./catalog-data.ts";
import {
  apiBasePath,
  featuredTypes,
  featuredUpstreamIds,
  limits,
  providerNames,
  upstreamCoversEndpoint,
  workloadGuide,
  workloadNames,
} from "./data.ts";
import { catalogRuntime } from "./filter.ts";
import { entryActions, pages } from "./content.ts";
import { PlatformLinks } from "./products.tsx";
import type { CanonicalModel } from "./catalog-groups.ts";
import {
  CatalogCards,
  type CatalogDisplayEntry,
  type CatalogRateKind,
  type CatalogStatus,
} from "./catalog-cards.tsx";

const sortOptions: readonly { value: Sort; label: string }[] = [
  { value: "AvailableFirst", label: "Available first" },
  { value: "ByName", label: "Model name (A–Z)" },
  { value: "ByInputRate", label: "Lowest input token rate" },
  { value: "ByOutputRate", label: "Lowest output token rate" },
];

function CatalogTools({
  filter,
  searchRef,
  send,
}: {
  filter: CatalogFilter;
  searchRef: Ref<HTMLInputElement>;
  send: (event: Event) => unknown;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const providerValue = filter.provider.tag === "Only" ? filter.provider.provider : "";
  const workloadValue = filter.workload.tag === "OnEndpoint" ? filter.workload.endpoint : "";
  const activeFilters = Number(providerValue !== "") + Number(workloadValue !== "");
  return (
    <div className="border-b border-border">
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-5">
        <Field
          label="Find a model"
          control={(field) => (
            <SearchField
              {...field}
              ref={searchRef}
              value={filter.query}
              onChange={(event) => void send({ type: "search", query: event.target.value })}
              placeholder="Name or ID"
            />
          )}
        />
        <Button
          type="button"
          variant="outline"
          aria-expanded={showFilters}
          aria-controls="models-filter-fields"
          onClick={() => setShowFilters(!showFilters)}
          className="justify-self-start sm:justify-self-end"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filter &amp; sort{activeFilters > 0 && ` (${activeFilters})`}
        </Button>
      </div>
      {showFilters && (
        <div id="models-filter-fields" className="grid gap-5 border-t border-border px-4 py-4 sm:px-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <Field
              label="Provider"
              control={(field) => (
                <Select
                  {...field}
                  value={providerValue}
                  onChange={(event) => {
                    const provider = event.target.value;
                    void send({
                      type: "chooseProvider",
                      provider: provider === "" ? { tag: "EveryProvider" } : { tag: "Only", provider: provider as ProviderId },
                    });
                  }}
                >
                  <option value="">All providers</option>
                  {(Object.keys(providerNames) as ProviderId[]).map((id) => (
                    <option key={id} value={id}>{providerNames[id]}</option>
                  ))}
                </Select>
              )}
            />
            <Field
              label="Workload"
              control={(field) => (
                <Select
                  {...field}
                  value={workloadValue}
                  onChange={(event) => {
                    const endpoint = endpointIds.find((id) => id === event.target.value);
                    void send({
                      type: "chooseWorkload",
                      workload: endpoint ? { tag: "OnEndpoint", endpoint } : { tag: "EveryWorkload" },
                    });
                  }}
                >
                  <option value="">All workloads</option>
                  {endpointIds.map((id: Endpoint) => (
                    <option key={id} value={id}>{workloadNames[id]}</option>
                  ))}
                </Select>
              )}
            />
            <Field
              label="Sort by"
              control={(field) => (
                <Select
                  {...field}
                  value={filter.sort}
                  onChange={(event) => {
                    const sort = sortOptions.find((option) => option.value === event.target.value)?.value;
                    if (sort) void send({ type: "chooseSort", sort });
                  }}
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              )}
            />
          </div>
        </div>
      )}
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
  const live = useLiveAvailability();
  const searchRef = useRef<HTMLInputElement>(null);
  const filter = state ?? {
    query: "",
    provider: { tag: "EveryProvider" } as const,
    workload: { tag: "EveryWorkload" } as const,
    availability: "AnyAvailability" as Availability,
    sort: "AvailableFirst" as Sort,
  };

  const statuses = liveStatuses(live);
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
  const empty = displayed.length === 0;

  async function clearFilters() {
    searchRef.current?.focus();
    if (filter.query) await send({ type: "search", query: "" });
    if (chosenProvider) await send({ type: "chooseProvider", provider: { tag: "EveryProvider" } });
    if (chosenEndpoint) await send({ type: "chooseWorkload", workload: { tag: "EveryWorkload" } });
  }

  const catalogHeader = (
    <>
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <SegmentedControl
          aria-label="Model lists"
          value={inventory ? "CatalogOnly" : "Available"}
          onValueChange={(value) => {
            if (value === "Available" || value === "CatalogOnly") {
              void send({ type: "chooseAvailability", availability: value });
            }
          }}
        >
          <SegmentedControlItem value="Available">
            On Sonnely <span className="ml-1 font-mono text-micro text-muted-foreground">{routableCount}</span>
          </SegmentedControlItem>
          <SegmentedControlItem value="CatalogOnly">
            Provider only <span className="ml-1 font-mono text-micro text-muted-foreground">{inventoryCount}</span>
          </SegmentedControlItem>
        </SegmentedControl>
      </div>
      <CatalogTools filter={filter} searchRef={searchRef} send={send} />
    </>
  );

  return (
    <div>
      <CatalogCards groups={displayed} filterSignature={filterSignature} statuses={statuses} header={catalogHeader} />
      {empty && (
        <div className="mt-3">
          <Button type="button" variant="outline" onClick={() => void clearFilters()}>
            Clear search and filters
          </Button>
        </div>
      )}
      <aside className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-muted-foreground">
        <span>Prices shown are the final Sonnely rates.</span>
        <a href="/pricing" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">How billing works <ArrowUpRight size={12} aria-hidden="true" /></a>
        <a href={apiBasePath + "/provider-models"} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">Catalog JSON <ArrowUpRight size={12} aria-hidden="true" /></a>
        {!live.loaded && !inventory && <span>Models marked Routed don’t have confirmed live availability.</span>}
      </aside>
    </div>
  );
}

function ModelGuide() {
  const entries = featuredUpstreamIds
    .map((id) => catalog.find((entry) => entry.provider === "NearAI" && entry.upstreamId === id))
    .filter((entry): entry is CatalogEntry => entry !== undefined);
  return (
    <section className="mt-14 grid gap-6 lg:grid-cols-[minmax(190px,0.55fr)_minmax(0,1.45fr)]" aria-labelledby="compare-models-heading">
      <div>
        <h2 id="compare-models-heading" className="text-heading font-strong leading-heading tracking-heading sm:text-title sm:leading-title sm:tracking-title">Choose by workload</h2>
      </div>
      <dl className="border-t border-border">
        {entries.map((model) => {
          const type = featuredTypes[model.upstreamId]?.type as keyof typeof workloadGuide | undefined;
          return (
            <div key={model.upstreamId} className="grid gap-1 border-b border-border py-3 sm:grid-cols-[minmax(150px,0.36fr)_minmax(0,1fr)] sm:gap-7">
              <dt className="font-mono text-meta font-medium text-foreground">{model.name}</dt>
              <dd className="text-ui text-muted-foreground">{type ? workloadGuide[type] : model.summary}</dd>
            </div>
          );
        })}
        <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[minmax(150px,0.36fr)_minmax(0,1fr)] sm:gap-7">
          <dt className="font-mono text-meta font-medium text-foreground">Sonnely request limits</dt>
          <dd className="text-ui text-muted-foreground">
            The context window describes the underlying model. Sonnely currently accepts up to{" "}
            {limits.bodyBytes.toLocaleString("en-US")} bytes per request and returns up to{" "}
            {limits.maxOutputTokens.toLocaleString("en-US")} output tokens.{" "}
            <a href="/docs/api#request-limits" className="inline-flex items-center gap-1 whitespace-nowrap text-primary underline-offset-4 hover:underline">
              See request limits <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function ModelsPage() {
  const [title] = pages.models;
  const entry = entryActions.models;
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="mb-8 grid items-end gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h1 className="text-title font-strong leading-title tracking-title md:text-display md:leading-display md:tracking-display">{title}</h1>
          <p className="mt-3 max-w-prose text-lead text-muted-foreground">Compare model prices, context windows, and provider routes.</p>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Model catalog actions">
            <Button asChild>
              <a
                href={entry.section}
                onClick={(event) => {
                  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                  const section = document.getElementById(entry.section.slice(1));
                  if (!section) return;
                  event.preventDefault();
                  history.replaceState(history.state, "", entry.section);
                  section.focus({ preventScroll: true });
                  section.scrollIntoView();
                }}
              >
                {entry.label} <ArrowDown size={15} aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="ghost" className="px-0 text-primary">
              <a href={entry.next}>
                Open playground <ArrowRight size={15} aria-hidden="true" />
              </a>
            </Button>
          </nav>
        </div>
        <Card className="flex-row items-center gap-3 p-3 sm:p-4" aria-label="Catalog providers">
          <Network size={17} aria-hidden="true" className="shrink-0 text-primary" />
          <div>
            <span className="block text-meta text-muted-foreground">Catalog providers</span>
            <strong className="text-ui font-strong">{Object.values(providerNames).join(" · ")}</strong>
          </div>
        </Card>
      </header>
      <section
        className="scroll-mt-24"
        id="available-models"
        aria-labelledby="model-comparison-title"
        tabIndex={-1}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="model-comparison-title" className="text-heading font-strong leading-heading tracking-heading sm:text-title sm:leading-title sm:tracking-title">Models and rates</h2>
          <Button asChild variant="ghost" size="sm" className="px-0 text-primary">
            <a href="/inference#routing">
              How routing works <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </Button>
        </div>
        <ModelCatalog />
      </section>
      <ModelGuide />
      <PlatformLinks compact className="mt-12" />
    </div>
  );
}
