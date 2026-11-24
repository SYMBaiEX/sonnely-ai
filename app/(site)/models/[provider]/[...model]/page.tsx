import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { CopyButton } from "@/components/shared";
import { SiteLead } from "@/components/site-lead";
import { configuredProviders } from "@/lib/managed-access";
import {
  contextFormat,
  endpointDocs,
  modelCatalogEntries,
  modelDetailHref,
  modelPlaygroundHref,
  rateLabels,
  workloadNames,
  type ModelCatalogEntry,
  type ModelCatalogRoute,
} from "@/lib/model-catalog";
import { modelApiExample } from "@/lib/model-examples";
import { routeLabels, type PrivacyRoute } from "@/lib/model-privacy";
import { models } from "@/lib/models";
import { formatRate } from "@/lib/pricing";
import { agentCapabilities } from "@/lib/provider-catalog";
import { providerNames, type ProviderId } from "@/lib/provider-models";
import styles from "./model-detail.module.css";

type Props = { params: Promise<{ provider: string; model: string[] }> };

const providerSources: Record<ProviderId, string> = {
  "near-ai": "https://near.ai/models",
  phala: "https://phala.com/models",
  tinfoil: "https://tinfoil.sh/models",
};

const privacyDescriptions: Record<PrivacyRoute, string> = {
  "private-tee": "The provider classifies model execution as running in a trusted execution environment.",
  "private-3p-tee":
    "The provider classifies model execution as running in a third-party trusted execution environment.",
  incognito:
    "Incognito is a provider catalog classification. Model execution follows the upstream operator’s data handling terms.",
  unclassified: "The provider’s privacy classification for this catalog entry is unpublished.",
};

async function loadModel(params: Props["params"]) {
  const { provider, model } = await params;
  const upstreamId = model.join("/");
  const entry = modelCatalogEntries.find((row) => row.provider === provider && row.upstreamId === upstreamId);
  if (!entry) notFound();
  return entry;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const model = await loadModel(params);
  return {
    title: model.name + " on " + providerNames[model.provider],
    description: "Review this model’s context, provider privacy classification, and availability on Sonnely.",
    alternates: { canonical: modelDetailHref(model) },
  };
}

function EndpointCard({
  entry,
  route,
  available,
}: {
  entry: ModelCatalogEntry;
  route: ModelCatalogRoute;
  available: boolean;
}) {
  const { endpoint, modelId, rates } = route;
  const endpointName = workloadNames[endpoint];
  const id = endpoint.replaceAll("/", "-");
  const chatModel =
    endpoint === "chat/completions" ? models.find((model) => model.id === modelId) : undefined;
  const capabilities =
    chatModel &&
    agentCapabilities(
      chatModel,
      entry.provider,
      available && process.env.SONNELY_AGENT_CAPABILITIES === "true",
    );
  const example = modelApiExample(route, entry.provider);

  return (
    <section className={"panel " + styles.endpoint} id={id} aria-labelledby={id + "-heading"}>
      <div className={styles.endpointInfo}>
        <h2 id={id + "-heading"}>{endpointName}</h2>
        <p className={styles.endpointPath}>
          <span>{endpoint === "realtime" ? "WebSocket" : "POST"}</span> <code>/{endpoint}</code>
        </p>
        <dl className={styles.rateList}>
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
        {capabilities && (
          <ul className={styles.capabilities} aria-label="Chat capabilities" role="list">
            <li>Streaming</li>
            <li>Completion receipts</li>
            {capabilities.tools && <li>Function calling</li>}
            {capabilities.structured_outputs && <li>Structured outputs</li>}
          </ul>
        )}
        <Link className="text-link" href={endpointDocs(endpoint)}>
          Endpoint guide <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className={styles.example}>
        <div className={styles.exampleHead}>
          <h3>{example.language} example</h3>
          <CopyButton value={example.code} label={"Copy example for " + endpointName} text="Copy example" />
        </div>
        {example.note && <p className="caption">{example.note}</p>}
        <pre aria-label={example.language + " request example"}>
          <code>{example.code}</code>
        </pre>
      </div>
    </section>
  );
}

export default async function ModelDetail({ params }: Props) {
  const entry = await loadModel(params);
  const available = entry.routes.length > 0 && configuredProviders().includes(entry.provider);
  const provider = providerNames[entry.provider];
  const status = available
    ? "Available on Sonnely"
    : entry.routes.length
      ? "Unavailable on Sonnely"
      : "Provider catalog only";
  const chat = entry.routes.find(({ endpoint }) => endpoint === "chat/completions");
  const modelIds = new Set(entry.routes.map(({ modelId }) => modelId));
  const alternates = modelCatalogEntries.filter(
    (row) => row.provider !== entry.provider && row.routes.some(({ modelId }) => modelIds.has(modelId)),
  );

  return (
    <div className={"wrap inner-page market-page " + styles.detail}>
      <SiteLead
        title={entry.name}
        description={entry.summary ?? `Model details for ${provider}.`}
        back={["/models", "Models"]}
        status={status}
        brief={{
          title: "Model information",
          rows: [
            ["Provider", provider],
            ["Provider model ID", entry.upstreamId],
            [
              "Context window",
              entry.context ? contextFormat.format(entry.context) + " tokens" : "Unpublished",
            ],
            ["Privacy classification", routeLabels[entry.privacyRoute]],
          ],
        }}
      >
        {available && chat && (
          <Link className="button accent" href={modelPlaygroundHref(chat.modelId, entry.provider)}>
            Open in Playground <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        )}
      </SiteLead>
      <section className={"panel " + styles.privacy} aria-labelledby="model-privacy">
        <div>
          <h2 id="model-privacy">{routeLabels[entry.privacyRoute]}</h2>
          <p>{privacyDescriptions[entry.privacyRoute]}</p>
        </div>
        <div className={styles.links}>
          <Link className="text-link" href="/docs/attestation#data-handling">
            Sonnely’s gateway boundary
          </Link>
          <a className="text-link" href={providerSources[entry.provider]}>
            {provider} model catalog <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </section>
      {alternates.length > 0 && (
        <nav className={styles.alternates} aria-label="Other providers for this model">
          <h2>Other providers</h2>
          <div className={styles.links}>
            {alternates.map((model) => (
              <Link
                className="button quiet small"
                href={modelDetailHref(model)}
                key={model.provider + "/" + model.upstreamId}
              >
                {providerNames[model.provider]} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </nav>
      )}
      {entry.routes.length ? (
        <>
          <div className={styles.apiLead}>
            <p className="caption">
              API examples use a funded Sonnely API key stored as <code>SONNELY_API_KEY</code>. Rates are in
              USD.
            </p>
            <Link className="text-link" href="/console/keys">
              Manage API keys
            </Link>
          </div>
          {entry.routes.map((route) => (
            <EndpointCard key={route.endpoint} entry={entry} route={route} available={available} />
          ))}
        </>
      ) : (
        <section className={"panel " + styles.privacy} aria-labelledby="catalog-only">
          <div>
            <h2 id="catalog-only">Provider catalog only</h2>
            <p>See the provider catalog for usage and pricing for this entry.</p>
          </div>
          <Link className="text-link" href="/models#available-models">
            Browse Sonnely models
          </Link>
        </section>
      )}
    </div>
  );
}
