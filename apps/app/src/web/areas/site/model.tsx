// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight } from "lucide-react";
import { catalog } from "../../../../gen/app__models.ts";
import type { CatalogEntry, Route } from "../../../../gen/app__models.ts";
import type { Board } from "../../../../gen/app__site.ts";
import { useRemote } from "../../remote.ts";
import { CopyButton, SiteLead } from "./chrome.tsx";
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
import {
  buttonAccent,
  buttonSmall,
  caption,
  monoSm,
  panel,
  pill,
  serif,
  textLink,
  wrap,
} from "./ui.ts";

function EndpointCard({
  entry,
  route,
}: {
  entry: CatalogEntry;
  route: Route;
  available: boolean;
}) {
  const { endpoint, modelId } = route;
  const endpointName = workloadNames[endpoint];
  const path = endpointPaths[endpoint];
  const id = path.replaceAll("/", "-");
  const deepseek =
    modelId === "deepseek-ai/DeepSeek-V4.1-Flash-1017" && entry.provider !== "NearAI";
  const example = modelApiExample(route, entry.provider);
  const rates = routeRates(route);

  return (
    <section
      className={panel + " grid gap-6 p-0 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"}
      id={id}
      aria-labelledby={id + "-heading"}
    >
      <div className="grid content-start gap-4 p-6">
        <h2 id={id + "-heading"} style={serif} className="text-2xl font-normal">
          {endpointName}
        </h2>
        <p className="flex items-center gap-2 font-mono text-sm">
          <span className="rounded bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
            {endpoint === "Realtime" ? "WebSocket" : "POST"}
          </span>
          <code>/{path}</code>
        </p>
        <dl className="grid gap-2.5">
          <div className="grid gap-1 text-[13px]">
            <dt className="text-muted-foreground">API model ID</dt>
            <dd>
              <code className={monoSm}>{modelId}</code>
            </dd>
          </div>
          {rateLabels.map(([key, label]) =>
            rates[key] === undefined ? null : (
              <div key={key} className="flex justify-between gap-4 text-[13px]">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{formatRate(rates[key])}</dd>
              </div>
            ),
          )}
        </dl>
        {endpoint === "ChatCompletions" && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Chat capabilities" role="list">
            <li className={pill}>Streaming</li>
            <li className={pill}>Completion receipts</li>
            {deepseek && <li className={pill}>Function calling</li>}
            {deepseek && entry.provider === "Tinfoil" && <li className={pill}>Structured outputs</li>}
          </ul>
        )}
        <a className={textLink} href={endpointDocs(endpoint)}>
          Endpoint guide <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
      <div className="border-t border-border min-[900px]:border-t-0 min-[900px]:border-s">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4.5 py-3">
          <h3 className="text-sm font-medium">{example.language} example</h3>
          <CopyButton
            value={example.code}
            label={"Copy example for " + endpointName}
            text="Copy example"
          />
        </div>
        {example.note && <p className={caption + " px-4.5 pt-3"}>{example.note}</p>}
        <pre
          aria-label={example.language + " request example"}
          className="overflow-auto p-4.5 font-mono text-xs leading-relaxed"
        >
          <code>{example.code}</code>
        </pre>
      </div>
    </section>
  );
}

export function ModelPage({ provider, model }: { provider: string; model: string }) {
  const providerId = providerOfSlug[provider];
  const entry = catalog.find(
    (row) => row.provider === providerId && row.upstreamId === model,
  );
  const remote = useRemote<Board>("site");
  if (!entry) return null;
  const probes =
    remote.state?.tag === "Live"
      ? new Map(remote.state.report.probes.map((probe) => [probe.provider, probe.state]))
      : undefined;
  const probeState = providerId ? probes?.get(provider ?? "") : undefined;
  const available =
    entry.routes.length > 0 && (probeState === undefined || probeState === "Ok");
  const providerName = providerNames[entry.provider];
  const status = available
    ? "Available on Sonnely"
    : entry.routes.length
      ? "Unavailable on Sonnely"
      : "Provider catalog only";
  const chat = entry.routes.find((route) => route.endpoint === "ChatCompletions");
  const modelIds = new Set(entry.routes.map((route) => route.modelId));
  const alternates = catalog.filter(
    (row) =>
      row.provider !== entry.provider &&
      row.routes.some((route) => modelIds.has(route.modelId)),
  );

  return (
    <div className={wrap + " grid gap-6 pt-6"}>
      <SiteLead
        title={entry.name}
        description={entry.summary || `Model details for ${providerName}.`}
        back={["/models", "Models"]}
        status={status}
        brief={{
          title: "Model information",
          rows: [
            ["Provider", providerName],
            ["Provider model ID", entry.upstreamId],
            [
              "Context window",
              entry.context ? contextFormat.format(entry.context) + " tokens" : "Unpublished",
            ],
            ["Privacy classification", routeLabels[entry.privacy]],
          ],
        }}
      >
        {available && chat && (
          <div className="mt-5.5">
            <a className={buttonAccent} href={modelPlaygroundHref(chat.modelId, entry.provider)}>
              Open in Playground <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        )}
      </SiteLead>
      <section className={panel + " flex flex-wrap items-start justify-between gap-6"} aria-labelledby="model-privacy">
        <div className="max-w-130">
          <h2 id="model-privacy" className="text-lg font-medium">
            {routeLabels[entry.privacy]}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{privacyDescriptions[entry.privacy]}</p>
        </div>
        <div className="grid gap-2.5">
          <a className={textLink} href="/docs/attestation#data-handling">
            Sonnely’s gateway boundary
          </a>
          <a className={textLink} href={providerSources[entry.provider]}>
            {providerName} model catalog <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </section>
      {alternates.length > 0 && (
        <nav className="grid gap-3" aria-label="Other providers for this model">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Other providers
          </h2>
          <div className="flex flex-wrap gap-2">
            {alternates.map((alternate) => (
              <a
                className={buttonSmall}
                href={modelDetailHref(alternate)}
                key={alternate.provider + "/" + alternate.upstreamId}
              >
                {providerNames[alternate.provider]}{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ))}
          </div>
        </nav>
      )}
      {entry.routes.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className={caption}>
              API examples use a funded Sonnely API key stored as{" "}
              <code className={monoSm}>SONNELY_API_KEY</code>. Rates are in USD.
            </p>
            <a className={textLink} href="/console/keys">
              Manage API keys
            </a>
          </div>
          {entry.routes.map((route) => (
            <EndpointCard key={route.endpoint} entry={entry} route={route} available={available} />
          ))}
        </>
      ) : (
        <section className={panel + " flex flex-wrap items-start justify-between gap-6"} aria-labelledby="catalog-only">
          <div>
            <h2 id="catalog-only" className="text-lg font-medium">
              Provider catalog only
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              See the provider catalog for usage and pricing for this entry.
            </p>
          </div>
          <a className={textLink} href="/models#available-models">
            Browse Sonnely models
          </a>
        </section>
      )}
    </div>
  );
}
