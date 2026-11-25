/* eslint-disable better-tailwindcss/no-unknown-classes, no-restricted-syntax -- this area intentionally uses the migrated usage class names and keeps the analytics workflow together */
// spec/app/usage.md, "Story: Roll usage up"
import { ArrowUpRight, BarChart3, Download } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Row, Status, Usage } from "../../../../gen/app__usage.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import type { Ledger } from "../../../../gen/app__billing__ledger.ts";
import { useRemote } from "../../remote.ts";
import { ConsoleFrame, useWorkspaceSession } from "../console/frame.tsx";
import {
  CopyButton,
  Failure,
  WorkspaceHeading,
  creditBalance,
  creditDecimal,
  date,
  day,
  providerIds,
  providerNames,
  shortDate,
} from "../console/logs-shared.tsx";
import "../console/logs.css";
import "./usage.css";

const usageCount = new Intl.NumberFormat("en-US");
const usagePercent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const usageModelNames = new Map<string, string>(
  catalog.flatMap((model) => model.routes.map((route) => [route.modelId, model.name])),
);
const usageModelName = (id: string) => usageModelNames.get(id) ?? id;
const usageChartMetrics = ["Spend", "Requests", "Tokens", "Errors", "Cached input"] as const;
const usageGroups = ["Model", "Provider", "Key"] as const;
type UsageGroup = (typeof usageGroups)[number];
type UsageMetric = (typeof usageChartMetrics)[number];
const breakdownOrders = { spend: "Highest spend", requests: "Most requests", failed: "Most errors", held: "Most held credit", name: "Name" } as const;
const noUsageFilters = { provider: "", model: "", key: "", status: "" };
const usageStates: Record<Status, string> = { Complete: "Completed", Failed: "Failed", Pending: "Reserved", Unreported: "Under review" };
const providerIdsByMachine: Record<Row["provider"], string> = { NearAI: "near-ai", Phala: "phala", Tinfoil: "tinfoil" };
const statusValues: Record<string, Status> = { complete: "Complete", failed: "Failed", pending: "Pending", unreported: "Unreported" };
const statusNames: Record<Status, string> = { Complete: "complete", Failed: "failed", Pending: "pending", Unreported: "unreported" };

function usageKey(row: Row) {
  return row.keyId ? "key:" + row.keyId : "label:" + row.keyName;
}

function summarize(rows: readonly Row[]) {
  const totals = { requests: rows.length, complete: 0, failed: 0, input: 0, output: 0, spend: 0, held: 0, cached: 0, cacheSamples: 0 };
  for (const row of rows) {
    totals.input += row.input;
    totals.output += row.output;
    if (row.status === "Complete") {
      totals.complete++;
      totals.spend += row.cost;
    }
    if (row.status === "Failed") totals.failed++;
    if (row.status === "Pending" || row.status === "Unreported") totals.held += row.cost;
    if (row.cached >= 0) {
      totals.cached += row.cached;
      totals.cacheSamples++;
    }
  }
  return totals;
}
type UsageTotals = ReturnType<typeof summarize>;

function providerP95(rows: readonly Row[]) {
  const durations = rows.flatMap(({ providerMs }) => (providerMs < 0 ? [] : [providerMs])).sort((a, b) => a - b);
  return { samples: durations.length, value: durations[Math.ceil(durations.length * 0.95) - 1] };
}

function usageMetricValue(totals: UsageTotals, metric: UsageMetric) {
  switch (metric) {
    case "Spend": return totals.spend;
    case "Requests": return totals.requests;
    case "Tokens": return totals.input + totals.output;
    case "Errors": return totals.failed;
    case "Cached input": return totals.cacheSamples ? totals.cached : undefined;
  }
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}

