// spec/app/site/index.md, "Story: Check the service status"
import { NotFound } from "./notfound.tsx";
import { ArrowLeft, ArrowUpRight, ChevronDown } from "lucide-react";
import { catalog } from "../../../../gen/app__models.ts";
import type { CatalogEntry, RateUnit, Route } from "../../../../gen/app__models.ts";
import { HighlightedCode } from "../../syntax.tsx";
import { CopyButton } from "./chrome.tsx";
import {
  contextFormat,
  endpointDocs,
  endpointPaths,
  formatRate,
  modelDetailHref,
  modelPlaygroundHref,
  privacyDescriptions,
  providerNames,
  providerOfSlug,
  providerSources,
  rateLabels,
  routeLabels,
  routeRates,
  workloadNames,
} from "./data.ts";
import { modelApiExample } from "./content.ts";
import { buttonAccent, caption, serif, textLink, wrap } from "./ui.ts";
import { cleanModelName, groupCatalog } from "./catalog-groups.ts";
import { availabilityStatus, useLiveAvailability, type LiveAvailability } from "./catalog-data.ts";

const canonicalGroups = groupCatalog(catalog);

const summaryRateLabels: Record<RateUnit, string> = {
  Input: "in",
  Cached: "cached",
  Output: "out",
  PerRequest: "request",
  PerSession: "session",
};

const toneClasses = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  info: "border-info/30 bg-info/10 text-info",
  muted: "border-border bg-secondary text-muted-foreground",
} as const;

type Availability = {
  readonly label: string;
  readonly tone: keyof typeof toneClasses;
  readonly body: string;
  readonly runnable: boolean;
};

function availabilityFor(entry: CatalogEntry, live: LiveAvailability): Availability {
  if (entry.routes.length === 0) {
    return {
      label: "Provider catalog only",
      tone: "muted",
      body: `${providerNames[entry.provider]} publishes this entry, but Sonnely does not route requests to it. Compare the nearest routable alternatives below before choosing a model.`,
      runnable: false,
    };
  }
  if (!live.loaded) {
    return {
      label: "Checking availability",
      tone: "info",
      body: "Sonnely is reading the live gateway configuration. Examples below are reference examples until availability is confirmed.",
      runnable: false,
    };
  }
  if (availabilityStatus(entry, live).tone === "ok") {
    return {
      label: "Available on Sonnely",
      tone: "ok",
      body: "The live gateway lists a configured route for this entry. Examples below can be run with a funded Sonnely API key.",
      runnable: true,
    };
  }
  return {
    label: "Unavailable",
    tone: "warn",
    body: "The live gateway has no configured route for this entry in this deployment. Examples below are reference examples, not currently runnable requests.",
    runnable: false,
  };
}

function routeRateList(route: Route) {
  const rates = routeRates(route);
  return rateLabels.flatMap(([key, label]) => {
    const value = rates[key];
    return value === undefined || value < 0 ? [] : [{ key, label, value }];
  });
}

function routePrice(route: Route | undefined) {
  if (!route) return "No Sonnely route";
  const rates = routeRates(route);
  if (rates.Input !== undefined && rates.Output !== undefined) {
    return `${formatRate(rates.Input)} in · ${formatRate(rates.Output)} out`;
  }
  if (rates.PerRequest !== undefined) return formatRate(rates.PerRequest) + " / request";
  if (rates.PerSession !== undefined) return formatRate(rates.PerSession) + " / session";
  if (rates.Input !== undefined) return formatRate(rates.Input) + " input / 1M";
  return "Rate unpublished";
}

function primaryRoute(entry: CatalogEntry) {
  return entry.routes.find((route) => route.endpoint === "ChatCompletions") ?? entry.routes[0];
}

