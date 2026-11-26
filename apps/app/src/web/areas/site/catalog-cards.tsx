// spec/app/models.md, "Story: Filter the catalog"; spec/app/console/catalog.md, "Story: Browse the catalog"
import { ArrowUpRight, Check, ChevronDown, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@repo/ui";
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

const statusClasses: Record<CatalogStatus["tone"], string> = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  info: "border-info/30 bg-info/10 text-info",
  muted: "border-border bg-secondary text-muted-foreground",
};

const shortRateLabels: Record<CatalogRateKind, string> = {
  input: "Input / 1M",
  cache: "Cached / 1M",
  output: "Output / 1M",
  request: "Per request",
  session: "Per session",
};

function CopyInline({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      onBlur={() => setStatus("")}
      onPointerLeave={() => setStatus("")}
      aria-label={status || label}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
    >
      {status === "Copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span>{status || "Copy ID"}</span>
    </button>
  );
}

function StatusPill({ status }: { status: CatalogStatus }) {
  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-medium", statusClasses[status.tone])}>
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
    <nav className="flex items-center gap-1.5" aria-label="Catalog pages">
      <button
        type="button"
        className="min-h-9 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={page === 1}
        onClick={() => choose(page - 1)}
      >
        Previous
      </button>
      <span className="px-1 text-xs text-muted-foreground" data-catalog-page>
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        className="min-h-9 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={page === pageCount}
        onClick={() => choose(page + 1)}
      >
        Next
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
  const context = entry.context ? contextFormat.format(entry.context) + " tokens" : "Context unpublished";
  return (
    <section className="rounded-lg border border-border bg-secondary/45 p-3.5" data-provider-entry>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground">{entry.providerName}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entry.privacyLabel} · {context}
          </p>
          <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">{entry.upstreamId}</code>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} />
          <a className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline" href={entry.detailHref}>
            Details <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      </div>
      {entry.routes.length ? (
        <ul className="mt-3 grid gap-2" role="list">
          {entry.routes.map((route) => (
            <li key={route.endpoint + "/" + route.modelId} className="rounded-md border border-border bg-card p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.8fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <a
                    href={route.docsHref}
                    className="text-sm font-medium text-primary hover:underline"
                    aria-label={`/${route.endpointPath} · ${route.endpointLabel} guide`}
                  >
                    {route.endpointLabel}
                  </a>
                  <code className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">/{route.endpointPath}</code>
                  {route.modelId !== entry.upstreamId && (
                    <code className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{route.modelId}</code>
                  )}
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" role="list">
                  {route.rates.map((rate) => (
                    <li key={rate.kind}>
                      <strong className="font-medium text-foreground">{rate.text}</strong> {rate.label}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {route.chatHref && (
                    <a href={route.chatHref} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Open in chat <ArrowUpRight size={13} aria-hidden="true" />
                    </a>
                  )}
                  <CopyInline value={route.modelId} label={`Copy ID for ${entry.name} on ${entry.providerName}`} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Provider catalog only</span>
          <span className="block">{entry.workloadLabel}</span>
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
    { label: "Context", value: group.context ? contextFormat.format(group.context) : "—" },
    ...priceMetrics(group),
  ];
  if (metrics.length < 3) metrics.push({ label: "Endpoints", value: String(endpointLabels.length) });
  if (metrics.length < 3) metrics.push({ label: "Providers", value: String(group.providers.length) });
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm" data-canonical-model>
      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.95fr)_auto] xl:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary font-mono text-sm font-semibold text-muted-foreground">
            {representative.mark || representative.name.match(/[a-z0-9]/i)?.[0]?.toUpperCase() || "•"}
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-medium text-foreground">
              <a href={representative.detailHref} className="hover:underline">{group.name}</a>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {providerText} · {representative.privacyLabel}
              {endpointLabels.length > 0 && <> · {endpointLabels.slice(0, 3).join(" · ")}{endpointLabels.length > 3 ? ` +${endpointLabels.length - 3}` : ""}</>}
            </p>
            <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">{modelId}</code>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg bg-secondary/60 px-2.5 py-2">
              <dt className="text-[11px] leading-4 text-muted-foreground">{metric.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{metric.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <StatusPill status={status} />
          {chatRoute?.chatHref && (
            <a href={chatRoute.chatHref} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline">
              Open in chat <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      <details className="group border-t border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 sm:px-5">
          <span>Compare provider routes</span>
          <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"} · {routeText}
            <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="grid gap-3 border-t border-border p-3.5 sm:p-4">
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
    <div className="grid gap-3" id="model-rates">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" role="status">
          {groups.length === 0
            ? "No models match your filters."
            : `${groups.length} ${groups.length === 1 ? "model" : "models"} · showing ${start + 1}–${start + visible.length}`}
        </p>
        <Pagination page={page} pageCount={pageCount} choose={choose} />
      </div>
      {visible.length > 0 && (
        <div className="grid gap-3">
          {visible.map((group) => (
            <ModelCard key={group.key} group={group} statuses={statuses} />
          ))}
        </div>
      )}
      {visible.length > 0 && (
        <div className="flex justify-end">
          <Pagination page={page} pageCount={pageCount} choose={choose} />
        </div>
      )}
    </div>
  );
}
