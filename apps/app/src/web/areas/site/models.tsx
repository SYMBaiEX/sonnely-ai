// spec/app/models.md, "Story: Filter the catalog"
import { ArrowDown, ArrowRight, ArrowUpRight, Network, SlidersHorizontal } from "lucide-react";
import { useRef, useState, type Ref } from "react";
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
import {
  buttonAccent,
  buttonQuiet,
  textLink,
  wrap,
} from "./ui.ts";
import "./models.css";
import type { CanonicalModel } from "./catalog-groups.ts";
import {
  CatalogCards,
  type CatalogDisplayEntry,
  type CatalogRateKind,
  type CatalogStatus,
} from "./catalog-cards.tsx";

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
    <div className="catalog-filter">
      <div data-models-toolbar>
        <div>
          <label htmlFor="models-search">Find a model</label>
          <SearchField
            id="models-search"
            ref={searchRef}
            value={filter.query}
            onChange={(event) => void send({ type: "search", query: event.target.value })}
            placeholder="Name or ID"
          />
        </div>
        <button
          type="button"
          className={buttonQuiet}
          aria-expanded={showFilters}
          aria-controls="models-filter-fields"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filter &amp; sort{activeFilters > 0 && ` (${activeFilters})`}
        </button>
      </div>
      <div id="models-filter-fields" className="catalog-filter-grid" hidden={!showFilters}>
        <label>
          <span>Provider</span>
          <select
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
        <label>
          <span>Workload</span>
          <select
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
        <label>
          <span>Sort by</span>
          <select
            value={filter.sort}
            onChange={(event) =>
              void send({ type: "chooseSort", sort: event.target.value as Sort })
            }
          >
            <option value="AvailableFirst">Available first</option>
            <option value="ByName">Model name (A–Z)</option>
            <option value="ByInputRate">Lowest input token rate</option>
            <option value="ByOutputRate">Lowest output token rate</option>
          </select>
        </label>
      </div>
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

  async function clearFilters() {
    searchRef.current?.focus();
    if (filter.query) await send({ type: "search", query: "" });
    if (chosenProvider) await send({ type: "chooseProvider", provider: { tag: "EveryProvider" } });
    if (chosenEndpoint) await send({ type: "chooseWorkload", workload: { tag: "EveryWorkload" } });
  }

  return (
    <div data-models-browser>
      <div className="catalog-availability" role="group" aria-label="Model lists">
        <button
          type="button"
          aria-pressed={!inventory}
          data-active={!inventory || undefined}
          onClick={() => void send({ type: "chooseAvailability", availability: "Available" })}
        >
          On Sonnely <b>{routableCount}</b>
        </button>
        <button
          type="button"
          aria-pressed={inventory}
          data-active={inventory || undefined}
          onClick={() => void send({ type: "chooseAvailability", availability: "CatalogOnly" })}
        >
          Provider only <b>{inventoryCount}</b>
        </button>
      </div>
      <CatalogTools filter={filter} searchRef={searchRef} send={send} />
      {displayed.length > 0
        ? <CatalogCards groups={displayed} filterSignature={filterSignature} statuses={statuses} />
        : (
          <div id="model-rates" data-models-empty>
            <p role="status">No models match your search and filters.</p>
            <button type="button" className={buttonQuiet} onClick={() => void clearFilters()}>
              Clear search and filters
            </button>
          </div>
        )}
      <aside className="catalog-note">
        <span>Prices shown are the final Sonnely rates.</span>
        <a href="/pricing">How billing works <ArrowUpRight size={12} aria-hidden="true" /></a>
        <a href={apiBasePath + "/provider-models"}>Catalog JSON <ArrowUpRight size={12} aria-hidden="true" /></a>
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
    <section className="models-guide" aria-labelledby="compare-models-heading">
      <div className="models-guide-copy">
        <h2 id="compare-models-heading">Choose by workload</h2>
      </div>
      <dl className="models-guide-rows">
        {entries.map((model) => {
          const type = featuredTypes[model.upstreamId]?.type as keyof typeof workloadGuide | undefined;
          return (
            <div key={model.upstreamId}>
              <dt>{model.name}</dt>
              <dd>{type ? workloadGuide[type] : model.summary}</dd>
            </div>
          );
        })}
        <div className="models-guide-limits">
          <dt>Sonnely request limits</dt>
          <dd>
            The context window describes the underlying model. Sonnely currently accepts up to{" "}
            {limits.bodyBytes.toLocaleString("en-US")} bytes per request and returns up to{" "}
            {limits.maxOutputTokens.toLocaleString("en-US")} output tokens.{" "}
            <a href="/docs/api#request-limits">
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
    <div className={wrap + " models-page"}>
      <header className="models-hero">
        <div className="models-hero-copy">
          <h1>{title}</h1>
          <p className="models-hero-description">Compare model prices, context windows, and provider routes.</p>
          <nav className="actions" aria-label="Model catalog actions">
            <a
              href={entry.section}
              className={buttonAccent}
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
            <a href={entry.next} className={textLink}>
              Open playground <ArrowRight size={15} aria-hidden="true" />
            </a>
          </nav>
        </div>
        <aside className="models-hero-index" aria-label="Catalog providers">
          <div>
            <Network size={17} aria-hidden="true" />
            <div>
              <span>Catalog providers</span>
              <strong>{Object.values(providerNames).join(" · ")}</strong>
            </div>
          </div>
        </aside>
      </header>
      <section
        className="models-catalog-section"
        id="available-models"
        aria-labelledby="model-comparison-title"
        tabIndex={-1}
      >
        <div className="models-section-head">
          <h2 id="model-comparison-title">Models and rates</h2>
          <a className={textLink} href="/inference#routing">
            How routing works <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        <ModelCatalog />
      </section>
      <ModelGuide />
      <PlatformLinks compact className="models-platform-links" />
    </div>
  );
}