function EndpointCard({
  entry,
  route,
  open,
  runnable,
}: {
  entry: CatalogEntry;
  route: Route;
  open: boolean;
  runnable: boolean;
}) {
  const { endpoint, modelId } = route;
  const endpointName = workloadNames[endpoint];
  const path = endpointPaths[endpoint];
  const id = path.replaceAll("/", "-");
  const deepseek =
    modelId === "deepseek-ai/DeepSeek-V4.1-Flash-1017" && entry.provider !== "NearAI";
  const example = modelApiExample(route, entry.provider);
  const rates = routeRateList(route);
  const leadRates = rates.filter((rate) => rate.key !== "Cached").slice(0, 2);
  const exampleTitle = runnable ? example.language + " example" : example.language + " reference example";

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm" id={id}>
      <details className="group" open={open}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 transition-colors hover:bg-secondary/60 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-base font-medium text-foreground">{endpointName}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{endpoint === "Realtime" ? "WebSocket" : "POST"}</span>{" "}
              <code>/{path}</code>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {leadRates.map((rate) => formatRate(rate.value) + " " + summaryRateLabels[rate.key]).join(" · ")}
            </span>
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </div>
        </summary>
        <div className="grid gap-4 border-t border-border p-4 sm:p-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
          <div className="min-w-0">
            <dl className="grid gap-0 text-sm">
              <div className="flex flex-wrap justify-between gap-2 border-b border-border py-2.5">
                <dt className="text-muted-foreground">API model ID</dt>
                <dd className="min-w-0 wrap-anywhere font-mono text-xs">{modelId}</dd>
              </div>
              {rates.map((rate) => (
                <div key={rate.key} className="flex flex-wrap justify-between gap-2 border-b border-border py-2.5 last:border-b-0">
                  <dt className="text-muted-foreground">{rate.label}</dt>
                  <dd className="font-medium tabular-nums">{formatRate(rate.value)}</dd>
                </div>
              ))}
            </dl>
            {endpoint === "ChatCompletions" && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Chat capabilities" role="list">
                {["Streaming", "Completion receipts", ...(deepseek ? ["Function calling"] : []), ...(deepseek && entry.provider === "Tinfoil" ? ["Structured outputs"] : [])].map((capability) => (
                  <li key={capability} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                    {capability}
                  </li>
                ))}
              </ul>
            )}
            <a className={textLink + " mt-4 inline-flex"} href={endpointDocs(endpoint)}>
              Endpoint guide <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          <div className="min-w-0 rounded-lg border border-border bg-secondary/45 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground">{exampleTitle}</h3>
              <CopyButton value={example.code} label={"Copy example for " + endpointName} text="Copy example" />
            </div>
            {!runnable && (
              <p className="mt-2 text-xs text-warn">
                Route health is unconfirmed; use this as request syntax rather than a currently runnable example.
              </p>
            )}
            {example.note && <p className={caption + " mt-2"}>{example.note}</p>}
            <pre aria-label={example.language + " request example"} className="mt-3 max-h-72 overflow-auto lg:max-h-96 border-t border-border pt-3 font-mono text-xs leading-6 whitespace-pre">
              <HighlightedCode source={example.code} language={example.language === "cURL" ? "bash" : "javascript"} />
            </pre>
          </div>
        </div>
      </details>
    </article>
  );
}

