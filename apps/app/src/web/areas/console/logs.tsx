// spec/app/console/logs.md, "Story: Review request activity"
import { Activity, ArrowUpRight, Download, List, RefreshCw, Search } from "lucide-react";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button, Input, Select } from "@repo/ui";
import type { LogEntry, Logs, LogStatus, Window } from "../../../../gen/app__console__logs.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import { visible } from "../../../../gen/app__console__logs.ts";
import { useRemote, type Remote } from "../../remote.ts";
import { SearchField } from "../../search.tsx";
import { useWorkspaceSession } from "./frame.tsx";
import {
  CopyButton,
  FilterPanel,
  WorkspaceHeading,
  amount,
  creditBalance,
  creditDecimal,
  milliseconds,
} from "./bits.tsx";
import { providerIds, providerNames } from "./logs-shared.tsx";
import { DataTable, DetailRows, FieldLabel, SideDrawer, StatusPill, panelClass } from "./ops.tsx";

const defaults = { days: "7", provider: "", model: "", keyName: "", status: "" };
const statusLabels: Record<LogStatus, string> = {
  Pending: "In progress",
  Complete: "Completed",
  Failed: "Failed",
  Unreported: "Under review",
};
const lowerStatus: Record<string, LogStatus> = {
  pending: "Pending",
  complete: "Complete",
  failed: "Failed",
  unreported: "Unreported",
};
const machineStatus: Record<LogStatus, string> = {
  Pending: "pending",
  Complete: "complete",
  Failed: "failed",
  Unreported: "unreported",
};
const formatTime = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});
const time = (value: number) => formatTime.format(value) + " UTC";
const modelNames = new Map(
  catalog.flatMap((entry) =>
    entry.routes.filter((route) => route.endpoint === "chat/completions").map((route) => [route.modelId, entry.name]),
  ),
);
const windows: Record<string, Window> = { "7": "Week", "30": "Month", "90": "Quarter", all: "AllTime" };
const windowDays: Record<Window, string> = { Week: "7", Month: "30", Quarter: "90", AllTime: "all" };
const logPath = "/console/logs";
const pageSize = 50;

const sampleHistoryIds = new Set(["req-4f8c2a1b9d0e6f5a2b3c", "req-77aa10bc9d2f4e6a8c0d", "req-1b2c3d4e5f6a7b8c9d0e"]);

type LogRow = LogEntry & {
  providerRejections?: { provider: string; model: string; startedAt: number; endedAt: number; httpStatus: 429 }[];
  providerRequest?: string;
  providerStatus?: number;
  outcome?: string;
  settledAt?: number;
  providerDurationMs?: number;
  timeToFirstTokenMs?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  stream?: boolean;
};

const locationEvent = "sonnely:locationchange";

function interceptLogsPopstate(event: Event) {
  if (window.location.pathname !== logPath) return;
  event.stopImmediatePropagation();
  window.dispatchEvent(new Event(locationEvent));
}

if (typeof window !== "undefined") window.addEventListener("popstate", interceptLogsPopstate);

function subscribeLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(locationEvent, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(locationEvent, callback);
  };
}

function locationSearch() {
  return window.location.search;
}

function navigateLogs(path: string, replace = false) {
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(locationEvent));
}

function detailPath(id: string) {
  return logPath + "?" + new URLSearchParams({ request: id }).toString();
}

function rowTime(row: LogRow) {
  return row.time > 0 ? row.time : Date.now() - row.ageDays * 86_400_000;
}

function billing(row: LogRow) {
  if (row.status === "Failed") return "Released";
  return (row.status === "Complete" ? "Charged " : "Reserved ") + creditBalance(row.cost);
}

