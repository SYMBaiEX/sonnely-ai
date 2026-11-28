// spec/app/usage.md, "Story: Roll usage up"
import { ArrowUpRight, BarChart3, Download } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, SegmentedControl, SegmentedControlItem, Select } from "@repo/ui";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Row, Status, Usage } from "../../../../gen/app__usage.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import { balanceOf, type Ledger } from "../../../../gen/app__billing__ledger.ts";
import { useRemote } from "../../remote.ts";
import { ConsoleFrame, useWorkspaceSession } from "../console/frame.tsx";
import {
  CopyButton,
  Failure,
  FilterPanel,
  WorkspaceHeading,
  creditBalance,
  creditDecimal,
  date,
  day,
  shortDate,
} from "../console/bits.tsx";
import { providerIds, providerNames } from "../console/logs-shared.tsx";
import { DataTable, FieldLabel, Stat, panelClass } from "../console/ops.tsx";

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
  return (
    <section className={`${panelClass} grid gap-4`} aria-labelledby="usagemax-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="usagemax-heading" className="text-heading leading-heading font-medium">Export to UsageMax</h2>
          <p className="mt-1 max-w-prose text-ui text-muted-foreground">Download up to 100 settled requests from the selected date range as a JSON file for import into UsageMax.</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <a href="https://usagemax.com/docs" target="_blank" rel="noreferrer">UsageMax docs <ArrowUpRight size={15} aria-hidden /></a>
        </Button>
      </div>
      {hasUsage ? (
        <div>
          <Button asChild variant="secondary">
            <a href={"/api/sonnely/usage-max?days=" + days}><Download size={16} aria-hidden /> Download UsageMax JSON</a>
          </Button>
        </div>
      ) : (
        <p className="text-ui text-muted-foreground">Completed inference requests will appear here when they settle.</p>
      )}
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
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
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
  const balance = signedIn && ledger.state && wallet ? balanceOf(ledger.state, wallet) : undefined;
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
  const series = Array.from({ length: range }, (_, index) => {
    const time = now - (range - index - 1) * 86_400_000;
    const value = usageMetricValue(summarize(daily.get(day(time)) ?? []), metric);
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
    <div className="grid gap-4">
      <WorkspaceHeading icon={BarChart3} title="Usage" description="Charges, tokens, and request performance in UTC.">
        <Button type="button" variant="ghost" size="sm" disabled={!rows.length} onClick={exportCsv}>
          <Download size={15} aria-hidden="true" /> Export CSV
        </Button>
        <FieldLabel className="w-36">
          Date range
          <Select value={range} onChange={(event) => setRange(Number(event.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </Select>
        </FieldLabel>
      </WorkspaceHeading>
      {error && <Failure message={error} />}
      {signedIn && (
        <section aria-label="Usage filters">
          <FilterPanel label="Filter usage" active={Object.values(filters).filter(Boolean).length}>
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FieldLabel>Provider<Select ref={providerFilterRef} value={filters.provider} onChange={(event) => updateFilter("provider", event.target.value)}><option value="">All providers</option>{providerIds.map((id) => <option key={id} value={id}>{providerNames[id]}</option>)}</Select></FieldLabel>
              <FieldLabel>Model<Select value={filters.model} onChange={(event) => updateFilter("model", event.target.value)}><option value="">All models</option>{filters.model && !modelIds.includes(filters.model) && <option value={filters.model}>{usageModelName(filters.model)}</option>}{modelIds.map((id) => <option key={id} value={id}>{usageModelName(id)}</option>)}</Select></FieldLabel>
              <FieldLabel>API key<Select value={filters.key} onChange={(event) => updateFilter("key", event.target.value)}><option value="">All keys</option>{filters.key && !keyLabels.has(filters.key) && <option value={filters.key}>Selected key</option>}{keyOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></FieldLabel>
              <FieldLabel>Status<Select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All statuses</option>{Object.entries(statusValues).map(([value, status]) => <option key={value} value={value}>{usageStates[status]}</option>)}</Select></FieldLabel>
            </div>
            {state && (
              <div className="flex w-full flex-wrap items-center justify-between gap-2 text-ui text-muted-foreground">
                <p role="status">{usageCount.format(rows.length)} of {usageCount.format(source.length)} requests shown.</p>
                {filtered && <Button type="button" variant="ghost" size="sm" onClick={() => { setFilters(noUsageFilters); providerFilterRef.current?.focus(); }}>Clear filters</Button>}
              </div>
            )}
          </FilterPanel>
        </section>
      )}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Usage summary">
        {stats.map(([label, value, description]) => <Stat key={label} label={label} value={value} detail={description} />)}
      </section>
      <section className={`${panelClass} grid gap-4`} aria-labelledby="usage-chart-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="usage-chart-heading" className="text-heading leading-heading font-medium">{metric} by day</h2>
          <div className="flex flex-wrap items-end gap-3">
            <FieldLabel>Chart metric<Select value={metric} onChange={(event) => setMetric(event.target.value as UsageMetric)}>{usageChartMetrics.map((value) => <option key={value}>{value}</option>)}</Select></FieldLabel>
            <SegmentedControl aria-label="Chart view" value={view} onValueChange={(value) => setView(value as typeof view)}><SegmentedControlItem value="Chart">Chart</SegmentedControlItem><SegmentedControlItem value="Table">Table</SegmentedControlItem></SegmentedControl>
          </div>
        </div>
        {!rows.length || !hasMetric ? (
          <div className="grid place-items-center gap-2 py-12 text-center text-muted-foreground"><BarChart3 size={23} aria-hidden="true" /><p role="status">{!rows.length ? activityStatus : "No cached input measurements in this view."}</p></div>
        ) : view === "Chart" ? (
          <div className="grid gap-2">
            <div className="flex h-36 items-end gap-px" role="img" aria-label={metric + " by day over the last " + range + " days"}>
              {series.map(({ time, value }) => <span key={time} title={shortDate(time) + " · " + metricValue(value)} className={value ? "min-h-px flex-1 rounded-t-sm bg-primary" : "h-px flex-1 bg-border"} style={{ height: value ? Math.max(1, (value / high) * 100) + "%" : "1px" }} />)}
            </div>
            <div className="flex justify-between text-meta text-muted-foreground"><span>{shortDate(series[0].time)}</span><span>{shortDate(series[range - 1].time)}</span></div>
          </div>
        ) : (
          <DataTable rows={series} rowKey={(point) => String(point.time)} ariaLabel={metric + " by day"} columns={[{ label: "Date (UTC)", header: true, value: (point) => date(point.time) }, { label: metric, value: (point) => metricValue(point.value) }]} />
        )}
      </section>
      <section className={`${panelClass} grid gap-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="request-breakdown" className="text-heading leading-heading font-medium">Request breakdown</h2>
          <div className="flex flex-wrap items-end gap-3">
            <SegmentedControl aria-label="Group usage" value={group} onValueChange={(value) => setGroup(value as typeof group)}>{usageGroups.map((value) => <SegmentedControlItem key={value} value={value}>{"By " + value.toLowerCase()}</SegmentedControlItem>)}</SegmentedControl>
            <FieldLabel>Sort groups<Select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>{Object.entries(breakdownOrders).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FieldLabel>
          </div>
        </div>
        {breakdown.length ? (
          <DataTable
            rows={breakdown}
            rowKey={(entry) => entry.id}
            labelledBy="request-breakdown"
            columns={[
              { label: group, header: true, value: (entry) => entry.label },
              { label: "Requests", value: (entry) => usageCount.format(entry.requests) },
              { label: "Failed", value: (entry) => usageCount.format(entry.failed) },
              { label: "Input", value: (entry) => usageCount.format(entry.input) },
              { label: "Cached input", value: (entry) => entry.cacheSamples ? usageCount.format(entry.cached) : "—" },
              { label: "Output", value: (entry) => usageCount.format(entry.output) },
              { label: "Spend", value: (entry) => creditBalance(entry.spend) },
              { label: "Held", value: (entry) => creditBalance(entry.held) },
            ]}
          />
        ) : <p className="text-ui text-muted-foreground">{activityStatus}</p>}
      </section>
      {rows.length > 0 && (
        <section className={`${panelClass} grid gap-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="recent-request-references" className="text-heading leading-heading font-medium">Recent requests</h2>
            <a className="inline-flex items-center gap-1 text-ui text-primary hover:underline" href="/console/logs">Open request logs <ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
          <DataTable
            rows={rows.slice(0, 25)}
            rowKey={(row) => row.id}
            labelledBy="recent-request-references"
            columns={[
              {
                label: "Request", header: true, value: (row) => (
                  <span className="grid gap-1 whitespace-normal">
                    {usageModelName(row.model)}
                    <span className="text-meta font-regular text-muted-foreground">{date(row.time)} · {providerNames[providerIdsByMachine[row.provider]]}</span>
                    <span className="flex flex-wrap items-center gap-2"><CopyButton value={row.id} label="Copy request reference" /><a className="inline-flex items-center gap-1 text-ui text-primary hover:underline" href={"/console/logs?request=" + encodeURIComponent(row.id)}>View request details</a></span>
                  </span>
                ),
              },
              { label: "Tokens", value: (row) => (row.input + row.output).toLocaleString() },
              { label: "Billing", value: (row) => row.status === "Complete" ? `Charged ${creditBalance(row.cost)}` : row.status === "Failed" ? "Released" : `${row.status === "Unreported" ? "Under review" : "Reserved"} · ${creditBalance(row.cost)}` },
            ]}
          />
          <a className="inline-flex w-max items-center gap-1 text-ui text-primary hover:underline" href="/contact">Get help with a charge <ArrowUpRight size={15} /></a>
        </section>
      )}
      {signedIn && displayState && <UsageMax days={range} hasUsage={source.some((row) => row.status === "Complete")} />}
    </div>
  );
}

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Usage") return null;
  return <ConsoleFrame section="Usage"><UsageConsole /></ConsoleFrame>;
}
