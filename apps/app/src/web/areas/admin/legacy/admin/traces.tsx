// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useMemo, useState, type ReactNode } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { creditBalance, creditDecimal } from "../lib/credit-amount.ts";
import { models, shorten } from "../lib/models.ts";
import { providerIds, providerNames } from "../lib/provider-catalog.ts";
import { CopyButton } from "../shared.tsx";
import {
  localTime,
  outcomes,
  traceStates,
  useCrm,
  type CrmPage,
  type Trace,
} from "./shared.tsx";
import { EmptyState, Pill, Skeleton, Toolbar, usePolling } from "./ui.tsx";

const tones = { pending: "warn", complete: "ok", failed: "error", unreported: "muted" } as const;
const ranges = {
  all: "All time",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
} as const;
const rangeMs = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 } as const;
type Range = keyof typeof ranges;

function csvCell(value: string) {
  return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

function exportCsv(rows: Trace[]) {
  const lines = rows.map((row) =>
    [
      new Date(row.started).toISOString(),
      row.wallet ?? row.account,
      row.model,
      row.provider,
      row.status,
      creditDecimal(row.cost),
      String(row.input),
      String(row.output),
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(["time,wallet,model,provider,status,cost,input,output\n" + lines.join("\n") + "\n"], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "traces-" + new Date().toISOString().slice(0, 10) + ".csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function TraceList({
  rows,
  open,
  compact = false,
  toolbar,
}: {
  rows: Trace[];
  open?: (id: string) => void;
  compact?: boolean;
  toolbar?: ReactNode;
}) {
  return (
    <div className="trace-list">
      {!compact && toolbar}
      {rows.length ? (
        <div className="crm-records">
          {rows.map((row) => (
            <details key={row.id} className="crm-record">
              <summary>
                <span>
                  <strong>{models.find((item) => item.id === row.model)?.name ?? row.model}</strong>
                  <span className="caption">
                    {localTime(row.started)} · {row.keyName} ·{" "}
                    {providerNames[row.provider] ?? "NEAR AI"}
                    {row.wallet ? " · " + shorten(row.wallet) : ""}
                  </span>
                  <span className="caption trace-summary-facts">
                    {creditBalance(row.cost)}
                    {row.settled !== undefined &&
                      " · " + ((row.settled - row.started) / 1000).toFixed(2) + " s"}
                    {" · "}
                    {row.input.toLocaleString()} / {row.output.toLocaleString()} tokens
                  </span>
                </span>
                <Pill tone={tones[row.status]}>{traceStates[row.status]}</Pill>
              </summary>
              <dl className="crm-facts">
                <div>
                  <dt>Request ID</dt>
                  <dd>
                    <code>{row.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Provider request</dt>
                  <dd>
                    <code>{row.providerRequest ?? "Unavailable"}</code>
                  </dd>
                </div>
                <div>
                  <dt>Provider outcome</dt>
                  <dd>
                    {(row.outcome && outcomes[row.outcome]) || "Unavailable"}
                    {row.providerStatus ? " · HTTP " + row.providerStatus : ""}
                  </dd>
                </div>
                {row.providerReportedCostNano !== undefined && (
                  <div>
                    <dt>Upstream-reported cost</dt>
                    <dd className="trace-cost">${(row.providerReportedCostNano / 1e9).toFixed(9)}</dd>
                  </div>
                )}
                <div>
                  <dt>Time to settlement</dt>
                  <dd>
                    {row.settled === undefined
                      ? "—"
                      : ((row.settled - row.started) / 1000).toFixed(2) + " s"}
                  </dd>
                </div>
                <div>
                  <dt>Tokens in / out</dt>
                  <dd>
                    {row.input.toLocaleString()} / {row.output.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>
                    {row.status === "pending" || row.status === "unreported"
                      ? "Held credit"
                      : "Customer charge"}
                  </dt>
                  <dd className="trace-cost">{creditBalance(row.cost)}</dd>
                </div>
                <div>
                  <dt>Reconciled provider cost</dt>
                  <dd className="trace-cost">
                    {row.providerCostNano === undefined
                      ? "—"
                      : "$" + (row.providerCostNano / 1e9).toFixed(9).replace(/0+$/, "").replace(/\.$/, "")}
                  </dd>
                </div>
              </dl>
              <div className="actions">
                <CopyButton value={row.id} label="Copy request ID" />
                {open && (
                  <button type="button" className="button quiet small" onClick={() => open(row.account)}>
                    Open customer
                  </button>
                )}
              </div>
            </details>
          ))}
        </div>
      ) : compact ? (
        <EmptyState title="No requests recorded" hint="Request history for this customer appears here." />
      ) : (
        <EmptyState
          title="No traces in this window"
          hint="Try a wider time range or clear the model, provider, and status filters."
        />
      )}
    </div>
  );
}

export function TracesPanel({ open }: { open?: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [auto, setAuto] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  usePolling(refresh, 30_000, auto);
  const cursor = trail.at(-1);
  const since = useMemo(
    () => (range === "all" ? undefined : Date.now() - rangeMs[range]),
    [range, revision],
  );
  const route = useMemo(() => {
    const params = new URLSearchParams({ view: "traces", filter: status, search });
    if (model) params.set("model", model);
    if (provider) params.set("provider", provider);
    if (since !== undefined) params.set("since", String(since));
    if (cursor) params.set("cursor", cursor);
    return "admin-crm?" + params;
  }, [status, search, model, provider, since, cursor]);
  const state = useCrm<CrmPage>(route, revision);
  const rows = (state?.data?.page ?? []) as Trace[];
  const reset = () => setTrail([]);
  const toolbar = (
    <Toolbar>
      <select
        aria-label="Trace status"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          reset();
        }}
      >
        <option value="all">All statuses</option>
        {Object.entries(traceStates).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="Model"
        value={model}
        onChange={(event) => {
          setModel(event.target.value);
          reset();
        }}
      >
        <option value="">All models</option>
        {models.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Provider"
        value={provider}
        onChange={(event) => {
          setProvider(event.target.value);
          reset();
        }}
      >
        <option value="">All providers</option>
        {providerIds.map((id) => (
          <option key={id} value={id}>
            {providerNames[id]}
          </option>
        ))}
      </select>
      <form
        className="crm-search"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(String(new FormData(event.currentTarget).get("search") ?? "").trim());
          reset();
        }}
      >
        <input
          name="search"
          type="search"
          maxLength={80}
          aria-label="Search request traces"
          placeholder="Request ID"
        />
        <button className="button quiet" aria-label="Search traces">
          <Search size={16} />
        </button>
      </form>
      <select
        aria-label="Time range"
        value={range}
        onChange={(event) => {
          setRange(event.target.value as Range);
          reset();
        }}
      >
        {Object.entries(ranges).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label className="crm-check">
        <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />
        Auto 30s
      </label>
      <button type="button" className="button quiet small" onClick={refresh}>
        <RefreshCw size={15} /> Refresh
      </button>
      <button
        type="button"
        className="button quiet small"
        disabled={!rows.length}
        onClick={() => exportCsv(rows)}
      >
        <Download size={15} /> CSV
      </button>
    </Toolbar>
  );
  return (
    <div className="trace-panel">
      {state?.error || !state?.data ? toolbar : null}
      {state?.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : !state?.data ? (
        <Skeleton rows={6} />
      ) : (
        <TraceList rows={rows} open={open} toolbar={toolbar} />
      )}
      {state?.data && !state.error && (trail.length > 0 || !state.data.isDone) && (
        <div className="actions">
          <button
            type="button"
            className="button quiet small"
            disabled={!trail.length}
            onClick={() => setTrail(trail.slice(0, -1))}
          >
            Previous page
          </button>
          <button
            type="button"
            className="button quiet small"
            disabled={state.data.isDone}
            onClick={() => setTrail([...trail, state.data?.continueCursor ?? ""])}
          >
            Next page
          </button>
        </div>
      )}
    </div>
  );
}