function usageCsv(rows: readonly Row[]) {
  return (
    [
      "time_utc,request_id,provider,model,key_name,key_id,status,input_tokens,cached_input_tokens,output_tokens,charged_usd,held_usd,provider_duration_ms",
      ...rows.map((row) =>
        [
          new Date(row.time).toISOString(),
          row.id,
          providerIdsByMachine[row.provider],
          row.model,
          row.keyName,
          row.keyId,
          statusNames[row.status],
          row.input,
          row.cached >= 0 ? row.cached : "",
          row.output,
          row.status === "Complete" ? creditDecimal(row.cost) : "0",
          row.status === "Pending" || row.status === "Unreported" ? creditDecimal(row.cost) : "0",
          row.providerMs >= 0 ? row.providerMs : "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}

function UsageMax({ days, hasUsage }: { days: number; hasUsage: boolean }) {
  const [device, setDevice] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const deviceStorage = "sonnely.usagemax-device";

  function installId() {
    if (device) return;
    try {
      setDevice(localStorage.getItem(deviceStorage) ?? crypto.randomUUID());
    } catch {
      setDevice(crypto.randomUUID());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const collector = new FormData(form).get("collector");
    const token = typeof collector === "string" ? collector : "";
    setPending(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/sonnely/usage-max", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, device, days }),
      });
      if (!response.ok) throw new Error("Unable to export usage.");
      const result = (await response.json()) as { sent?: number };
      try {
        localStorage.setItem(deviceStorage, device);
      } catch {
        setDevice(device);
      }
      setNotice(result.sent ? `UsageMax accepted the export of ${result.sent} settled requests.` : "There is no settled inference usage in this period.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to export usage.");
    } finally {
      form.reset();
      setPending(false);
    }
  }

  return (
    <section className="panel stack-panel usage-max" aria-labelledby="usagemax-heading">
      <div className="between controls">
        <div>
          <h2 id="usagemax-heading">Export to UsageMax</h2>
          <p className="caption">Take up to 100 settled requests from the selected date range into your UsageMax workspace.</p>
        </div>
        <a href="https://usagemax.com/docs" target="_blank" rel="noreferrer" className="button quiet">
          UsageMax docs <ArrowUpRight size={15} aria-hidden />
        </a>
      </div>
      {hasUsage ? (
        <>
          <div className="actions">
            <a className="button secondary" href={"/api/sonnely/usage-max?days=" + days}>
              <Download size={16} aria-hidden /> Download telemetry JSON
            </a>
          </div>
          <details onToggle={(event) => event.currentTarget.open && installId()}>
            <summary>Send to my UsageMax workspace</summary>
            <form onSubmit={(event) => void submit(event)}>
              <p className="caption">
                Create an advanced collector key in UsageMax. Each send includes model and route names, token counts, timestamps, and settled Sonnely charges. Sonnely uses the collector key for this send and never saves it.
              </p>
              <div className="usage-max-fields">
                <label className="control-label">
                  UsageMax collector key
                  <input type="password" name="collector" autoComplete="off" required minLength={16} maxLength={256} />
                </label>
                <label className="control-label">
                  Installation ID
                  <input name="device" value={device} onChange={(event) => setDevice(event.target.value)} required spellCheck={false} autoComplete="off" maxLength={36} />
                </label>
              </div>
              <button type="submit" className="button primary" disabled={pending}>
                {pending ? "Sending…" : "Send usage to UsageMax"}
              </button>
            </form>
          </details>
        </>
      ) : (
        <p className="caption">Completed inference requests will appear here when they settle.</p>
      )}
      {notice && <p role="status" className="status">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}

function UsageConsole() {
  const session = useWorkspaceSession();
  const { state, error } = useRemote<Usage>("usage");
  const ledger = useRemote<Ledger>("billing-ledger");
  const [range, setRange] = useState(30);
  const [metric, setMetric] = useState<UsageMetric>("Spend");
  const [group, setGroup] = useState<UsageGroup>("Model");
  const [view, setView] = useState<"Chart" | "Table">("Chart");
  const [order, setOrder] = useState<keyof typeof breakdownOrders>("spend");
  const [filters, setFilters] = useState(noUsageFilters);
  const providerFilterRef = useRef<HTMLSelectElement>(null);
  const signedIn = session.state?.tag === "SignedIn";
  const allRows = useMemo(() => state?.rows ?? [], [state]);
  const [now] = useState(() => Date.now());
  const ranged = useMemo(() => {
    const start = now - range * 86_400_000;
    return allRows.filter((row) => row.time >= start);
  }, [allRows, now, range]);
  const source = signedIn ? ranged : [];
  const filtered = Object.values(filters).some(Boolean);
  const rows = filtered
    ? source.filter((row) =>
        (!filters.provider || providerIdsByMachine[row.provider] === filters.provider) &&
        (!filters.model || row.model === filters.model) &&
        (!filters.key || usageKey(row) === filters.key) &&
        (!filters.status || row.status === statusValues[filters.status]),
      )
    : source;
  const loading = signedIn && !state && !error;
  const capped = source.length >= 1000;
  const activityStatus = !signedIn ? "Connect a wallet to see request activity." : loading ? "Loading activity…" : state ? (filtered ? "No requests match these filters." : "No activity in this period.") : "Activity is unavailable.";

  const modelIds = [...new Set(source.map((row) => row.model))].sort((a, b) => usageModelName(a).localeCompare(usageModelName(b)) || a.localeCompare(b));
  const keyNames = new Map<string, string>();
  for (const row of source) if (!keyNames.has(usageKey(row))) keyNames.set(usageKey(row), row.keyName);
  const keyNameCounts = new Map<string, number>();
  for (const label of keyNames.values()) keyNameCounts.set(label, (keyNameCounts.get(label) ?? 0) + 1);
  const keyOptions = Array.from(keyNames, ([key, name]) => {
    const label = (keyNameCounts.get(name) ?? 0) > 1 && key.startsWith("key:") ? `${name} · ${key.slice(-6)}` : name;
    return [key, label] as const;
  }).sort((left, right) => left[1].localeCompare(right[1]));
  const keyLabels = new Map(keyOptions);
  const updateFilter = (field: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [field]: value }));

  const displayState = signedIn ? state : undefined;
  const totals = summarize(rows);
  const resolved = totals.complete + totals.failed;
  const providerDuration = providerP95(rows);
  const balance = signedIn ? ledger.state?.entries.reduce((sum, entry) => sum + (entry.kind === "Charge" ? -entry.amount : entry.amount), 0) : undefined;
  const stats: [string, string, string | undefined][] = [
    ["Credit balance", balance === undefined ? "—" : creditBalance(balance), "Available workspace credits"],
    ["Spend", displayState ? creditBalance(totals.spend) : "—", "Settled charges"],
    ["Requests", displayState ? usageCount.format(totals.requests) : "—", displayState ? `${usageCount.format(totals.failed)} failed` : undefined],
    ["Tokens", displayState ? usageCount.format(totals.input + totals.output) : "—", "Input and output combined"],
    ["Success rate", resolved ? usagePercent.format(totals.complete / resolved) : "—", `${usageCount.format(resolved)} resolved requests`],
    ["Held credits", displayState ? creditBalance(totals.held) : "—", "Reserved or under review"],
    ["Cached input", totals.cacheSamples ? usageCount.format(totals.cached) : "—", totals.cacheSamples ? `${usageCount.format(totals.cacheSamples)} requests reporting cache` : "No cache measurements"],
    ["Provider duration p95", providerDuration.value === undefined ? "—" : providerDuration.value < 1000 ? `${providerDuration.value} ms` : `${(providerDuration.value / 1000).toFixed(2)} s`, providerDuration.samples ? `${usageCount.format(providerDuration.samples)} measured requests` : "No duration measurements"],
  ];
  const grouped = Map.groupBy(rows, (row) => (group === "Model" ? row.model : group === "Provider" ? providerIdsByMachine[row.provider] : usageKey(row)));
  const breakdown = Array.from(grouped, ([id, entries]) => ({
    id,
    label: group === "Model" ? usageModelName(id) : group === "Provider" ? (providerNames[id] ?? id) : (keyLabels.get(id) ?? entries[0].keyName),
    ...summarize(entries),
  })).sort((a, b) => (order === "name" ? 0 : b[order] - a[order]) || a.label.localeCompare(b.label));

  const daily = Map.groupBy(rows, (row) => day(row.time));
  const firstSampleAt = capped && source.length ? source[source.length - 1].time : undefined;
  const firstSampleDay = firstSampleAt === undefined ? undefined : day(firstSampleAt);
  const series = Array.from({ length: range }, (_, index) => {
    const time = now - (range - index - 1) * 86_400_000;
    const dateKey = day(time);
    const value = firstSampleDay && dateKey < firstSampleDay ? undefined : usageMetricValue(summarize(daily.get(dateKey) ?? []), metric);
    return { time, value };
  });
  const high = Math.max(1, ...series.map((point) => point.value ?? 0));
  const hasMetric = series.some((point) => point.value !== undefined);
  const metricValue = (value: number | undefined) => (value === undefined ? "—" : metric === "Spend" ? creditBalance(value) : usageCount.format(value));

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([usageCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sonnely-usage-" + day(Date.now()) + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="telemetry-legacy usage-legacy">
      <WorkspaceHeading icon={BarChart3} title="Usage" description="Track charges, tokens, and request performance. Dates use UTC.">
        <button type="button" className="button quiet" disabled={!rows.length} onClick={exportCsv}>
          <Download size={15} aria-hidden="true" /> Export CSV
        </button>
        <label className="control-label">
          Date range
          <select value={range} onChange={(event) => setRange(Number(event.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </WorkspaceHeading>
      {error && <div className="actions"><Failure message={error} /></div>}
      {signedIn && (
        <section className="panel usage-filters" aria-label="Usage filters">
          <div className="usage-filter-grid">
            <label className="control-label">Provider<select ref={providerFilterRef} value={filters.provider} onChange={(event) => updateFilter("provider", event.target.value)}><option value="">All providers</option>{providerIds.map((id) => <option key={id} value={id}>{providerNames[id]}</option>)}</select></label>
            <label className="control-label">Model<select value={filters.model} onChange={(event) => updateFilter("model", event.target.value)}><option value="">All models</option>{filters.model && !modelIds.includes(filters.model) && <option value={filters.model}>{usageModelName(filters.model)}</option>}{modelIds.map((id) => <option key={id} value={id}>{usageModelName(id)}</option>)}</select></label>
            <label className="control-label">API key<select value={filters.key} onChange={(event) => updateFilter("key", event.target.value)}><option value="">All keys</option>{filters.key && !keyLabels.has(filters.key) && <option value={filters.key}>Selected key</option>}{keyOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="control-label">Status<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All statuses</option>{Object.entries(statusValues).map(([value, status]) => <option key={value} value={value}>{usageStates[status]}</option>)}</select></label>
          </div>
          {state && (
            <div className="usage-sample">
              <p className="caption" role="status">{usageCount.format(rows.length)} of {usageCount.format(source.length)} requests shown.{capped && " Analytics and CSV cover the 1,000 most recent requests in this date range."}</p>
              {filtered && <button type="button" className="button quiet small" onClick={() => { setFilters(noUsageFilters); providerFilterRef.current?.focus(); }}>Clear filters</button>}
            </div>
          )}
        </section>
      )}
      <div className="stat-grid usage-stats" role="group" aria-label="Usage summary">
        {stats.map(([label, value, description]) => <div className="panel stat" key={label}><span>{label}</span><strong>{value}</strong>{description && <small>{description}</small>}</div>)}
      </div>
      <section className="panel chart-panel" aria-labelledby="usage-chart-heading">
        <div className="between controls"><h2 id="usage-chart-heading">{metric} by day</h2><div className="actions"><label className="control-label">Chart metric<select value={metric} onChange={(event) => setMetric(event.target.value as UsageMetric)}>{usageChartMetrics.map((value) => <option key={value}>{value}</option>)}</select></label><div className="segmented" aria-label="Chart view">{(["Chart", "Table"] as const).map((value) => <button type="button" key={value} aria-pressed={value === view} onClick={() => setView(value)}>{value}</button>)}</div></div></div>
        {firstSampleAt !== undefined && <p className="caption">Days before {date(firstSampleAt)} fall outside this sample.</p>}
        {!rows.length || !hasMetric ? <div className="chart-empty"><BarChart3 size={23} aria-hidden="true" /><p role="status">{!rows.length ? activityStatus : "No cached input measurements in this view."}</p></div> : view === "Chart" ? <><div className="bars" role="img" aria-label={metric + " by day over the last " + range + " days"}>{series.map(({ time, value }) => <span key={time} title={shortDate(time) + " · " + metricValue(value)} data-empty={!value || undefined} style={{ height: value ? Math.max(1, (value / high) * 100) + "%" : "1px" }} />)}</div><div className="between caption"><span>{shortDate(series[0].time)}</span><span>{shortDate(series[range - 1].time)}</span></div></> : <div className="table-wrap compact-table"><table><thead><tr><th scope="col">Date (UTC)</th><th scope="col">{metric}</th></tr></thead><tbody>{series.map(({ time, value }) => <tr key={time}><th scope="row">{date(time)}</th><td>{metricValue(value)}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel breakdown">
        <div className="between controls"><h2 id="request-breakdown">Request breakdown</h2><div className="actions"><div className="segmented" aria-label="Group usage">{usageGroups.map((value) => <button type="button" key={value} aria-pressed={value === group} onClick={() => setGroup(value)}>By {value.toLowerCase()}</button>)}</div><label className="control-label">Sort groups<select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>{Object.entries(breakdownOrders).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></div>
        {breakdown.length ? <div className="table-wrap workspace-data-table" role="region" aria-labelledby="request-breakdown" tabIndex={0}><table><thead><tr>{[group, "Requests", "Failed", "Input", "Cached input", "Output", "Spend", "Held"].map((value) => <th scope="col" key={value}>{value}</th>)}</tr></thead><tbody>{breakdown.map((entry) => <tr key={entry.id}><th scope="row">{entry.label}</th><td>{usageCount.format(entry.requests)}</td><td>{usageCount.format(entry.failed)}</td><td>{usageCount.format(entry.input)}</td><td>{entry.cacheSamples ? usageCount.format(entry.cached) : "—"}</td><td>{usageCount.format(entry.output)}</td><td>{creditBalance(entry.spend)}</td><td>{creditBalance(entry.held)}</td></tr>)}</tbody></table></div> : <p className="caption">{activityStatus}</p>}
      </section>
      {rows.length > 0 && (
        <section className="panel breakdown">
          <div className="between controls"><h2 id="recent-request-references">Recent requests</h2><a className="text-link" href="/console/logs">Open request logs <ArrowUpRight size={15} aria-hidden="true" /></a></div>
          <div className="table-wrap workspace-data-table" role="region" aria-labelledby="recent-request-references" tabIndex={0}><table><thead><tr><th>Request</th><th>Tokens</th><th>Billing</th></tr></thead><tbody>{rows.slice(0, 25).map((row) => <tr key={row.id}><th scope="row">{usageModelName(row.model)}<div className="caption">{date(row.time)} · {providerNames[providerIdsByMachine[row.provider]]} · <CopyButton value={row.id} label="Copy request reference" /></div><a className="text-link" href={"/console/logs?request=" + encodeURIComponent(row.id)}>View request details</a></th><td>{(row.input + row.output).toLocaleString()}</td><td>{row.status === "Complete" ? `Charged ${creditBalance(row.cost)}` : row.status === "Failed" ? "Released" : `${row.status === "Unreported" ? "Under review" : "Reserved"} · ${creditBalance(row.cost)}`}</td></tr>)}</tbody></table></div>
          <a className="text-link" href="/contact">Get help with a charge <ArrowUpRight size={15} /></a>
        </section>
      )}
      {signedIn && displayState && <UsageMax days={range} hasUsage={source.some((row) => row.status === "Complete")} />}
      <section className="panel workspace-compute-links" aria-label="Compute usage"><h2>Compute usage</h2><p className="caption">Blackboxes · Coming soon</p><p className="caption">Dry Docks · Coming soon</p></section>
    </div>
  );
}

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Usage") return null;
  return <ConsoleFrame section="Usage"><UsageConsole /></ConsoleFrame>;
}