function workloadTokens(value: string) {
  return new Set(
    value
      .split(/[,/]+/)
      .map((item) => item.trim().replace(/^\//, "").toLowerCase())
      .filter(Boolean),
  );
}

function nearestRoutable(entry: CatalogEntry) {
  const workloads = workloadTokens(entry.workload);
  const scored = catalog
    .filter((candidate) => candidate !== entry && candidate.routes.length > 0)
    .map((candidate) => {
      const shared = [...workloadTokens(candidate.workload)].filter((token) => workloads.has(token)).length;
      const workloadMatchWeight = 10;
      const exactWorkloadWeight = 3;
      const privacyMatchWeight = 2;
      const score =
        shared * workloadMatchWeight +
        (candidate.workload === entry.workload ? exactWorkloadWeight : 0) +
        (candidate.privacy === entry.privacy ? privacyMatchWeight : 0);
      const contextDistance =
        entry.context && candidate.context ? Math.abs(candidate.context - entry.context) : Number.MAX_SAFE_INTEGER;
      return { candidate, score, contextDistance };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.contextDistance - b.contextDistance);
  const rows = scored.length
    ? scored.map(({ candidate }) => candidate)
    : catalog.filter((candidate) => candidate.routes.length > 0);
  return rows.slice(0, 3);
}

function alternatesFor(entry: CatalogEntry) {
  const group = canonicalGroups.find((candidate) => candidate.entries.includes(entry));
  const otherProviders = (group?.entries ?? []).filter(
    (candidate) => candidate !== entry && candidate.provider !== entry.provider,
  );
  if (entry.routes.length) {
    return { title: "Other provider routes", rows: otherProviders.slice(0, 4) };
  }
  const direct = otherProviders.filter((candidate) => candidate.routes.length > 0);
  return {
    title: "Nearest routable alternatives",
    rows: (direct.length ? direct : nearestRoutable(entry)).slice(0, 3),
  };
}

function AlternateCard({ entry }: { entry: CatalogEntry }) {
  const route = primaryRoute(entry);
  return (
    <a
      href={modelDetailHref(entry)}
      className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-secondary/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground group-hover:underline">{cleanModelName(entry.name)}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {providerNames[entry.provider]} · {entry.context ? contextFormat.format(entry.context) + " tokens" : "context unpublished"}
          </p>
        </div>
        <ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{routePrice(route)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{routeLabels[entry.privacy]}</p>
    </a>
  );
}

export function ModelPage({ provider, model }: { provider: string; model: string }) {
  const providerId = providerOfSlug[provider];
  const entry = catalog.find(
    (row) => row.provider === providerId && row.upstreamId === model,
  );
  const live = useLiveAvailability();
  if (!entry) return <NotFound />;
  const availability = availabilityFor(entry, live);
  const providerName = providerNames[entry.provider];
  const chat = entry.routes.find((route) => route.endpoint === "ChatCompletions");
  const alternates = alternatesFor(entry);
  const endpointCount = entry.routes.length;

  return (
    <div className={wrap + " pb-14 pt-4 md:pt-8"}>
      <header className="mt-4 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href="/models" className={textLink}>
            <ArrowLeft size={14} aria-hidden="true" /> Models
          </a>
          <span className={"inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium " + toneClasses[availability.tone]}>
            {availability.label}
          </span>
        </div>
        <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] xl:items-end">
            <div className="min-w-0">
              <h1 style={serif} className="wrap-anywhere text-[clamp(2.2rem,6vw,4.8rem)] leading-none font-normal">
                {entry.name}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {entry.summary || `Model details for ${providerName}.`}
              </p>
              <code className="mt-3 block truncate font-mono text-xs text-muted-foreground">{entry.upstreamId}</code>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                {chat && (
                  <a className={buttonAccent} href={modelPlaygroundHref(chat.modelId, entry.provider)}>
                    Open in Playground <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                )}
                <a className={textLink} href="/models">
                  Compare models <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4 xl:grid-cols-2">
              <div className="rounded-lg bg-secondary/60 p-3">
                <dt className="text-xs text-muted-foreground">Provider</dt>
                <dd className="mt-1 font-medium">{providerName}</dd>
              </div>
              <div className="rounded-lg bg-secondary/60 p-3">
                <dt className="text-xs text-muted-foreground">Context</dt>
                <dd className="mt-1 font-medium">{entry.context ? contextFormat.format(entry.context) : "Unpublished"}</dd>
              </div>
              <div className="rounded-lg bg-secondary/60 p-3">
                <dt className="text-xs text-muted-foreground">Privacy</dt>
                <dd className="mt-1 font-medium">{routeLabels[entry.privacy]}</dd>
              </div>
              <div className="rounded-lg bg-secondary/60 p-3">
                <dt className="text-xs text-muted-foreground">Sonnely endpoints</dt>
                <dd className="mt-1 font-medium">{endpointCount || "None"}</dd>
              </div>
            </dl>
          </div>
        </section>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-labelledby="model-availability">
          <h2 id="model-availability" className="text-base font-medium">Availability</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{availability.body}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            <a className={textLink} href="/status">Provider status</a>
            <a className={textLink} href="/inference#routing">How routing works</a>
            <a className={textLink} href="/console/keys">Manage API keys</a>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-labelledby="model-privacy">
          <h2 id="model-privacy" className="text-base font-medium">{routeLabels[entry.privacy]}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{privacyDescriptions[entry.privacy]}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            <a className={textLink} href="/docs/attestation#data-handling">Sonnely’s gateway boundary</a>
            <a className={textLink} href={providerSources[entry.provider]}>
              {providerName} catalog <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>

      {alternates.rows.length > 0 && (
        <section className="mt-5" aria-labelledby="model-alternates">
          <h2 id="model-alternates" className="text-lg font-medium">{alternates.title}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {alternates.rows.map((alternate) => (
              <AlternateCard key={alternate.provider + "/" + alternate.upstreamId} entry={alternate} />
            ))}
          </div>
        </section>
      )}

      {entry.routes.length ? (
        <section className="mt-6" aria-labelledby="endpoint-access">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="endpoint-access" className="text-lg font-medium">Endpoint access</h2>
              <p className={caption + " mt-1"}>
                API examples use a funded Sonnely API key stored as <code>SONNELY_API_KEY</code>. Rates are in USD.
              </p>
            </div>
            <a className={textLink} href="/console/keys">Manage API keys</a>
          </div>
          <div className="grid gap-3">
            {entry.routes.map((route, index) => (
              <EndpointCard key={route.endpoint} entry={entry} route={route} open={index === 0} runnable={availability.runnable} />
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="catalog-only">
          <h2 id="catalog-only" className="text-lg font-medium">Provider catalog only</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            This entry is visible in the upstream provider inventory, but it has no routed Sonnely endpoint or published Sonnely rate. Use the provider catalog for upstream terms, or choose one of the routable alternatives above.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <a className={textLink} href={providerSources[entry.provider]}>
              {providerName} model catalog <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a className={textLink} href="/models#available-models">Browse Sonnely models</a>
          </div>
        </section>
      )}
    </div>
  );
}
