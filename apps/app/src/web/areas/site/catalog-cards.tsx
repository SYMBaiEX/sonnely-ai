// spec/app/models.md, "Story: Filter the catalog"; spec/app/console/catalog.md, "Story: Browse the catalog"
import { ArrowUpRight, Check, ChevronDown, Copy, Terminal } from "lucide-react";
import { useState } from "react";
import type { CanonicalModel, CatalogIdentity } from "./catalog-groups.ts";

export type CatalogRateKind = "input" | "cache" | "output" | "request" | "session";

export interface CatalogRate {
  readonly kind: CatalogRateKind;
  readonly label: string;
  readonly value: number;
  readonly text: string;
}

export interface CatalogDisplayRoute {
  readonly endpoint: string;
  readonly endpointLabel: string;
  readonly endpointPath: string;
  readonly docsHref: string;
  readonly modelId: string;
  readonly chatHref?: string;
  readonly rates: readonly CatalogRate[];
}

export interface CatalogDisplayEntry extends CatalogIdentity {
  readonly key: string;
  readonly providerName: string;
  readonly privacyLabel: string;
  readonly workloadLabel: string;
  readonly detailHref: string;
  readonly mark: string;
  readonly status: CatalogStatus;
  readonly routes: readonly CatalogDisplayRoute[];
}

export interface CatalogStatus {
  readonly label: string;
  readonly tone: "ok" | "warn" | "info" | "muted";
}

const pageSize = 8;
const contextFormat = new Intl.NumberFormat("en");

const shortRateLabels: Record<CatalogRateKind, string> = {
  input: "input / 1M",
  cache: "cached / 1M",
  output: "output / 1M",
  request: "per request",
  session: "per session",
};

