// spec/app/models.md, "Story: Filter the catalog"; spec/app/console/catalog.md, "Story: Browse the catalog"
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Terminal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button, Card, CopyButton, EmptyState, cn } from "@repo/ui";
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

const statusTones: Record<CatalogStatus["tone"], string> = {
  ok: "text-ok",
  warn: "text-warn",
  info: "text-info",
  muted: "text-muted-foreground",
};

function StatusReadout({ status }: { status: CatalogStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap font-mono text-micro font-medium", statusTones[status.tone])}>
      <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
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
    <nav className="flex items-center gap-2" aria-label="Catalog pages">
      <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => choose(page - 1)} aria-label="Previous catalog page">
        <ArrowLeft size={13} aria-hidden="true" />
        <span className="hidden sm:inline">Prev</span>
      </Button>
      <span className="whitespace-nowrap font-mono text-micro text-muted-foreground">
        page {page} / {pageCount}
      </span>
      <Button type="button" variant="outline" size="sm" disabled={page === pageCount} onClick={() => choose(page + 1)} aria-label="Next catalog page">
        <span className="hidden sm:inline">Next</span>
        <ArrowRight size={13} aria-hidden="true" />
      </Button>
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
    <section className="border-t border-border px-4 py-4 first:border-t-0 sm:px-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-ui font-strong text-foreground">{entry.providerName}</h4>
          <p className="mt-1 text-meta text-muted-foreground">
            {entry.privacyLabel} · {context}
          </p>
          <code className="mt-2 block break-all font-mono text-micro text-muted-foreground">{entry.upstreamId}</code>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusReadout status={status} />
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-micro text-primary">
            <a href={entry.detailHref}>
              details <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </Button>
        </div>
      </header>
      {entry.routes.length ? (
        <ul className="mt-4 grid gap-3" role="list">
          {entry.routes.map((route) => (
            <li key={route.endpoint + "/" + route.modelId} className="grid gap-3 rounded-md border border-border bg-background p-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(180px,0.8fr)_auto] lg:items-center">
              <div className="min-w-0">
                <a
                  href={route.docsHref}
                  aria-label={`/${route.endpointPath} · ${route.endpointLabel} guide`}
                  className="font-mono text-micro font-medium text-primary underline-offset-4 hover:underline"
                >
                  /{route.endpointPath}
                </a>
                <span className="ml-2 text-meta text-muted-foreground">{route.endpointLabel}</span>
                {route.modelId !== entry.upstreamId && <code className="mt-1 block break-all font-mono text-micro text-muted-foreground">{route.modelId}</code>}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-micro text-muted-foreground" role="list">
                {route.rates.map((rate) => (
                  <li key={rate.kind}>
                    <strong className="font-medium text-foreground">{rate.text}</strong> {rate.label}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-1 lg:justify-end">
                {route.chatHref && (
                  <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-micro text-primary">
                    <a href={route.chatHref}>
                      open in chat <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                  </Button>
                )}
                <CopyButton text="copy id" className="h-8 px-2 font-mono text-micro text-muted-foreground hover:text-foreground" value={route.modelId} label={`Copy ID for ${entry.name} on ${entry.providerName}`} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-border p-3 text-meta text-muted-foreground">
          <strong className="block font-mono text-micro font-medium uppercase tracking-micro text-foreground">provider catalog only</strong>
          <span className="mt-1 block">{entry.workloadLabel}</span>
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
  const [open, setOpen] = useState(false);
  const entriesId = useId();
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
    <article className="border-t border-border first:border-t-0">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/50 px-4 py-2 sm:px-5">
        <span className="flex min-w-0 items-center gap-2 font-mono text-micro text-muted-foreground">
          <Terminal size={12} aria-hidden="true" className="shrink-0" />
          <span className="break-all">{modelId}</span>
        </span>
        <StatusReadout status={status} />
      </div>
      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-accent font-mono text-ui font-medium text-accent-foreground">
            {representative.mark || representative.name.match(/[a-z0-9]/i)?.[0]?.toLowerCase() || "·"}
          </span>
          <div className="min-w-0">
            <h3 className="text-body font-strong leading-tight text-foreground">
              <a href={representative.detailHref} className="underline-offset-4 hover:text-primary hover:underline">
                {group.name}
              </a>
            </h3>
            <p className="mt-1 text-meta text-muted-foreground">
              {providerText} · {representative.privacyLabel}
              {endpointLabels.length > 0 && <> · {endpointLabels.slice(0, 3).join(" · ")}{endpointLabels.length > 3 ? ` +${endpointLabels.length - 3}` : ""}</>}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <dl className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-0">
                <dt className="text-micro text-muted-foreground">{metric.label}</dt>
                <dd className="mt-0.5 break-words font-mono text-meta font-medium text-foreground">{metric.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-1 sm:justify-end">
            {chatRoute?.chatHref && (
              <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-micro text-primary">
                <a href={chatRoute.chatHref}>
                  open in chat <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </Button>
            )}
            <CopyButton text="copy id" className="h-8 px-2 font-mono text-micro text-muted-foreground hover:text-foreground" value={modelId} label={`Copy ID for ${group.name}`} />
          </div>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={entriesId}
        onClick={() => setOpen(!open)}
        className="min-h-11 w-full flex-col items-start justify-center gap-1 rounded-none border-t border-border px-4 text-meta whitespace-normal text-muted-foreground hover:text-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5"
      >
        <span>Compare provider routes</span>
        <span className="inline-flex flex-wrap items-center gap-x-2 font-mono text-micro">
          {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"} · {routeText}
          <ChevronDown size={13} aria-hidden="true" className={cn("transition-transform duration-fast", open && "rotate-180")} />
        </span>
      </Button>
      <div id={entriesId} hidden={!open}>
        {group.entries.map((entry) => (
          <ProviderEntry key={entry.key} entry={entry} status={entryStatus(entry, statuses)} />
        ))}
      </div>
    </article>
  );
}

export function CatalogCards({
  groups,
  filterSignature,
  statuses,
  header,
}: {
  groups: readonly CanonicalModel<CatalogDisplayEntry>[];
  filterSignature: string;
  statuses?: ReadonlyMap<string, CatalogStatus>;
  header?: ReactNode;
}) {
  const [paging, setPaging] = useState({ signature: "", page: 1 });
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const requestedPage = paging.signature === filterSignature ? paging.page : 1;
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const visible = groups.slice(start, start + pageSize);
  const choose = (next: number) => setPaging({ signature: filterSignature, page: next });
  return (
    <Card className="gap-0 overflow-hidden p-0" id="model-rates">
      {header}
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 sm:px-5">
        <p role="status" className="text-meta text-muted-foreground">
          {groups.length === 0
            ? "No models match your filters"
            : `${groups.length} ${groups.length === 1 ? "model" : "models"} · showing ${start + 1}–${start + visible.length}`}
        </p>
        <Pagination page={page} pageCount={pageCount} choose={choose} />
      </div>
      {groups.length === 0 ? (
        <EmptyState title="No models match your filters" />
      ) : (
        <div>
          {visible.map((group) => (
            <ModelCard key={group.key} group={group} statuses={statuses} />
          ))}
        </div>
      )}
      {visible.length > 0 && (
        <div className="flex min-h-12 items-center justify-end border-t border-border px-4 py-2 sm:px-5">
          <Pagination page={page} pageCount={pageCount} choose={choose} />
        </div>
      )}
    </Card>
  );
}
