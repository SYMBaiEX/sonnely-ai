// spec/app/site/index.md, "Story: Check the service status"
import { NotFound } from "./notfound.tsx";
import { ArrowLeft, ArrowUpRight, ChevronDown, Terminal } from "lucide-react";
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
import { buttonAccent, buttonQuiet, eyebrow, textLink, wrap } from "./ui.ts";
import "./models.css";
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

type Availability = {
  readonly label: string;
  readonly tone: "ok" | "warn" | "info" | "muted";
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
    <article className="term model-endpoint" id={id}>
      <details className="model-endpoint-details" open={open}>
        <summary>
          <span className="model-endpoint-heading">
            <span className="model-endpoint-method" data-method={endpoint === "Realtime" ? "ws" : "post"}>
              {endpoint === "Realtime" ? "WebSocket" : "POST"}
            </span>
            <span className="model-endpoint-title">
              <strong>{endpointName}</strong>
              <code>/{path}</code>
            </span>
          </span>
          <span className="model-endpoint-summary">
            <span>{leadRates.map((rate) => formatRate(rate.value) + " " + summaryRateLabels[rate.key]).join(" · ")}</span>
            <ChevronDown className="model-endpoint-chevron" size={16} aria-hidden="true" />
          </span>
        </summary>
        <div className="model-endpoint-body">
          <div className="model-endpoint-facts">
            <dl>
              <div>
                <dt>API model ID</dt>
                <dd>{modelId}</dd>
              </div>
              {rates.map((rate) => (
                <div key={rate.key}>
                  <dt>{rate.label}</dt>
                  <dd>{formatRate(rate.value)}</dd>
                </div>
              ))}
            </dl>
            {endpoint === "ChatCompletions" && (
              <ul aria-label="Chat capabilities" role="list">
                {["Streaming", "Completion receipts", ...(deepseek ? ["Function calling"] : []), ...(deepseek && entry.provider === "Tinfoil" ? ["Structured outputs"] : [])].map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            )}
            <a className={textLink} href={endpointDocs(endpoint)}>
              Endpoint guide <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          <div className="model-example">
            <div className="model-example-head">
              <span className="model-example-title">{exampleTitle}</span>
              <CopyButton value={example.code} label={"Copy example for " + endpointName} text="Copy example" />
            </div>
            {!runnable && (
              <p className="model-example-warning">
                Route health is unconfirmed; use this as request syntax rather than a currently runnable example.
              </p>
            )}
            {example.note && <p className="model-example-note">{example.note}</p>}
            <pre aria-label={example.language + " request example"}>
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
    <a href={modelDetailHref(entry)} className="model-alternate">
      <span className="model-alternate-head">
        <strong>{cleanModelName(entry.name)}</strong>
        <ArrowUpRight size={15} aria-hidden="true" />
      </span>
      <span className="model-alternate-meta">
        {providerNames[entry.provider]} · {entry.context ? contextFormat.format(entry.context) + " tokens" : "context unpublished"}
      </span>
      <span className="model-alternate-price">{routePrice(route)}</span>
      <span className="model-alternate-route">{routeLabels[entry.privacy]}</span>
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
  const description = entry.summary || (endpointCount
    ? `${providerName} routes, rates and request examples.`
    : `${providerName} catalog entry with no routed Sonnely endpoint.`);

  return (
    <div className={wrap + " model-page"}>
      <nav className="model-breadcrumb" aria-label="Model navigation">
        <a href="/models" className={textLink}>
          <ArrowLeft size={14} aria-hidden="true" /> Models
        </a>
        <span className="model-availability" data-tone={availability.tone}>
          <i aria-hidden="true" /> {availability.label}
        </span>
      </nav>

      <header className="model-hero">
        <div className="model-hero-copy">
          <p className={eyebrow}>{providerName} · {routeLabels[entry.privacy]}</p>
          <h1>{entry.name}</h1>
          <p className="model-hero-description">{description}</p>
          <div className="model-upstream-row">
            <code className="model-upstream">{entry.upstreamId}</code>
            <CopyButton value={entry.upstreamId} label={"Copy model ID " + entry.upstreamId} text="Copy ID" />
          </div>
          <div className="actions">
            {chat && (
              <a className={buttonAccent} href={modelPlaygroundHref(chat.modelId, entry.provider)}>
                Open in Playground <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
            <a className={chat ? buttonQuiet : buttonAccent} href="/models">
              Compare models <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
        <aside className="term model-hero-index" aria-label="Model facts">
          <div className="term-chrome">
            <span className="term-path">
              <Terminal size={12} aria-hidden="true" />
              <span>~/models/{provider}</span>
            </span>
            <span>{endpointCount ? `${endpointCount} endpoint${endpointCount === 1 ? "" : "s"}` : "no endpoints"}</span>
          </div>
          <dl className="model-hero-facts">
            <div>
              <dt>Provider</dt>
              <dd>{providerName}</dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>{entry.context ? contextFormat.format(entry.context) + " tokens" : "Unpublished"}</dd>
            </div>
            <div>
              <dt>Privacy</dt>
              <dd>{routeLabels[entry.privacy]}</dd>
            </div>
            <div>
              <dt>Sonnely endpoints</dt>
              <dd>{endpointCount || "None"}</dd>
            </div>
          </dl>
        </aside>
      </header>

      <div className="model-signals">
        <section className="model-signal" aria-labelledby="model-availability">
          <span className="model-signal-kicker">live gateway</span>
          <h2 id="model-availability">Availability</h2>
          <p>{availability.body}</p>
          <nav aria-label="Availability links">
            <a className={textLink} href="/status">Provider status</a>
            <a className={textLink} href="/inference#routing">How routing works</a>
            <a className={textLink} href="/console/keys">Manage API keys</a>
          </nav>
        </section>
        <section className="model-signal" aria-labelledby="model-privacy">
          <span className="model-signal-kicker">privacy route</span>
          <h2 id="model-privacy">{routeLabels[entry.privacy]}</h2>
          <p>{privacyDescriptions[entry.privacy]}</p>
          <nav aria-label="Privacy links">
            <a className={textLink} href="/docs/attestation#data-handling">Sonnely’s gateway boundary</a>
            <a className={textLink} href={providerSources[entry.provider]}>
              {providerName} catalog <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </nav>
        </section>
      </div>

      {alternates.rows.length > 0 && (
        <section className="model-alternates" aria-labelledby="model-alternates">
          <div className="model-subhead">
            <p className={eyebrow}>compare</p>
            <h2 id="model-alternates">{alternates.title}</h2>
          </div>
          <div className="model-alternates-grid">
            {alternates.rows.map((alternate) => (
              <AlternateCard key={alternate.provider + "/" + alternate.upstreamId} entry={alternate} />
            ))}
          </div>
        </section>
      )}

      {entry.routes.length ? (
        <section className="model-endpoints" aria-labelledby="endpoint-access">
          <div className="model-endpoints-head">
            <div>
              <p className={eyebrow}>api access</p>
              <h2 id="endpoint-access">Endpoint access.</h2>
              <p>
                API examples use a funded Sonnely API key stored as <code>SONNELY_API_KEY</code>. Rates are in USD.
              </p>
            </div>
            <a className={textLink} href="/console/keys">Manage API keys</a>
          </div>
          <div className="model-endpoint-list">
            {entry.routes.map((route, index) => (
              <EndpointCard key={route.endpoint} entry={entry} route={route} open={index === 0} runnable={availability.runnable} />
            ))}
          </div>
        </section>
      ) : (
        <section className="model-catalog-only" aria-labelledby="catalog-only">
          <p className={eyebrow}>provider inventory</p>
          <h2 id="catalog-only">Provider catalog only.</h2>
          <p>
            This entry is visible in the upstream provider inventory, but it has no routed Sonnely endpoint or published Sonnely rate. Use the provider catalog for upstream terms, or choose one of the routable alternatives above.
          </p>
          <div className="model-catalog-actions">
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
