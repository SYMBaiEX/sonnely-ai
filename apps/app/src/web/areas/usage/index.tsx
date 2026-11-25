// spec/app/usage.md, "Story: Roll usage up": stats, breakdowns and the request log the meter produces.
import { ArrowUpRight, BarChart3, Download } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Row, Status, Usage } from "../../../../gen/app__usage.ts";
import { Button, Card, CardTitle, EmptyState } from "@repo/ui";
import { useRemote } from "../../remote.ts";

const usd = (micros: number) => "$" + (micros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const date = (time: number) =>
  new Date(time).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const day = (time: number) => new Date(time).toISOString().slice(0, 10);

const usageStates: Record<Status, string> = {
  Complete: "Charged",
  Failed: "Released",
  Pending: "Reserved",
  Unreported: "Under review",
};
const providerNames: Record<Row["provider"], string> = { NearAI: "NEAR AI", Phala: "Phala", Tinfoil: "Tinfoil" };

/** summarizeUsage from lib/usage-analytics.ts, over the machine's rows (spec/app/usage.md, "Totals are the sum of their rows"). */
function totals(rows: readonly Row[]) {
  const sums = { requests: rows.length, complete: 0, failed: 0, input: 0, output: 0, spend: 0, held: 0, cached: 0, cacheSamples: 0 };
  for (const row of rows) {
    sums.input += row.input;
    sums.output += row.output;
    if (row.status === "Complete") {
      sums.complete++;
      sums.spend += row.cost;
    }
    if (row.status === "Failed") sums.failed++;
    if (row.status === "Pending" || row.status === "Unreported") sums.held += row.cost;
    if (row.cached >= 0) {
      sums.cached += row.cached;
      sums.cacheSamples++;
    }
  }
  return sums;
}

function providerP95(rows: readonly Row[]) {
  const durations = rows.flatMap(({ providerMs }) => (providerMs < 0 ? [] : [providerMs])).sort((a, b) => a - b);
  return { samples: durations.length, value: durations[Math.ceil(durations.length * 0.95) - 1] };
}

const groups = ["Model", "Provider", "Key"] as const;
type Group = (typeof groups)[number];
const orders = { spend: "Highest spend", requests: "Most requests", failed: "Most errors", held: "Most held credit", name: "Name" } as const;

const noFilters = { provider: "", model: "", key: "", status: "" };

function usageKey(row: Row) {
  return row.keyId ? "key:" + row.keyId : "label:" + row.keyName;
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe =
    typeof value === "string" && /^(?:[\s-]*[=+@＝＋－＠]|[\t\r\n])/.test(text) ? "'" + text : text;
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
          row.provider,
          row.model,
          row.keyName,
          row.keyId,
          row.status,
          row.input,
          row.cached >= 0 ? row.cached : "",
          row.output,
          row.status === "Complete" ? (row.cost / 1_000_000).toString() : "0",
          row.status === "Pending" || row.status === "Unreported" ? (row.cost / 1_000_000).toString() : "0",
          row.providerMs >= 0 ? row.providerMs : "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Usage") return null;
  return <UsageArea />;
}