function CopyInline({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("copy failed");
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      onBlur={() => setStatus("")}
      onPointerLeave={() => setStatus("")}
      aria-label={status || label}
      className="catalog-copy"
    >
      {status === "copied" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      <span>{status || "copy id"}</span>
    </button>
  );
}

function StatusReadout({ status }: { status: CatalogStatus }) {
  return (
    <span className="catalog-status" data-tone={status.tone}>
      <i aria-hidden="true" />
      {status.label}
    </span>
  );
}

function bestRate<T extends CatalogDisplayEntry>(group: CanonicalModel<T>, kind: CatalogRateKind) {
  let best: CatalogRate | undefined;
  for (const entry of group.entries) {
    for (const route of entry.routes) {
      for (const rate of route.rates) {
        if (rate.kind === kind && (!best || rate.value < best.value)) best = rate;
      }
    }
  }
  return best;
}

function priceMetrics<T extends CatalogDisplayEntry>(group: CanonicalModel<T>) {
  const input = bestRate(group, "input");
  const output = bestRate(group, "output");
  if (input || output) {
    return [
      { label: shortRateLabels.input, value: input?.text ?? "—" },
      { label: shortRateLabels.output, value: output?.text ?? "—" },
    ];
  }
  return (["request", "session", "cache"] as const).flatMap((kind) => {
    const rate = bestRate(group, kind);
    return rate ? [{ label: shortRateLabels[kind], value: rate.text }] : [];
  }).slice(0, 2);
}

function entryStatus<T extends CatalogDisplayEntry>(
  entry: T,
  statuses: ReadonlyMap<string, CatalogStatus> | undefined,
): CatalogStatus {
  return statuses?.get(entry.key) ?? entry.status;
}

function groupStatus<T extends CatalogDisplayEntry>(
  group: CanonicalModel<T>,
  statuses: ReadonlyMap<string, CatalogStatus> | undefined,
) {
  const statusesForGroup = group.entries.map((entry) => entryStatus(entry, statuses));
  return (
    statusesForGroup.find((status) => status.tone === "ok") ??
    statusesForGroup.find((status) => status.tone === "info") ??
    entryStatus(group.representative, statuses)
  );
}

function Pagination({
  page,
  pageCount,
  choose,
}: {
  page: number;
  pageCount: number;
  choose: (page: number) => void;
}) {
  if (pageCount < 2) return null;
  return (
    <nav className="catalog-pages" aria-label="Catalog pages">
      <button type="button" disabled={page === 1} onClick={() => choose(page - 1)}>
        ← prev
      </button>
      <span data-catalog-page>
        page {page} / {pageCount}
      </span>
      <button type="button" disabled={page === pageCount} onClick={() => choose(page + 1)}>
        next →
      </button>
    </nav>
  );
}

function ProviderEntry({
  entry,
  status,
}: {
  entry: CatalogDisplayEntry;
  status: CatalogStatus;
}) {
  const context = entry.context ? contextFormat.format(entry.context) + " tokens" : "context unpublished";
  return (
    <section className="catalog-provider" data-provider-entry>
      <header className="catalog-provider-head">
        <div className="catalog-provider-id">
          <h4>{entry.providerName}</h4>
          <p>
            {entry.privacyLabel} · {context}
          </p>
          <code>{entry.upstreamId}</code>
        </div>
        <div className="catalog-provider-side">
          <StatusReadout status={status} />
          <a className="catalog-act" href={entry.detailHref}>
            details <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </div>
      </header>
      {entry.routes.length ? (
        <ul className="catalog-routes" role="list">
          {entry.routes.map((route) => (
            <li key={route.endpoint + "/" + route.modelId}>
              <div className="catalog-route-endpoint">
                <a
                  href={route.docsHref}
                  aria-label={`/${route.endpointPath} · ${route.endpointLabel} guide`}
                >
                  /{route.endpointPath}
                </a>
                <span>{route.endpointLabel}</span>
                {route.modelId !== entry.upstreamId && <code>{route.modelId}</code>}
              </div>
              <ul className="catalog-route-rates" role="list">
                {route.rates.map((rate) => (
                  <li key={rate.kind}>
                    <strong>{rate.text}</strong> {rate.label}
                  </li>
                ))}
              </ul>
              <div className="catalog-route-acts">
                {route.chatHref && (
                  <a href={route.chatHref} className="catalog-act">
                    open in chat <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                )}
                <CopyInline value={route.modelId} label={`Copy ID for ${entry.name} on ${entry.providerName}`} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="catalog-provider-inventory">
          <strong>provider catalog only</strong>
          <span>{entry.workloadLabel}</span>
        </div>
      )}
    </section>
  );
}

function ModelCard({
  group,
  statuses,
}: {
  group: CanonicalModel<CatalogDisplayEntry>;
  statuses: ReadonlyMap<string, CatalogStatus> | undefined;
}) {
  const representative = group.representative;
  const modelId = representative.routes[0]?.modelId ?? representative.upstreamId;
  const chatRoute = group.entries.flatMap((entry) => entry.routes).find((route) => route.chatHref);
  const status = groupStatus(group, statuses);
  const endpointLabels = [...new Set(group.entries.flatMap((entry) => entry.routes.map((route) => route.endpointLabel)))];
  const providerText = group.providers.length === 1 ? "1 provider" : `${group.providers.length} providers`;
  const routeText = group.routeCount === 1 ? "1 routed endpoint" : `${group.routeCount} routed endpoints`;
  const metrics = [
    { label: "context", value: group.context ? contextFormat.format(group.context) : "—" },
    ...priceMetrics(group),
  ];
  if (metrics.length < 3) metrics.push({ label: "endpoints", value: String(endpointLabels.length) });
  if (metrics.length < 3) metrics.push({ label: "providers", value: String(group.providers.length) });
  return (
    <article className="term catalog-model" data-canonical-model>
      <div className="term-chrome">
        <span className="term-path catalog-model-path">
          <Terminal size={12} aria-hidden="true" />
          <span>{modelId}</span>
        </span>
        <StatusReadout status={status} />
      </div>
      <div className="catalog-model-main">
        <div className="catalog-model-id">
          <span aria-hidden="true" className="catalog-model-mark">
            {representative.mark || representative.name.match(/[a-z0-9]/i)?.[0]?.toLowerCase() || "·"}
          </span>
          <div>
            <h3>
              <a href={representative.detailHref}>{group.name}</a>
            </h3>
            <p>
              {providerText} · {representative.privacyLabel}
              {endpointLabels.length > 0 && <> · {endpointLabels.slice(0, 3).join(" · ")}{endpointLabels.length > 3 ? ` +${endpointLabels.length - 3}` : ""}</>}
            </p>
          </div>
        </div>
        <dl className="catalog-model-metrics">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
        <div className="catalog-model-acts">
          {chatRoute?.chatHref && (
            <a href={chatRoute.chatHref} className="catalog-act">
              open in chat <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          )}
          <CopyInline value={modelId} label={`Copy ID for ${group.name}`} />
        </div>
      </div>
      <details className="catalog-model-routes">
        <summary>
          <span>compare provider routes</span>
          <span className="catalog-model-routes-meta">
            {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"} · {routeText}
            <ChevronDown size={13} aria-hidden="true" />
          </span>
        </summary>
        <div className="catalog-model-entries">
          {group.entries.map((entry) => (
            <ProviderEntry key={entry.key} entry={entry} status={entryStatus(entry, statuses)} />
          ))}
        </div>
      </details>
    </article>
  );
}

export function CatalogCards({
  groups,
  filterSignature,
  statuses,
}: {
  groups: readonly CanonicalModel<CatalogDisplayEntry>[];
  filterSignature: string;
  statuses?: ReadonlyMap<string, CatalogStatus>;
}) {
  const [paging, setPaging] = useState({ signature: "", page: 1 });
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const requestedPage = paging.signature === filterSignature ? paging.page : 1;
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const visible = groups.slice(start, start + pageSize);
  const choose = (next: number) => setPaging({ signature: filterSignature, page: next });
  return (
    <div className="catalog-list" id="model-rates">
      <div className="catalog-list-meta">
        <p role="status">
          {groups.length === 0
            ? "no models match your filters"
            : `${groups.length} ${groups.length === 1 ? "model" : "models"} · showing ${start + 1}–${start + visible.length}`}
        </p>
        <Pagination page={page} pageCount={pageCount} choose={choose} />
      </div>
      {visible.length > 0 && (
        <div className="catalog-list-grid">
          {visible.map((group) => (
            <ModelCard key={group.key} group={group} statuses={statuses} />
          ))}
        </div>
      )}
      {visible.length > 0 && (
        <div className="catalog-list-foot">
          <Pagination page={page} pageCount={pageCount} choose={choose} />
        </div>
      )}
    </div>
  );
}
