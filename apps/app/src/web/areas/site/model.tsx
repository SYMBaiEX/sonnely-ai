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
import { buttonAccent, buttonSmall, caption, textLink, wrap } from "./ui.ts";

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
    <section className="panel model-endpoint" id={id} aria-labelledby={id + "-heading"}>
      <div className="model-endpointInfo">
        <h2 id={id + "-heading"}>{endpointName}</h2>
        <p className="model-endpointPath">
          <span>{endpoint === "Realtime" ? "WebSocket" : "POST"}</span> <code>/{path}</code>
        </p>
        <dl className="model-rateList">
          <div>
            <dt>API model ID</dt>
            <dd>
              <code>{modelId}</code>
            </dd>
          </div>
          {rateLabels.map(([key, label]) =>
            rates[key] === undefined ? null : (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{formatRate(rates[key])}</dd>
              </div>
            ),
          )}
        </dl>
        {endpoint === "ChatCompletions" && (
          <ul className="model-capabilities" aria-label="Chat capabilities" role="list">
            <li>Streaming</li>
            <li>Completion receipts</li>
            {deepseek && <li>Function calling</li>}
            {deepseek && entry.provider === "Tinfoil" && <li>Structured outputs</li>}
          </ul>
        )}
        <a className={textLink} href={endpointDocs(endpoint)}>
          Endpoint guide <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
      <div className="model-example">
        <div className="model-exampleHead">
          <h3>{example.language} example</h3>
          <CopyButton
            value={example.code}
            label={"Copy example for " + endpointName}
            text="Copy example"
          />
        </div>
        {example.note && <p className={caption}>{example.note}</p>}
        <pre aria-label={example.language + " request example"}>
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
    <div className={wrap + " inner-page market-page model-detail"}>
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
          <a className={buttonAccent} href={modelPlaygroundHref(chat.modelId, entry.provider)}>
            Open in Playground <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        )}
      </SiteLead>
      <section className="panel model-privacy" aria-labelledby="model-privacy">
        <div>
          <h2 id="model-privacy">{routeLabels[entry.privacy]}</h2>
          <p>{privacyDescriptions[entry.privacy]}</p>
        </div>
        <div className="model-links">
          <a className={textLink} href="/docs/attestation#data-handling">
            Sonnely’s gateway boundary
          </a>
          <a className={textLink} href={providerSources[entry.provider]}>
            {providerName} model catalog <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </section>
      {alternates.length > 0 && (
        <nav className="model-alternates" aria-label="Other providers for this model">
          <h2>Other providers</h2>
          <div className="model-links">
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
          <div className="model-apiLead">
            <p className={caption}>
              API examples use a funded Sonnely API key stored as <code>SONNELY_API_KEY</code>. Rates are in
              USD.
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
        <section className="panel model-privacy" aria-labelledby="catalog-only">
          <div>
            <h2 id="catalog-only">Provider catalog only</h2>
            <p>See the provider catalog for usage and pricing for this entry.</p>
          </div>
          <a className={textLink} href="/models#available-models">
            Browse Sonnely models
          </a>
        </section>
      )}
    </div>
  );
}
