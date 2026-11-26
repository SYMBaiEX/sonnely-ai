/* eslint-disable better-tailwindcss/no-unknown-classes, no-restricted-syntax -- this area intentionally uses the migrated request-log class names and keeps the drawer workflow together */
// spec/app/console/logs.md, "Story: Review request activity"
import { Activity, ArrowUpRight, Download, List, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import type { LogEntry, Logs, LogStatus, Window } from "../../../../gen/app__console__logs.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import { visible } from "../../../../gen/app__console__logs.ts";
import { useRemote } from "../../remote.ts";
import { useWorkspaceSession } from "./frame.tsx";
import {
  CopyButton,
  WorkspaceHeading,
  amount,
  creditBalance,
  creditDecimal,
  milliseconds,
} from "./bits.tsx";
import { providerIds, providerNames } from "./logs-shared.tsx";
import "./logs.css";

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

type LogRow = LogEntry & {
  time?: number;
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
  return row.time ?? Date.now() - row.ageDays * 86_400_000;
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

function DetailList({ fields }: { fields: [string, string | number | undefined][] }) {
  return (
    <dl className="log-details">
      {fields.map(([name, value]) =>
        value === undefined ? null : (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

function RequestDetail({ id, row, close }: { id: string; row: LogRow | undefined; close: () => void }) {
  const [error, setError] = useState("");

  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      className="log-drawer"
      aria-labelledby="request-detail-heading"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <h2 id="request-detail-heading">Request details</h2>
          {row && (
            <p className="caption">
              {statusLabels[row.status]} · {time(rowTime(row))}
            </p>
          )}
        </div>
        <button type="button" className="icon-button" onClick={close} aria-label="Close request details">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="log-drawer-body">
        {error ? (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button type="button" className="button quiet" onClick={() => setError("")}>
              Retry
            </button>
          </>
        ) : !row ? (
          <>
            <p role="status" className="caption">
              Loading request details…
            </p>
            <p className="caption">Reference {id} is not in the loaded workspace history.</p>
          </>
        ) : (
          <>
            <div className="log-actions">
              <CopyButton value={row.id} label="Copy request reference" />
              <CopyButton value={location.origin + detailPath(row.id)} label="Copy link to request" />
            </div>
            <h3>Route and status</h3>
            {!!row.providerRejections?.length && (
              <ol className="route-attempts" aria-label="Provider attempts">
                {row.providerRejections.map((attempt) => (
                  <li key={attempt.provider}>
                    {providerNames[attempt.provider] ?? attempt.provider} · Rate limited (HTTP 429) ·{" "}
                    {milliseconds(attempt.endedAt - attempt.startedAt)}
                  </li>
                ))}
                <li>
                  {providerNames[row.provider] ?? row.provider} · {statusLabels[row.status]}
                </li>
              </ol>
            )}
            <DetailList
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
            <h3>Usage and billing</h3>
            <DetailList
              fields={[
                ["Billing", billing(row)],
                ["Input tokens", amount(row.input)],
                ["Output tokens", amount(row.output)],
                ["Cached input tokens", amount(row.cachedTokens)],
                ["Reasoning output tokens", amount(row.reasoningTokens)],
              ]}
            />
            <h3>Timing</h3>
            <DetailList
              fields={[
                ["Started", time(rowTime(row))],
                ["Settled", row.settledAt === undefined ? undefined : time(row.settledAt)],
                ["Total duration", milliseconds(row.durationMs)],
                ["Provider duration", milliseconds(row.providerDurationMs)],
                ["Time to first token", milliseconds(row.timeToFirstTokenMs)],
              ]}
            />
            {(row.endpoint === "chat/completions" || !row.endpoint) && (
              <a className="text-link" href="/verify">
                Inspect a completion receipt <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
            <a className="text-link" href="/console/support">
              Get help with a request <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </>
        )}
      </div>
    </dialog>
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
    <section className="panel log-panel" aria-labelledby="request-log-table-heading">
      <div className="between">
        <h2 id="request-log-table-heading">Request history</h2>
        <button type="button" className="button quiet" disabled={!rows.length} onClick={exportRows}>
          <Download size={16} aria-hidden="true" /> Export loaded CSV
        </button>
      </div>
      <p role="status" className="caption">
        {!rows.length
          ? error
            ? "Request history unavailable."
            : "No matching requests."
          : `${rows.length} ${rows.length === 1 ? "request" : "requests"} loaded`}
      </p>
      {error && (
        <div className="log-actions">
          <p className="error" role="alert">
            {error}
          </p>
        </div>
      )}
      {!!shown.length && (
        <div className="table-wrap workspace-data-table" role="region" aria-labelledby="request-log-table-heading" tabIndex={0}>
          <table aria-label="Request logs">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Provider</th>
                <th scope="col">Status</th>
                <th scope="col">Duration</th>
                <th scope="col">Tokens</th>
                <th scope="col">Billing</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <div className="log-model">
                      <a
                        className="text-link"
                        href={detailPath(row.id)}
                        aria-label={`View ${modelNames.get(row.model) ?? row.model} request ${row.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          open(row.id);
                        }}
                      >
                        {modelNames.get(row.model) ?? row.model}
                      </a>
                      <span className="caption">{time(rowTime(row))}</span>
                      {row.endpoint && <code className="caption">/{row.endpoint}</code>}
                    </div>
                  </th>
                  <td>{providerNames[row.provider] ?? row.provider}</td>
                  <td>
                    <span className="pill log-status">{statusLabels[row.status]}</span>
                  </td>
                  <td>{milliseconds(row.durationMs) ?? "—"}</td>
                  <td>{amount(row.input + row.output)}</td>
                  <td>{billing(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextCursor && (
        <div className="log-pagination">
          <button type="button" className="button quiet" onClick={() => setLimit((value) => value + pageSize)}>
            Load older requests
          </button>
        </div>
      )}
    </section>
  );
}

export function LogsSection() {
  const session = useWorkspaceSession();
  const logs = useRemote<Logs>("console__logs");
  const [lookup, setLookup] = useState("");
  const [draft, setDraft] = useState(defaults);
  const requestId = new URLSearchParams(useSyncExternalStore(subscribeLocation, locationSearch)).get("request");
  const state = logs.state;

  const rows = useMemo(() => (state ? (visible(state) as LogRow[]) : []), [state]);
  const allRows = useMemo(() => (state?.entries ?? []) as LogRow[], [state]);
  const detailRow = requestId ? allRows.find((row) => row.id === requestId) : undefined;

  const signedIn = session.state?.tag === "SignedIn";

  function closeDetail() {
    navigateLogs(logPath, true);
  }

  function openDetail(id: string) {
    navigateLogs(detailPath(id));
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const applied = { ...draft, model: draft.model.trim(), keyName: draft.keyName.trim() };
    setDraft(applied);
    await logs.send({ type: "setWindow", window: windows[applied.days] ?? "Week" });
    await logs.send({ type: "setProvider", provider: applied.provider });
    await logs.send({
      type: "setShowing",
      showing: applied.status ? { tag: "One", status: lowerStatus[applied.status] } : { tag: "AnyStatus" },
    });
    await logs.send({ type: "setModel", model: applied.model });
    await logs.send({ type: "setKeyName", keyName: applied.keyName });
  }

  function resetFilters() {
    setDraft(defaults);
    void logs.send({ type: "resetFilters" });
  }

  function refresh() {
    if (!state) return;
    void applyWindowlessFilters(draft);
  }

  async function applyWindowlessFilters(applied: typeof defaults) {
    await logs.send({ type: "setWindow", window: windows[applied.days] ?? "Week" });
    await logs.send({ type: "setProvider", provider: applied.provider });
    await logs.send({
      type: "setShowing",
      showing: applied.status ? { tag: "One", status: lowerStatus[applied.status] } : { tag: "AnyStatus" },
    });
    await logs.send({ type: "setModel", model: applied.model.trim() });
    await logs.send({ type: "setKeyName", keyName: applied.keyName.trim() });
  }

  return (
    <div className="telemetry-legacy logs-legacy">
      <WorkspaceHeading
        icon={List}
        title="Request logs"
        description="Find inference requests and review routing, timing, token usage, and charges."
      >
        <a href="/console/usage" className="button quiet">
          <Activity size={16} aria-hidden="true" /> View usage
        </a>
      </WorkspaceHeading>
      {!signedIn ? (
        <p className="panel empty">Connect a Solana wallet to view your request logs.</p>
      ) : (
        <>
          <section className="panel log-filters" aria-label="Request log controls">
        <form
          className="log-lookup"
          onSubmit={(event) => {
            event.preventDefault();
            const id = lookup.trim().toLowerCase();
            if (id) openDetail(id);
          }}
        >
          <label>
            Find a request by reference
            <input
              type="search"
              placeholder="Paste a request reference"
              minLength={20}
              maxLength={80}
              pattern="[a-zA-Z0-9]{20,80}"
              spellCheck={false}
              autoComplete="off"
              required
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
            />
          </label>
          <button type="submit" className="button quiet">
            <Search size={16} aria-hidden="true" /> Find request
          </button>
        </form>
        <form className="log-filters-form" onSubmit={(event) => void applyFilters(event)}>
          <div className="log-controls">
            <label>
              Date range
              <select value={draft.days} onChange={(event) => setDraft({ ...draft, days: event.target.value })}>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </label>
            <label>
              Provider
              <select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })}>
                <option value="">All providers</option>
                {providerIds.map((id) => (
                  <option key={id} value={id}>
                    {providerNames[id]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                <option value="">All statuses</option>
                {Object.keys(lowerStatus).map((id) => (
                  <option key={id} value={id}>
                    {statusLabels[lowerStatus[id]]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model ID
              <input
                value={draft.model}
                maxLength={100}
                placeholder="Any model"
                onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              />
            </label>
            <label>
              Key name
              <input
                value={draft.keyName}
                maxLength={60}
                placeholder="Any key"
                onChange={(event) => setDraft({ ...draft, keyName: event.target.value })}
              />
            </label>
          </div>
          <div className="log-actions">
            <button className="button accent" type="submit">
              Apply filters
            </button>
            <button className="button quiet" type="button" onClick={resetFilters}>
              Reset
            </button>
            <button className="button quiet" type="button" onClick={refresh}>
              <RefreshCw size={15} aria-hidden="true" /> Refresh
            </button>
          </div>
        </form>
      </section>
          <LogResults key={state ? windowDays[state.window] + state.provider + state.model + state.keyName + state.showing.tag : "loading"} rows={rows} error={logs.error} open={openDetail} />
          {requestId && <RequestDetail key={requestId} id={requestId} row={detailRow} close={closeDetail} />}
        </>
      )}
    </div>
  );
}