function UsageArea() {
  const { state, error } = useRemote<Usage>("usage");
  const [group, setGroup] = useState<Group>("Model");
  const [order, setOrder] = useState<keyof typeof orders>("spend");
  const [filters, setFilters] = useState(noFilters);

  const source = useMemo(() => state?.rows ?? [], [state]);
  const filtered = Object.values(filters).some(Boolean);
  const rows = useMemo(
    () =>
      filtered
        ? source.filter(
            (row) =>
              (!filters.provider || row.provider === filters.provider) &&
              (!filters.model || row.model === filters.model) &&
              (!filters.key || usageKey(row) === filters.key) &&
              (!filters.status || row.status === filters.status),
          )
        : source,
    [source, filtered, filters],
  );

  const summary = totals(rows);
  const resolved = summary.complete + summary.failed;
  const duration = providerP95(rows);
  const stats: [string, string, string | undefined][] = [
    ["Spend", state ? usd(summary.spend) : "—", "Settled charges"],
    [
      "Requests",
      state ? count.format(summary.requests) : "—",
      state ? `${count.format(summary.failed)} failed` : undefined,
    ],
    ["Tokens", state ? count.format(summary.input + summary.output) : "—", "Input and output combined"],
    [
      "Success rate",
      resolved ? percent.format(summary.complete / resolved) : "—",
      `${count.format(resolved)} resolved requests`,
    ],
    ["Held credits", state ? usd(summary.held) : "—", "Reserved or under review"],
    [
      "Cached input",
      summary.cacheSamples ? count.format(summary.cached) : "—",
      summary.cacheSamples ? `${count.format(summary.cacheSamples)} requests reporting cache` : "No cache measurements",
    ],
    [
      "Provider duration p95",
      duration.value === undefined
        ? "—"
        : duration.value < 1000
          ? `${duration.value} ms`
          : `${(duration.value / 1000).toFixed(2)} s`,
      duration.samples ? `${count.format(duration.samples)} measured requests` : "No duration measurements",
    ],
  ];

  const keyNames = new Map<string, string>();
  for (const row of source) if (!keyNames.has(usageKey(row))) keyNames.set(usageKey(row), row.keyName);
  const keyOptions = Array.from(keyNames).sort((a, b) => a[1].localeCompare(b[1]));
  const keyLabels = new Map(keyOptions);
  const modelIds = [...new Set(source.map((row) => row.model))].sort();

  const grouped = Map.groupBy(rows, (row) =>
    group === "Model" ? row.model : group === "Provider" ? row.provider : usageKey(row),
  );
  const breakdown = Array.from(grouped, ([id, entries]) => ({
    id,
    label: group === "Provider" ? providerNames[id as Row["provider"]] : (keyLabels.get(id) ?? id),
    ...totals(entries),
  })).sort(
    (a, b) => (order === "name" ? 0 : (b[order as "spend"] ?? 0) - (a[order as "spend"] ?? 0)) || a.label.localeCompare(b.label),
  );

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([usageCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sonnely-usage-" + day(Date.now()) + ".csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const updateFilter = (field: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [field]: value }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 size={21} className="text-muted-foreground" aria-hidden />
          <div>
            <h1 className="font-serif text-3xl">Usage</h1>
            <p className="text-sm text-muted-foreground">Track charges, tokens, and request performance. Dates use UTC.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" disabled={!rows.length} onClick={exportCsv}>
          <Download size={15} aria-hidden /> Export CSV
        </Button>
      </header>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section aria-label="Usage filters" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          Provider
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={filters.provider}
            onChange={(event) => updateFilter("provider", event.target.value)}
          >
            <option value="">All providers</option>
            {Object.entries(providerNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Model
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={filters.model}
            onChange={(event) => updateFilter("model", event.target.value)}
          >
            <option value="">All models</option>
            {modelIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          API key
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={filters.key}
            onChange={(event) => updateFilter("key", event.target.value)}
          >
            <option value="">All keys</option>
            {keyOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(usageStates).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {state && (
        <p className="text-xs text-muted-foreground" role="status">
          {count.format(rows.length)} of {count.format(source.length)} requests shown.
          {filtered && (
            <Button variant="ghost" size="sm" className="ml-2" onClick={() => setFilters(noFilters)}>
              Clear filters
            </Button>
          )}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Usage summary">
        {stats.map(([label, value, description]) => (
          <Card key={label} className="gap-1 p-4">
            <span className="text-xs text-muted-foreground">{label}</span>
            <strong className="text-xl">{value}</strong>
            {description && <small className="text-xs text-muted-foreground">{description}</small>}
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Breakdown</CardTitle>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              Group
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={group}
                onChange={(event) => setGroup(event.target.value as Group)}
              >
                {groups.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              Order
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={order}
                onChange={(event) => setOrder(event.target.value as keyof typeof orders)}
              >
                {Object.entries(orders).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {breakdown.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {[group, "Spend", "Requests", "Errors", "Held"].map((label) => (
                  <th scope="col" className="py-2 font-medium" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => (
                <tr className="border-b border-border last:border-0" key={row.id}>
                  <th scope="row" className="py-2 text-left font-medium">
                    {row.label}
                  </th>
                  <td className="py-2">{usd(row.spend)}</td>
                  <td className="py-2">{count.format(row.requests)}</td>
                  <td className="py-2">{count.format(row.failed)}</td>
                  <td className="py-2">{usd(row.held)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing to break down yet.</p>
        )}
      </Card>

      <Card className="p-0">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Request activity">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {["Request", "Tokens", "Billing"].map((label) => (
                    <th scope="col" className="px-4 py-3 font-medium" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row) => (
                  <tr className="border-b border-border last:border-0" key={row.id}>
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {row.model}
                      <div className="text-xs font-normal text-muted-foreground">
                        {date(row.time)} · {providerNames[row.provider]} · {row.keyName}
                      </div>
                    </th>
                    <td className="px-4 py-3">{(row.input + row.output).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {row.status === "Complete"
                        ? `Charged ${usd(row.cost)}`
                        : row.status === "Failed"
                          ? "Released"
                          : `${usageStates[row.status]} · ${usd(row.cost)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              state === undefined ? "Loading activity…" : filtered ? "No requests match these filters." : "No activity in this period."
            }
            icon={<BarChart3 size={23} />}
          >
            <a className="inline-flex items-center gap-1 text-sm underline" href="/contact">
              Get help with a charge <ArrowUpRight size={15} />
            </a>
          </EmptyState>
        )}
      </Card>
    </main>
  );
}