function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function requestLogCsv(rows: readonly LogRow[]) {
  const header = [
    "request_id",
    "time_utc",
    "model",
    "provider",
    "endpoint",
    "key_name",
    "status",
    "input_tokens",
    "output_tokens",
    "cached_tokens",
    "reasoning_tokens",
    "duration_ms",
    "charged_usd",
    "reserved_usd",
    "provider_status",
  ];
  return (
    [
      header.join(","),
      ...rows.map((row) =>
        [
          row.id,
          new Date(rowTime(row)).toISOString(),
          row.model,
          row.provider,
          row.endpoint ?? "",
          row.keyName,
          machineStatus[row.status],
          row.input,
          row.output,
          row.cachedTokens ?? "",
          row.reasoningTokens ?? "",
          row.durationMs ?? "",
          row.status === "Complete" ? creditDecimal(row.cost) : "",
          row.status === "Pending" || row.status === "Unreported" ? creditDecimal(row.cost) : "",
          row.providerStatus ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}

function RequestDetail({ id, row, loaded, close }: { id: string; row: LogRow | undefined; loaded: boolean; close: () => void }) {
  const [error, setError] = useState("");
  const linkClass = "inline-flex w-max items-center gap-1 text-ui text-primary hover:underline";

  return (
    <SideDrawer
      open
      onOpenChange={(next) => { if (!next) close(); }}
      title={(
        <>
          <h2 id="request-detail-heading" className="text-heading leading-heading font-medium">Request details</h2>
          {row && <p className="mt-1 text-meta text-muted-foreground">{statusLabels[row.status]} · {time(rowTime(row))}</p>}
        </>
      )}
    >
      <div className="grid gap-5">
        {error ? (
          <>
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-ui text-destructive" role="alert">{error}</p>
            <Button type="button" variant="ghost" size="sm" className="w-max" onClick={() => setError("")}>Retry</Button>
          </>
        ) : !row && loaded ? (
          <p role="status" className="text-ui text-muted-foreground">Request {id} is not in this workspace’s history. Check the reference, or sign in with the wallet that ran it.</p>
        ) : !row ? (
          <p role="status" className="text-ui text-muted-foreground">Loading request details…</p>
        ) : (
          <>
            {sampleHistoryIds.has(row.id) && (
              <p className="rounded-md border border-border bg-secondary px-3 py-2 text-meta text-muted-foreground" role="note">Sample row: part of the seeded example history every workspace opens with, not a real request you ran.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <CopyButton value={row.id} label="Copy request reference" quiet={false} />
              <CopyButton value={location.origin + detailPath(row.id)} label="Copy link to request" quiet={false} />
            </div>
            <h3 className="text-body font-strong">Route and status</h3>
            {!!row.providerRejections?.length && (
              <ol className="grid gap-1.5 rounded-md border border-border bg-secondary/50 p-3 text-ui text-muted-foreground" aria-label="Provider attempts">
                {row.providerRejections.map((attempt) => (
                  <li key={attempt.provider}>
                    {providerNames[attempt.provider] ?? attempt.provider} · Rate limited (HTTP 429) · {milliseconds(attempt.endedAt - attempt.startedAt)}
                  </li>
                ))}
                <li>{providerNames[row.provider] ?? row.provider} · {statusLabels[row.status]}</li>
              </ol>
            )}
            <DetailRows
              fields={[
                ["Request reference", row.id],
                ["Model ID", row.model],
                ["Provider", providerNames[row.provider] ?? row.provider],
                ["Endpoint", row.endpoint ? "/" + row.endpoint : undefined],
                ["Key", row.keyName],
                ["Provider status", row.providerStatus],
                ["Provider request", row.providerRequest],
                ["Outcome", row.outcome],
                ["Streaming", row.stream === undefined ? undefined : row.stream ? "Yes" : "No"],
              ]}
            />
            <h3 className="text-body font-strong">Usage and billing</h3>
            <DetailRows
              fields={[
                ["Billing", billing(row)],
                ["Input tokens", amount(row.input)],
                ["Output tokens", amount(row.output)],
                ["Cached input tokens", amount(row.cachedTokens)],
                ["Reasoning output tokens", amount(row.reasoningTokens)],
              ]}
            />
            <h3 className="text-body font-strong">Timing</h3>
            <DetailRows
              fields={[
                ["Started", time(rowTime(row))],
                ["Settled", row.settledAt === undefined ? undefined : time(row.settledAt)],
                ["Total duration", milliseconds(row.durationMs)],
                ["Provider duration", milliseconds(row.providerDurationMs)],
                ["Time to first token", milliseconds(row.timeToFirstTokenMs)],
              ]}
            />
            {(row.endpoint === "chat/completions" || !row.endpoint) && (
              <a className={linkClass} href="/verify">Inspect a completion receipt <ArrowUpRight size={15} aria-hidden="true" /></a>
            )}
            <a className={linkClass} href="/console/support">Get help with a request <ArrowUpRight size={15} aria-hidden="true" /></a>
          </>
        )}
      </div>
    </SideDrawer>
  );
}

function LogResults({ rows, error, open }: { rows: LogRow[]; error: string | undefined; open: (id: string) => void }) {
  const [limit, setLimit] = useState(pageSize);
  const shown = rows.slice(0, limit);
  const nextCursor = rows.length > limit;

  function exportRows() {
    if (!rows.length) return;
    const blob = new Blob([requestLogCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sonnely-request-logs-" + new Date().toISOString().slice(0, 10) + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={`${panelClass} grid gap-4`} aria-labelledby="request-log-table-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="request-log-table-heading" className="text-heading leading-heading font-medium">Request history</h2>
        <Button type="button" variant="ghost" size="sm" disabled={!rows.length} onClick={exportRows}>
          <Download size={16} aria-hidden="true" /> Export loaded CSV
        </Button>
      </div>
      <p role="status" className="text-ui text-muted-foreground">
        {!rows.length ? error ? "Request history unavailable." : "No matching requests." : `${rows.length} ${rows.length === 1 ? "request" : "requests"} loaded`}
      </p>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-ui text-destructive" role="alert">{error}</p>}
      {!!shown.length && (
        <DataTable
          rows={shown}
          rowKey={(row) => row.id}
          labelledBy="request-log-table-heading"
          columns={[
            {
              label: "Request", header: true, value: (row) => (
                <span className="grid gap-1 whitespace-normal">
                  <a
                    className="inline-flex w-max text-ui font-medium text-primary hover:underline"
                    href={detailPath(row.id)}
                    aria-label={`View ${modelNames.get(row.model) ?? row.model} request ${row.id}`}
                    onClick={(event) => { event.preventDefault(); open(row.id); }}
                  >
                    {modelNames.get(row.model) ?? row.model}
                  </a>
                  <span className="text-meta text-muted-foreground">{time(rowTime(row))}</span>
                  {row.endpoint && <code className="font-mono text-meta text-muted-foreground">/{row.endpoint}</code>}
                  {sampleHistoryIds.has(row.id) && <span className="text-meta text-muted-foreground">Sample</span>}
                </span>
              ),
            },
            { label: "Provider", value: (row) => providerNames[row.provider] ?? row.provider },
            {
              label: "Status",
              value: (row) => <StatusPill tone={row.status === "Complete" ? "ok" : row.status === "Failed" ? "destructive" : row.status === "Pending" ? "info" : "warn"}>{statusLabels[row.status]}</StatusPill>,
            },
            { label: "Duration", value: (row) => milliseconds(row.durationMs) ?? "—" },
            { label: "Tokens", value: (row) => amount(row.input + row.output) },
            { label: "Billing", span: true, value: (row) => billing(row) },
          ]}
        />
      )}
      {nextCursor && (
        <div className="flex justify-center border-t border-border pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setLimit((value) => value + pageSize)}>Load older requests</Button>
        </div>
      )}
    </section>
  );
}

function machineDraft(state: Logs): typeof defaults {
  return {
    days: windowDays[state.window],
    provider: state.provider,
    model: state.model,
    keyName: state.keyName,
    status: state.showing.tag === "One" ? machineStatus[state.showing.status] : "",
  };
}

function filtersAreDefault(state: Logs | undefined) {
  return !state || (state.window === "Week" && !state.provider && !state.model && !state.keyName && state.showing.tag === "AnyStatus");
}

function FiltersForm({ initial, logs }: { initial: typeof defaults; logs: Remote<Logs> }) {
  const [draft, setDraft] = useState(initial);

  async function sendFilters(applied: typeof defaults) {
    await logs.send({ type: "setWindow", window: windows[applied.days] ?? "Week" });
    await logs.send({ type: "setProvider", provider: applied.provider });
    await logs.send({
      type: "setShowing",
      showing: applied.status ? { tag: "One", status: lowerStatus[applied.status] } : { tag: "AnyStatus" },
    });
    await logs.send({ type: "setModel", model: applied.model.trim() });
    await logs.send({ type: "setKeyName", keyName: applied.keyName.trim() });
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const applied = { ...draft, model: draft.model.trim(), keyName: draft.keyName.trim() };
    setDraft(applied);
    await sendFilters(applied);
  }

  return (
    <form className="grid w-full gap-3" onSubmit={(event) => void applyFilters(event)}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FieldLabel>Date range<Select value={draft.days} onChange={(event) => setDraft({ ...draft, days: event.target.value })}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></Select></FieldLabel>
        <FieldLabel>Provider<Select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })}><option value="">All providers</option>{providerIds.map((id) => <option key={id} value={id}>{providerNames[id]}</option>)}</Select></FieldLabel>
        <FieldLabel>Status<Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">All statuses</option>{Object.keys(lowerStatus).map((id) => <option key={id} value={id}>{statusLabels[lowerStatus[id]]}</option>)}</Select></FieldLabel>
        <FieldLabel>Model ID<Input value={draft.model} maxLength={100} placeholder="Any model" onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></FieldLabel>
        <FieldLabel>Key name<Input value={draft.keyName} maxLength={60} placeholder="Any key" onChange={(event) => setDraft({ ...draft, keyName: event.target.value })} /></FieldLabel>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit">Apply filters</Button>
        <Button variant="ghost" type="button" disabled={filtersAreDefault(logs.state)} onClick={() => void logs.send({ type: "resetFilters" })}>Reset</Button>
        <Button variant="ghost" type="button" onClick={() => void sendFilters(initial)}><RefreshCw size={15} aria-hidden="true" /> Refresh</Button>
      </div>
    </form>
  );
}

export function LogsSection() {
  const session = useWorkspaceSession();
  const logs = useRemote<Logs>("console__logs");
  const [lookup, setLookup] = useState("");
  const requestId = new URLSearchParams(useSyncExternalStore(subscribeLocation, locationSearch)).get("request");
  const state = logs.state;

  const [mountedAt] = useState(() => Date.now());
  const rows = useMemo(() => {
    if (!state) return [];
    const aged = {
      ...state,
      entries: state.entries.map((entry) =>
        entry.time > 0 ? { ...entry, ageDays: Math.max(0, Math.floor((mountedAt - entry.time) / 86_400_000)) } : entry,
      ),
    };
    return visible(aged);
  }, [state, mountedAt]);
  const allRows = useMemo(() => state?.entries ?? [], [state]);
  const detailRow = requestId ? allRows.find((row) => row.id === requestId) : undefined;

  const signedIn = session.state?.tag === "SignedIn";
  const filterSignature = state
    ? JSON.stringify([state.window, state.provider, state.model, state.keyName, state.showing.tag === "One" ? state.showing.status : ""])
    : "loading";

  function closeDetail() {
    navigateLogs(logPath, true);
  }

  function openDetail(id: string) {
    navigateLogs(detailPath(id));
  }

  return (
    <div className="grid gap-4">
      <WorkspaceHeading icon={List} title="Request logs" description="Inspect routing, timing, tokens, and charges.">
        <Button asChild variant="ghost" size="sm"><a href="/console/usage"><Activity size={16} aria-hidden="true" /> View usage</a></Button>
      </WorkspaceHeading>
      {!signedIn ? (
        <p className={`${panelClass} text-ui text-muted-foreground`}>Connect a Solana wallet to view your request logs.</p>
      ) : (
        <>
          <section className="grid gap-3" aria-label="Request log controls">
            <form
              className={`${panelClass} flex flex-wrap items-end gap-3`}
              onSubmit={(event) => {
                event.preventDefault();
                const id = lookup.trim().toLowerCase();
                if (id) openDetail(id);
              }}
            >
              <FieldLabel className="min-w-64 flex-1 max-md:min-w-0 max-md:basis-full">
                Find a request by reference
                <SearchField
                  id="log-lookup-input"
                  placeholder="Paste a request reference"
                  minLength={20}
                  maxLength={80}
                  pattern="[a-zA-Z0-9-]{20,80}"
                  spellCheck={false}
                  autoComplete="off"
                  required
                  value={lookup}
                  onChange={(event) => setLookup(event.target.value)}
                />
              </FieldLabel>
              <Button type="submit" variant="ghost"><Search size={16} aria-hidden="true" /> Find request</Button>
            </form>
            <FilterPanel
              label="Filter requests"
              active={state ? [state.window !== "Week", !!state.provider, !!state.model, !!state.keyName, state.showing.tag !== "AnyStatus"].filter(Boolean).length : 0}
            >
              <FiltersForm key={filterSignature} initial={state ? machineDraft(state) : defaults} logs={logs} />
            </FilterPanel>
          </section>
          <LogResults key={state ? windowDays[state.window] + state.provider + state.model + state.keyName + state.showing.tag : "loading"} rows={rows} error={logs.error} open={openDetail} />
          {requestId && <RequestDetail key={requestId} id={requestId} row={detailRow} loaded={state !== undefined} close={closeDetail} />}
        </>
      )}
    </div>
  );
}
