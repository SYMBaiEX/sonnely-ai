// spec/app/site/index.md, "Story: Check the service status"
import { NotFound } from "./notfound.tsx";
import { ArrowLeft, ArrowUpRight, ChevronDown, Terminal } from "lucide-react";
import { useId, useState } from "react";
import { Button, Card, CopyButton, Table, TableBody, TableCell, TableHead, TableRow, cn } from "@repo/ui";
import { catalog } from "../../../../gen/app__models.ts";
import type { CatalogEntry, RateUnit, Route } from "../../../../gen/app__models.ts";
import { HighlightedCode } from "../../syntax.tsx";
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
import { serif } from "./ui.ts";
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

const availabilityTones = {
  ok: "text-ok",
  warn: "text-warn",
  info: "text-info",
  muted: "text-muted-foreground",
} as const;

type Availability = {
  readonly label: string;
  readonly tone: keyof typeof availabilityTones;
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
  const [expanded, setExpanded] = useState(open);
  const bodyId = useId();
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
    <article className="border-t border-border first:border-t-0" id={id}>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded(!expanded)}
        className="h-auto w-full flex-wrap justify-between gap-3 rounded-none px-4 py-4 text-left hover:bg-accent/50 sm:px-5"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-micro font-medium", endpoint === "Realtime" ? "bg-info/10 text-info" : "bg-primary/10 text-primary")}>
            {endpoint === "Realtime" ? "WebSocket" : "POST"}
          </span>
          <span className="min-w-0">
            <strong className="mr-2 text-ui font-strong">{endpointName}</strong>
            <code className="break-all font-mono text-meta text-muted-foreground">/{path}</code>
          </span>
        </span>
        <span className="flex items-center gap-3 font-mono text-micro text-muted-foreground">
          <span>{leadRates.map((rate) => formatRate(rate.value) + " " + summaryRateLabels[rate.key]).join(" · ")}</span>
          <ChevronDown size={16} aria-hidden="true" className={cn("transition-transform duration-fast", expanded && "rotate-180")} />
        </span>
      </Button>
      {expanded && (
        <div id={bodyId} className="grid gap-5 border-t border-border px-4 py-5 sm:px-5 lg:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-4">
            <Table className="w-full table-fixed text-ui">
              <TableBody>
                <TableRow className="border-b-0">
                  <TableHead scope="row" colSpan={2} className="px-0 pb-1 pt-2 font-regular text-meta text-muted-foreground">API model ID</TableHead>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={2} className="break-all whitespace-normal px-0 pb-2 pt-0 font-mono text-ui text-foreground">{modelId}</TableCell>
                </TableRow>
                {rates.map((rate) => (
                  <TableRow key={rate.key} className="last:border-b-0">
                    <TableHead scope="row" className="px-0 py-2 font-regular text-meta text-muted-foreground">{rate.label}</TableHead>
                    <TableCell className="px-0 py-2 text-right font-mono text-ui text-foreground">{formatRate(rate.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {endpoint === "ChatCompletions" && (
              <ul aria-label="Chat capabilities" role="list" className="flex flex-wrap gap-2">
                {["Streaming", "Completion receipts", ...(deepseek ? ["Function calling"] : []), ...(deepseek && entry.provider === "Tinfoil" ? ["Structured outputs"] : [])].map((capability) => (
                  <li key={capability} className="rounded-md border border-border px-2 py-1 text-meta text-muted-foreground">{capability}</li>
                ))}
              </ul>
            )}
            <Button asChild variant="ghost" size="sm" className="justify-start px-0 text-primary">
              <a href={endpointDocs(endpoint)}>
                Endpoint guide <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </Button>
          </div>
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-meta font-medium text-muted-foreground">{exampleTitle}</span>
              <CopyButton value={example.code} label={"Copy example for " + endpointName} text="Copy example" />
            </div>
            {!runnable && (
              <p className="mb-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-meta text-warn">
                Route health is unconfirmed; use this as request syntax rather than a currently runnable example.
              </p>
            )}
            {example.note && <p className="mb-3 text-meta text-muted-foreground">{example.note}</p>}
            <pre aria-label={example.language + " request example"} className="overflow-x-auto rounded-md border border-border bg-background p-4 text-meta">
              <HighlightedCode source={example.code} language={example.language === "cURL" ? "bash" : "javascript"} />
            </pre>
          </div>
        </div>
      )}
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
    <Card asChild className="gap-2 p-4 transition-colors hover:border-primary/50 hover:bg-accent/40">
      <a href={modelDetailHref(entry)}>
        <span className="flex items-start justify-between gap-3">
          <strong className="text-ui font-strong">{cleanModelName(entry.name)}</strong>
          <ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-primary" />
        </span>
        <span className="block text-meta text-muted-foreground">
          {providerNames[entry.provider]} · {entry.context ? contextFormat.format(entry.context) + " tokens" : "context unpublished"}
        </span>
        <span className="block font-mono text-ui text-foreground">{routePrice(route)}</span>
        <span className="block text-meta text-muted-foreground">{routeLabels[entry.privacy]}</span>
      </a>
    </Card>
  );
}

function AvailabilityBadge({ availability }: { availability: Availability }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-micro font-medium", availabilityTones[availability.tone])}>
      <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {availability.label}
    </span>
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
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
      <nav className="mb-7 flex flex-wrap items-center justify-between gap-3" aria-label="Model navigation">
        <Button asChild variant="ghost" size="sm" className="px-0 text-primary">
          <a href="/models">
            <ArrowLeft size={14} aria-hidden="true" /> Models
          </a>
        </Button>
        <AvailabilityBadge availability={availability} />
      </nav>

      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start">
        <div>
          <p className="text-ui text-muted-foreground">{providerName} · {routeLabels[entry.privacy]}</p>
          <h1 className="mt-2 text-title font-strong leading-title tracking-title md:text-display md:leading-display md:tracking-display">
            {entry.name}
          </h1>
          <p className="mt-4 max-w-prose text-lead text-muted-foreground">{description}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded-md border border-border bg-secondary px-3 py-2 font-mono text-meta text-secondary-foreground">{entry.upstreamId}</code>
            <CopyButton value={entry.upstreamId} label={"Copy model ID " + entry.upstreamId} text="Copy ID" />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {chat && (
              <Button asChild>
                <a href={modelPlaygroundHref(chat.modelId, entry.provider)}>
                  Open in Playground <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </Button>
            )}
            <Button asChild variant={chat ? "outline" : "primary"}>
              <a href="/models">
                Compare models <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
        <Card className="gap-0 overflow-hidden p-0" aria-label="Model facts">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/50 px-4 py-2 font-mono text-micro text-muted-foreground">
            <span className="flex min-w-0 items-center gap-2">
              <Terminal size={12} aria-hidden="true" className="shrink-0" />
              <span className="truncate">~/models/{provider}</span>
            </span>
            <span>{endpointCount ? `${endpointCount} endpoint${endpointCount === 1 ? "" : "s"}` : "no endpoints"}</span>
          </div>
          <div className="p-4">
            <Table className="text-ui">
              <TableBody>
              <TableRow>
                <TableHead scope="row" className="px-0 py-2 font-regular text-meta text-muted-foreground">Provider</TableHead>
                <TableCell className="px-0 py-2 text-right font-medium">{providerName}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead scope="row" className="px-0 py-2 font-regular text-meta text-muted-foreground">Context</TableHead>
                <TableCell className="px-0 py-2 text-right font-mono">{entry.context ? contextFormat.format(entry.context) + " tokens" : "Unpublished"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead scope="row" className="px-0 py-2 font-regular text-meta text-muted-foreground">Privacy</TableHead>
                <TableCell className="px-0 py-2 text-right font-medium">{routeLabels[entry.privacy]}</TableCell>
              </TableRow>
              <TableRow className="border-b-0">
                <TableHead scope="row" className="px-0 py-2 font-regular text-meta text-muted-foreground">Sonnely endpoints</TableHead>
                <TableCell className="px-0 py-2 text-right font-mono">{endpointCount || "None"}</TableCell>
              </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      </header>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Card aria-labelledby="model-availability">
          <span className="text-meta text-muted-foreground">live gateway</span>
          <h2 id="model-availability" className="text-heading font-strong leading-heading tracking-heading">Availability</h2>
          <p className="text-ui text-muted-foreground">{availability.body}</p>
          <nav aria-label="Availability links" className="flex flex-wrap gap-x-4 gap-y-2">
            <a className="text-ui text-primary underline-offset-4 hover:underline" href="/status">Provider status</a>
            <a className="text-ui text-primary underline-offset-4 hover:underline" href="/inference#routing">How routing works</a>
            <a className="text-ui text-primary underline-offset-4 hover:underline" href="/console/keys">Manage API keys</a>
          </nav>
        </Card>
        <Card aria-labelledby="model-privacy">
          <span className="text-meta text-muted-foreground">privacy route</span>
          <h2 id="model-privacy" className="text-heading font-strong leading-heading tracking-heading">{routeLabels[entry.privacy]}</h2>
          <p className="text-ui text-muted-foreground">{privacyDescriptions[entry.privacy]}</p>
          <nav aria-label="Privacy links" className="flex flex-wrap gap-x-4 gap-y-2">
            <a className="text-ui text-primary underline-offset-4 hover:underline" href="/docs/attestation#data-handling">Sonnely’s gateway boundary</a>
            <a className="inline-flex items-center gap-1 text-ui text-primary underline-offset-4 hover:underline" href={providerSources[entry.provider]}>
              {providerName} catalog <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </nav>
        </Card>
      </div>

      {alternates.rows.length > 0 && (
        <section className="mt-12" aria-labelledby="model-alternates">
          <div className="mb-4">
            <p className="text-meta text-muted-foreground">compare</p>
            <h2 id="model-alternates" className="mt-1 text-heading font-strong leading-heading tracking-heading sm:text-title sm:leading-title sm:tracking-title">{alternates.title}</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {alternates.rows.map((alternate) => (
              <AlternateCard key={alternate.provider + "/" + alternate.upstreamId} entry={alternate} />
            ))}
          </div>
        </section>
      )}

      {entry.routes.length ? (
        <section className="mt-12" aria-labelledby="endpoint-access">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-meta text-muted-foreground">api access</p>
              <h2 id="endpoint-access" className="mt-1 text-heading font-strong leading-heading tracking-heading sm:text-title sm:leading-title sm:tracking-title">
                Endpoint access<span style={serif}>.</span>
              </h2>
              <p className="mt-2 max-w-prose text-ui text-muted-foreground">
                API examples use a funded Sonnely API key stored as <code className="font-mono text-meta">SONNELY_API_KEY</code>. Rates are in USD.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="px-0 text-primary">
              <a href="/console/keys">Manage API keys</a>
            </Button>
          </div>
          <Card className="gap-0 overflow-hidden p-0">
            {entry.routes.map((route, index) => (
              <EndpointCard key={route.endpoint} entry={entry} route={route} open={index === 0} runnable={availability.runnable} />
            ))}
          </Card>
        </section>
      ) : (
        <Card className="mt-12" aria-labelledby="catalog-only">
          <p className="text-meta text-muted-foreground">provider inventory</p>
          <h2 id="catalog-only" className="text-heading font-strong leading-heading tracking-heading sm:text-title sm:leading-title sm:tracking-title">
            Provider catalog only<span style={serif}>.</span>
          </h2>
          <p className="max-w-prose text-ui text-muted-foreground">
            This entry is visible in the upstream provider inventory, but it has no routed Sonnely endpoint or published Sonnely rate. Use the provider catalog for upstream terms, or choose one of the routable alternatives above.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a className="inline-flex items-center gap-1 text-ui text-primary underline-offset-4 hover:underline" href={providerSources[entry.provider]}>
              {providerName} model catalog <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a className="text-ui text-primary underline-offset-4 hover:underline" href="/models#available-models">Browse Sonnely models</a>
          </div>
        </Card>
      )}
    </div>
  );
}
