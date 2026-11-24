"use client";

import { UsageMax } from "./usage-max";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Code2,
  Download,
  FileText,
  KeyRound,
  MonitorSmartphone,
  Plus,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { models, shorten, usd } from "@/lib/models";

import { providerIds, providerNames, type ProviderId } from "@/lib/provider-models";
import {
  filterUsage,
  noUsageFilters,
  providerP95,
  summarizeUsage,
  usageCsv,
  usageKey,
  usageStates,
} from "@/lib/usage-analytics";

import { creditBalance, creditDecimal, parseCreditAmount } from "@/lib/credit-amount";
import {
  confidentialPaymentStatus,
  type ConfidentialPayment,
  type ConfidentialPaymentsSnapshot,
} from "@/lib/confidential-payment-types";
import { solDecimal, type SolPayment } from "@/lib/sol-quote";
import { intentFunds, type FundingQuote, type IntentFund } from "@/lib/intent-funding";
import { MotionSwitch } from "./ambient-motion";
import { IntentsCheckout } from "./intents-checkout";
import { CopyButton } from "./shared";
import type { Theme } from "@/lib/appearance";
import { usernameHelp } from "@/lib/username";
import { ConfidentialCheckout, confidentialPaymentsRoute } from "./confidential-checkout";
import { payWithWallet, request, type Session, type UsageRow } from "./wallet";
import { WorkspaceHeading } from "./workspace-heading";

type Profile = Session["profile"] | undefined;
export type Preferences = { theme: Theme; localHistory: boolean; plain: boolean };

const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    time,
  );
const shortDate = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(time);
const day = (time: number) => new Date(time).toISOString().slice(0, 10);

function Empty({ title, children, icon }: { title: string; children: ReactNode; icon: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

function useRemote<T>(enabled: boolean, route: string, options?: { keepPrevious?: boolean; scope?: string }) {
  const { keepPrevious, scope } = options ?? {};
  const [state, setState] = useState<{ route: string; scope?: string; version: number; data?: T; error?: string }>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setState(undefined);
      return;
    }
    let alive = true;
    void request<T>(route)
      .then((data) => {
        if (alive) setState({ route, scope, version, data });
      })
      .catch((error) => {
        if (alive)
          setState({
            route,
            scope,
            version,
            error: error instanceof Error ? error.message : "Could not load this page.",
          });
      });
    return () => {
      alive = false;
    };
  }, [enabled, route, scope, version]);
  const current =
    enabled && state?.route === route && state.scope === scope && (keepPrevious || state.version === version)
      ? state
      : undefined;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    reload: () => setVersion((value) => value + 1),
  };
}

type Key = {
  id: string;
  created: number;
  name: string;
  prefix: string;
  cap: number | null;
  dailyCap: number | null;
  expires: number | null;
  revoked: boolean;
  lastUsed?: number;
  todaySpent: number;
};

export function Keys({ signedIn }: { signedIn: boolean }) {
  const { data, error, reload } = useRemote<Key[]>(signedIn, "keys");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<Key | null>(null);
  const [editing, setEditing] = useState<Key | null>(null);
  const revokeHeading = useRef<HTMLHeadingElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const newKeyHeading = useRef<HTMLHeadingElement>(null);
  const rowAction = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (key) newKeyHeading.current?.focus();
    else if (open || editing) formHeading.current?.focus();
  }, [key, open, editing]);

  useEffect(() => {
    if (status && !busy) createButton.current?.focus();
  }, [status, busy]);

  function cancelRowAction() {
    setEditing(null);
    setRevoke(null);
    rowAction.current?.focus();
  }

  useEffect(() => {
    if (revoke) revokeHeading.current?.focus();
  }, [revoke]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const cap = (field: string) => (fields.get(field) ? Number(fields.get(field)) : null);
    setBusy(true);
    setFailure("");
    setKey("");
    try {
      const expires = fields.get("expires");
      const result = await request<{ key: string }>("keys", {
        name: fields.get("name") || "Workspace key",
        cap: cap("cap"),
        dailyCap: cap("daily"),
        expires: expires ? Date.parse(String(expires) + "T23:59:59Z") : null,
      });
      setKey(result.key);
      setOpen(false);
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const fields = new FormData(event.currentTarget);
    const cap = (field: string) => (fields.get(field) ? Number(fields.get(field)) : null);
    setBusy(true);
    setFailure("");
    try {
      const expires = fields.get("expires");
      await request("update-key", {
        id: editing.id,
        name: fields.get("name") || editing.name,
        cap: cap("cap"),
        dailyCap: cap("daily"),
        expires: expires ? Date.parse(String(expires) + "T23:59:59Z") : null,
      });
      setEditing(null);
      setStatus("API key updated.");
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not update the key.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!revoke) return;
    setBusy(true);
    setFailure("");
    try {
      await request("revoke", { id: revoke.id });
      setRevoke(null);
      setStatus("API key revoked.");
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not revoke the key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <WorkspaceHeading
        icon={KeyRound}
        title="API keys"
        description="Issue keys, set spending limits, and revoke access."
      >
        <button
          type="button"
          className="button accent"
          ref={createButton}
          disabled={!signedIn || busy}
          aria-expanded={open}
          onClick={() => {
            if (open) {
              formHeading.current?.focus();
              return;
            }
            setEditing(null);
            setRevoke(null);
            setStatus("");
            setOpen(true);
            setKey("");
            setFailure("");
          }}
        >
          <Plus size={17} /> Create key
        </button>
      </WorkspaceHeading>
      <Failure message={failure || error} />
      <div role="status" className="visually-hidden">
        {status}
      </div>
      {signedIn && !!key && (
        <section className="panel callout" aria-label="New API key">
          <div>
            <h2 ref={newKeyHeading} tabIndex={-1}>
              Save your new key
            </h2>
            <p>Store it securely. The full key is shown once.</p>
            <code className="secret-code">{key}</code>
          </div>
          <div className="actions">
            <CopyButton value={key} label="Copy key" />
            <button
              type="button"
              className="button quiet"
              onClick={() => {
                setKey("");
                createButton.current?.focus();
              }}
            >
              Done
            </button>
          </div>
        </section>
      )}
      {signedIn && open && (
        <form className="panel stack-panel" onSubmit={create}>
          <h2 ref={formHeading} tabIndex={-1}>
            Create an API key
          </h2>
          <div className="form-row">
            <label>
              Name
              <input name="name" maxLength={60} placeholder="CI, notebook, or app" />
            </label>
            <label>
              Daily cap (USD)
              <input name="daily" type="number" min="0.01" step="0.01" placeholder="Optional" />
            </label>
            <label>
              Lifetime cap (USD)
              <input name="cap" type="number" min="0.01" step="0.01" placeholder="Optional" />
            </label>
            <label>
              Expires (UTC)
              <input name="expires" type="date" min={day(Date.now())} />
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="button accent" disabled={busy}>
              {busy ? "Creating…" : "Create key"}
            </button>
            <button
              type="button"
              className="button quiet"
              onClick={() => {
                setOpen(false);
                createButton.current?.focus();
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {signedIn && editing && (
        <form className="panel stack-panel" onSubmit={update} key={editing.id}>
          <h2 ref={formHeading} tabIndex={-1}>
            Edit {editing.name}
          </h2>
          <div className="form-row">
            <label>
              Name
              <input name="name" maxLength={60} defaultValue={editing.name} />
            </label>
            <label>
              Daily cap (USD)
              <input
                name="daily"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Optional"
                defaultValue={editing.dailyCap === null ? "" : editing.dailyCap / 1_000_000}
              />
            </label>
            <label>
              Lifetime cap (USD)
              <input
                name="cap"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Optional"
                defaultValue={editing.cap === null ? "" : editing.cap / 1_000_000}
              />
            </label>
            <label>
              Expires (UTC)
              <input
                name="expires"
                type="date"
                min={day(Date.now())}
                defaultValue={editing.expires ? day(editing.expires) : ""}
              />
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="button accent" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="button quiet" onClick={cancelRowAction} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {signedIn && revoke && (
        <div className="panel callout">
          <div>
            <h2 ref={revokeHeading} tabIndex={-1}>
              Revoke {revoke.name}?
            </h2>
            <p>Clients using this key will lose API access immediately.</p>
          </div>
          <div className="actions">
            <button className="button danger" type="button" onClick={disable} disabled={busy}>
              Revoke key
            </button>
            <button className="button quiet" type="button" onClick={cancelRowAction} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="panel key-records">
        {signedIn && data?.length ? (
          <div className="table-wrap">
            <table role="table" aria-label="Workspace API keys">
              <thead role="rowgroup">
                <tr role="row">
                  {["Name", "Key", "Status", "Last used", "Created", "Daily / total", "Actions"].map(
                    (label) => (
                      <th role="columnheader" scope="col" key={label}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {data.map((item) => (
                  <tr role="row" key={item.id}>
                    <th role="rowheader" scope="row">
                      {item.name}
                    </th>
                    <td role="cell" className="key-record-prefix">
                      <code>{item.prefix}…</code>
                    </td>
                    <td role="cell">
                      <span className="key-record-label" aria-hidden="true">
                        Status
                      </span>
                      <span className="pill">
                        {item.revoked
                          ? "Revoked"
                          : item.expires && item.expires < Date.now()
                            ? "Expired"
                            : "Active"}
                      </span>
                      {item.expires && !item.revoked ? (
                        <small className="key-record-expiry">Expires {date(item.expires)} UTC</small>
                      ) : null}
                    </td>
                    <td role="cell">
                      <span className="key-record-label" aria-hidden="true">
                        Last used
                      </span>
                      {item.lastUsed ? date(item.lastUsed) : "Never"}
                    </td>
                    <td role="cell">
                      <span className="key-record-label" aria-hidden="true">
                        Created
                      </span>
                      {date(item.created)}
                    </td>
                    <td role="cell">
                      <span className="key-record-label" aria-hidden="true">
                        Daily / total cap
                      </span>
                      {item.dailyCap !== null ? usd(item.dailyCap) : "—"} /{" "}
                      {item.cap !== null ? usd(item.cap) : "—"}
                      <small className="key-record-expiry">Today {creditBalance(item.todaySpent ?? 0)}</small>
                    </td>
                    <td role="cell" className="key-record-action">
                      {!item.revoked && (
                        <>
                          <button
                            type="button"
                            className="button quiet small"
                            aria-label={`Edit ${item.name}`}
                            disabled={busy}
                            onClick={(event) => {
                              rowAction.current = event.currentTarget;
                              setOpen(false);
                              setKey("");
                              setRevoke(null);
                              setStatus("");
                              setEditing(item);
                              setFailure("");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button quiet small"
                            aria-label={`Revoke ${item.name}`}
                            disabled={busy}
                            onClick={(event) => {
                              rowAction.current = event.currentTarget;
                              setOpen(false);
                              setKey("");
                              setEditing(null);
                              setStatus("");
                              setRevoke(item);
                            }}
                          >
                            Revoke
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              signedIn && error
                ? "API keys unavailable"
                : signedIn && !data
                  ? "Loading keys…"
                  : "No API keys to show"
            }
            icon={<KeyRound size={23} />}
          >
            <p>
              {!signedIn
                ? "Connect a Solana wallet to open your workspace."
                : error
                  ? "Try reloading the list."
                  : data
                    ? "Create a key to call the API from your own client."
                    : "Getting your workspace keys."}
            </p>
            {signedIn && error ? (
              <button className="button quiet small" type="button" onClick={reload}>
                Reload keys
              </button>
            ) : (
              <Link className="text-link" href="/docs/quickstart">
                Read the quickstart <ArrowUpRight size={15} />
              </Link>
            )}
          </Empty>
        )}
      </div>
    </>
  );
}

const usageModelNames = new Map<string, string>(models.map((model) => [model.id, model.name]));
const usageModelName = (id: string) => usageModelNames.get(id) ?? id;
const usageChartMetrics = ["Spend", "Requests", "Tokens", "Errors", "Cached input"] as const;
const usageGroups = ["Model", "Provider", "Key"] as const;
type UsageGroup = (typeof usageGroups)[number];
type UsageMetric = (typeof usageChartMetrics)[number];
type UsageTotals = ReturnType<typeof summarizeUsage>;
const breakdownOrders = {
  spend: "Highest spend",
  requests: "Most requests",
  failed: "Most errors",
  held: "Most held credit",
  name: "Name",
} as const;
const usageCount = new Intl.NumberFormat("en-US");
const usagePercent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function usageMetricValue(totals: UsageTotals, metric: UsageMetric) {
  switch (metric) {
    case "Spend":
      return totals.spend;
    case "Requests":
      return totals.requests;
    case "Tokens":
      return totals.input + totals.output;
    case "Errors":
      return totals.failed;
    case "Cached input":
      return totals.cacheSamples ? totals.cached : undefined;
  }
}

export function Usage({
  signedIn,
  balance,
  range,
  setRange,
  liveRows,
}: {
  signedIn: boolean;
  balance?: number;
  range: number;
  setRange: (range: number) => void;
  liveRows?: UsageRow[];
}) {
  const [metric, setMetric] = useState<UsageMetric>("Spend");
  const [group, setGroup] = useState<UsageGroup>("Model");
  const [view, setView] = useState<"Chart" | "Table">("Chart");
  const [order, setOrder] = useState<keyof typeof breakdownOrders>("spend");
  const [filters, setFilters] = useState(noUsageFilters);
  const providerFilter = useRef<HTMLSelectElement>(null);
  const { data, error, reload } = useRemote<UsageRow[]>(signedIn, "usage?days=" + range);
  const usage = signedIn ? (liveRows ?? data) : null;
  const source = usage ?? [];
  const filtered = Object.values(filters).some(Boolean);
  const rows = filtered ? filterUsage(source, filters) : source;
  const loading = signedIn && !usage && !error;
  const capped = source.length >= 1000;
  const activityStatus = !signedIn
    ? "Connect a wallet to see request activity."
    : loading
      ? "Loading activity…"
      : usage
        ? filtered
          ? "No requests match these filters."
          : "No activity in this period."
        : "Activity is unavailable.";

  const modelIds = [...new Set(source.map((row) => row.model))].sort(
    (a, b) => usageModelName(a).localeCompare(usageModelName(b)) || a.localeCompare(b),
  );
  const keyNames = new Map<string, string>();
  for (const row of source) {
    const key = usageKey(row);
    if (!keyNames.has(key)) keyNames.set(key, row.keyName);
  }
  const keyNameCounts = new Map<string, number>();
  for (const label of keyNames.values()) keyNameCounts.set(label, (keyNameCounts.get(label) ?? 0) + 1);
  const keyOptions = Array.from(keyNames, ([key, name]) => {
    const label =
      (keyNameCounts.get(name) ?? 0) > 1 && key.startsWith("key:") ? `${name} · ${key.slice(-6)}` : name;
    return [key, label] as const;
  }).sort((left, right) => left[1].localeCompare(right[1]));
  const keyLabels = new Map(keyOptions);
  const updateFilter = (field: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [field]: value }));

  const totals = summarizeUsage(rows);
  const resolved = totals.complete + totals.failed;
  const providerDuration = providerP95(rows);
  const stats = [
    ["Credit balance", balance === undefined ? "—" : creditBalance(balance), "Available workspace credits"],
    ["Spend", usage ? usd(totals.spend) : "—", "Settled charges"],
    [
      "Requests",
      usage ? usageCount.format(totals.requests) : "—",
      usage ? `${usageCount.format(totals.failed)} failed` : undefined,
    ],
    ["Tokens", usage ? usageCount.format(totals.input + totals.output) : "—", "Input and output combined"],
    [
      "Success rate",
      resolved ? usagePercent.format(totals.complete / resolved) : "—",
      `${usageCount.format(resolved)} resolved requests`,
    ],
    ["Held credits", usage ? usd(totals.held) : "—", "Reserved or under review"],
    [
      "Cached input",
      totals.cacheSamples ? usageCount.format(totals.cached) : "—",
      totals.cacheSamples
        ? `${usageCount.format(totals.cacheSamples)} requests reporting cache`
        : "No cache measurements",
    ],
    [
      "Provider duration p95",
      providerDuration.value === undefined
        ? "—"
        : providerDuration.value < 1000
          ? `${providerDuration.value} ms`
          : `${(providerDuration.value / 1000).toFixed(2)} s`,
      providerDuration.samples
        ? `${usageCount.format(providerDuration.samples)} measured requests`
        : "No duration measurements",
    ],
  ];
  const grouped = Map.groupBy(rows, (row) =>
    group === "Model" ? row.model : group === "Provider" ? row.provider : usageKey(row),
  );
  const breakdown = Array.from(grouped, ([id, entries]) => ({
    id,
    label:
      group === "Model"
        ? usageModelName(id)
        : group === "Provider"
          ? (providerNames[id as ProviderId] ?? id)
          : (keyLabels.get(id) ?? entries[0].keyName),
    ...summarizeUsage(entries),
  })).sort((a, b) => (order === "name" ? 0 : b[order] - a[order]) || a.label.localeCompare(b.label));

  const daily = Map.groupBy(rows, (row) => day(row.time));
  const firstSampleAt = capped ? source[source.length - 1].time : undefined;
  const firstSampleDay = firstSampleAt === undefined ? undefined : day(firstSampleAt);
  const now = Date.now();
  const series = Array.from({ length: range }, (_, index) => {
    const time = now - (range - index - 1) * 86_400_000;
    const dateKey = day(time);
    const value =
      firstSampleDay && dateKey < firstSampleDay
        ? undefined
        : usageMetricValue(summarizeUsage(daily.get(dateKey) ?? []), metric);
    return { time, value };
  });
  const high = Math.max(1, ...series.map((point) => point.value ?? 0));
  const hasMetric = series.some((point) => point.value !== undefined);
  const metricValue = (value: number | undefined) =>
    value === undefined ? "—" : metric === "Spend" ? usd(value) : usageCount.format(value);

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([usageCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sonnely-usage-" + day(Date.now()) + ".csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <WorkspaceHeading
        icon={BarChart3}
        title="Usage"
        description="Track charges, tokens, and request performance. Dates use UTC."
      >
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
      {!liveRows && error && (
        <div className="actions">
          <Failure message={error} />
          <button type="button" className="button quiet" onClick={reload}>
            Retry usage
          </button>
        </div>
      )}
      {signedIn && (
        <section className="panel usage-filters" aria-label="Usage filters">
          <div className="usage-filter-grid">
            <label className="control-label">
              Provider
              <select
                ref={providerFilter}
                value={filters.provider}
                onChange={(event) => updateFilter("provider", event.target.value)}
              >
                <option value="">All providers</option>
                {providerIds.map((id) => (
                  <option key={id} value={id}>
                    {providerNames[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-label">
              Model
              <select value={filters.model} onChange={(event) => updateFilter("model", event.target.value)}>
                <option value="">All models</option>
                {filters.model && !modelIds.includes(filters.model) && (
                  <option value={filters.model}>{usageModelName(filters.model)}</option>
                )}
                {modelIds.map((id) => (
                  <option key={id} value={id}>
                    {usageModelName(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-label">
              API key
              <select value={filters.key} onChange={(event) => updateFilter("key", event.target.value)}>
                <option value="">All keys</option>
                {filters.key && !keyLabels.has(filters.key) && (
                  <option value={filters.key}>Selected key</option>
                )}
                {keyOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-label">
              Status
              <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
                <option value="">All statuses</option>
                {Object.entries(usageStates).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {usage && (
            <div className="usage-sample">
              <p className="caption" role="status">
                {usageCount.format(rows.length)} of {usageCount.format(source.length)} requests shown.
                {capped && " Analytics and CSV cover the 1,000 most recent requests in this date range."}
              </p>
              {filtered && (
                <button
                  type="button"
                  className="button quiet small"
                  onClick={() => {
                    setFilters(noUsageFilters);
                    providerFilter.current?.focus();
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>
      )}
      <div className="stat-grid usage-stats" role="group" aria-label="Usage summary">
        {stats.map(([label, value, description]) => (
          <div className="panel stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            {description && <small>{description}</small>}
          </div>
        ))}
      </div>
      <section className="panel chart-panel" aria-labelledby="usage-chart-heading">
        <div className="between controls">
          <h2 id="usage-chart-heading">{metric} by day</h2>
          <div className="actions">
            <label className="control-label">
              Chart metric
              <select value={metric} onChange={(event) => setMetric(event.target.value as UsageMetric)}>
                {usageChartMetrics.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <div className="segmented" aria-label="Chart view">
              {(["Chart", "Table"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={value === view}
                  onClick={() => setView(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
        {firstSampleAt !== undefined && (
          <p className="caption">Days before {date(firstSampleAt)} fall outside this sample.</p>
        )}
        {!rows.length || !hasMetric ? (
          <div className="chart-empty">
            <BarChart3 size={23} aria-hidden="true" />
            <p role="status">
              {!rows.length ? activityStatus : "No cached input measurements in this view."}
            </p>
          </div>
        ) : view === "Chart" ? (
          <>
            <div className="bars" role="img" aria-label={metric + " by day over the last " + range + " days"}>
              {series.map(({ time, value }) => (
                <span
                  key={time}
                  title={shortDate(time) + " · " + metricValue(value)}
                  data-empty={!value || undefined}
                  style={{ height: value ? Math.max(1, (value / high) * 100) + "%" : "1px" }}
                />
              ))}
            </div>
            <div className="between caption">
              <span>{shortDate(series[0].time)}</span>
              <span>{shortDate(series[range - 1].time)}</span>
            </div>
          </>
        ) : (
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date (UTC)</th>
                  <th scope="col">{metric}</th>
                </tr>
              </thead>
              <tbody>
                {series.map(({ time, value }) => (
                  <tr key={time}>
                    <th scope="row">{date(time)}</th>
                    <td>{metricValue(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel breakdown">
        <div className="between controls">
          <h2 id="request-breakdown">Request breakdown</h2>
          <div className="actions">
            <div className="segmented" aria-label="Group usage">
              {usageGroups.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={value === group}
                  onClick={() => setGroup(value)}
                >
                  By {value.toLowerCase()}
                </button>
              ))}
            </div>
            <label className="control-label">
              Sort groups
              <select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>
                {Object.entries(breakdownOrders).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {breakdown.length ? (
          <div
            className="table-wrap workspace-data-table"
            role="region"
            aria-labelledby="request-breakdown"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {[group, "Requests", "Failed", "Input", "Cached input", "Output", "Spend", "Held"].map(
                    (value) => (
                      <th scope="col" key={value}>
                        {value}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {breakdown.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">{entry.label}</th>
                    <td>{usageCount.format(entry.requests)}</td>
                    <td>{usageCount.format(entry.failed)}</td>
                    <td>{usageCount.format(entry.input)}</td>
                    <td>{entry.cacheSamples ? usageCount.format(entry.cached) : "—"}</td>
                    <td>{usageCount.format(entry.output)}</td>
                    <td>{usd(entry.spend)}</td>
                    <td>{usd(entry.held)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="caption">{activityStatus}</p>
        )}
      </section>
      {rows.length > 0 && (
        <section className="panel breakdown">
          <div className="between controls">
            <h2 id="recent-request-references">Recent requests</h2>
            <Link className="text-link" href="/console/logs">
              Open request logs <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div
            className="table-wrap workspace-data-table"
            role="region"
            aria-labelledby="recent-request-references"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Tokens</th>
                  <th>Billing</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      {usageModelName(row.model)}
                      <div className="caption">
                        {date(row.time)} · {providerNames[row.provider]} ·{" "}
                        <CopyButton value={row.id} label="Copy request reference" />
                      </div>
                      <Link className="text-link" href={"/console/logs?request=" + encodeURIComponent(row.id)}>
                        View request details
                      </Link>
                    </th>
                    <td>{(row.input + row.output).toLocaleString()}</td>
                    <td>
                      {row.status === "complete"
                        ? `Charged ${creditBalance(row.cost)}`
                        : row.status === "failed"
                          ? "Released"
                          : `${row.status === "unreported" ? "Under review" : "Reserved"} · ${creditBalance(row.cost)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link className="text-link" href="/contact">
            Get help with a charge <ArrowUpRight size={15} />
          </Link>
        </section>
      )}
      {usage && <UsageMax days={range} hasUsage={source.some((row) => row.status === "complete")} />}
    </>
  );
}

type Payment = {
  uri: string;
  reference: string;
  cluster: string;
  amount: number;
  sol?: SolPayment;
  qr: string;
  archivedAt?: number;
};
type Confirmation = { ok: boolean; cluster: string };
type Receipt = {
  reference: string;
  cluster: string;
  amount: number;
  sol?: SolPayment;
  signature?: string;
  time: number;
  archivedAt?: number;
};

export function Billing({
  session,
  refresh,
  intentsFunding,
  solFunding,
}: {
  session: Session | null;
  refresh: () => Promise<void>;
  intentsFunding?: { widgetUrl?: string };
  solFunding?: boolean;
}) {
  const profile = session?.profile;
  const intentsWidgetUrl = intentsFunding?.widgetUrl;
  const { data, error, reload } = useRemote<Receipt[]>(Boolean(profile), "history");
  const [dollars, setDollars] = useState("5");
  const [method, setMethod] = useState<"usdc" | "sol" | "confidential" | "other">("usdc");
  const showSol = Boolean(solFunding && session?.cluster === "mainnet");
  const showConfidential = Boolean(profile && session?.cluster === "mainnet");
  const showOther = Boolean(intentsFunding && session?.cluster === "mainnet");
  const confidential = useRemote<ConfidentialPaymentsSnapshot>(
    showConfidential,
    confidentialPaymentsRoute + "orders",
    { keepPrevious: true, scope: profile?.wallet },
  );
  const [confidentialSelection, setConfidentialSelection] = useState<{
    wallet: string;
    order: ConfidentialPayment | null;
  }>();
  const selectedPayment = confidentialSelection?.wallet === profile?.wallet ? confidentialSelection : undefined;
  const confidentialOrder = selectedPayment ? selectedPayment.order : confidential.data?.order ?? null;
  const confidentialHistory = new Map(
    (confidential.data?.history ?? []).map((payment) => [payment.reference, payment]),
  );
  if (confidentialOrder) confidentialHistory.set(confidentialOrder.reference, confidentialOrder);
  const paymentHistory = [
    ...(data ?? []).map((item) => ({ kind: "public" as const, item, time: item.time })),
    ...Array.from(confidentialHistory.values(), (item) => ({
      kind: "confidential" as const,
      item,
      time: item.createdAt,
    })),
  ].sort((left, right) => right.time - left.time);
  const [fund, setFund] = useState<IntentFund>("sol");
  const [fundAmount, setFundAmount] = useState("0.1");
  const [refundTo, setRefundTo] = useState("");
  const [intent, setIntent] = useState<FundingQuote | null>(null);
  const fundingDetails = intent?.recipient === profile?.wallet ? intent : null;
  const swapAsset = intentFunds[fund];
  const [order, setOrder] = useState<Payment | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const expiresAt = order?.sol?.expiresAt;
  useEffect(() => {
    setQuoteExpired(Boolean(expiresAt && expiresAt <= Date.now()));
    if (!expiresAt) return;
    const timer = setTimeout(() => setQuoteExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const [submittedSignature, setSubmittedSignature] = useState("");
  const submitted = Boolean(submittedSignature);
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState("");
  const [archive, setArchive] = useState("");
  const quoting = pending === "quote" || pending === "prepare-swap";
  const [failure, setFailure] = useState<{ action: string; message: string }>();
  const [status, setStatus] = useState("");

  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const review = useRef<HTMLElement>(null);
  const paymentAmount = useRef<HTMLInputElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const archiveConfirmation = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (order) reviewHeading.current?.focus();
  }, [order]);

  useEffect(() => {
    if (archive) archiveConfirmation.current?.focus();
  }, [archive]);

  const reference = order?.reference;
  const wallet = profile?.wallet;
  const archived = order?.archivedAt !== undefined;

  async function finishPayment(cluster: string) {
    if (review.current?.contains(document.activeElement)) paymentAmount.current?.focus();
    setStatus(cluster === "mainnet" ? "Payment confirmed. Credits added." : "Devnet payment verified.");
    setFailure(undefined);
    setOrder(null);
    setSignature("");
    setSubmittedSignature("");
    reload();
    await refresh();
  }

  const reportFinality = useEffectEvent(finishPayment);
  useEffect(() => {
    if (!wallet || !reference || !session?.paymentVerificationEnabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const signed = submittedSignature
          ? await request<Confirmation>("confirm", { reference, signature: submittedSignature }).catch(
              () => undefined,
            )
          : undefined;
        if (stopped) return;
        const result = signed?.ok ? signed : await request<Confirmation>("confirm", { reference });
        if (!stopped && result.ok) {
          await reportFinality(result.cluster);
          return;
        }
      } catch {
        // Keep the draft available if RPC finality checks are temporarily unavailable.
      }
      if (!stopped) timer = setTimeout(check, 8_000);
    }
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [reference, session?.paymentVerificationEnabled, submittedSignature, wallet]);

  function openPayment(payment: Payment) {
    setOrder(payment);
    setQuoteExpired(Boolean(payment.sol && payment.sol.expiresAt <= Date.now()));
    setSignature("");
    setSubmittedSignature("");
  }

  async function resumePayment(reference: string) {
    const payment = await request<Payment>("payment?reference=" + encodeURIComponent(reference));
    setMethod(payment.sol ? "sol" : "usdc");
    openPayment(payment);
  }

  function selectConfidentialPayment(payment: ConfidentialPayment | null) {
    if (!profile) return;
    setConfidentialSelection({ wallet: profile.wallet, order: payment });
    if (payment) confidential.reload();
    if (payment?.status === "credited") void refresh().catch(() => {});
  }

  async function run(name: string, action: () => Promise<void>) {
    setPending(name);
    setFailure(undefined);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setFailure({ action: name, message: error instanceof Error ? error.message : "The request failed." });
    } finally {
      setPending("");
    }
  }

  return (
    <>
      <WorkspaceHeading
        icon={Wallet}
        title="Billing"
        description="Add compute credits, check your balance, and track wallet payments."
      />
      <Failure
        message={failure && !["deposit", "pay", "confirm"].includes(failure.action) ? failure.message : error}
      />
      <p role="status" className={status ? "status" : "visually-hidden"}>
        {status}
      </p>
      <div className="billing-grid">
        <section className="panel stack-panel billing-balance">
          <div className="between">
            <h2>Compute balance</h2>
            <Wallet size={21} />
          </div>
          <p className="amount">{profile ? creditBalance(profile.balance) : "—"}</p>
          <p className="caption">Available for inference.</p>
          {profile && profile.balance > 0 && (
            <Link className="text-link" href="/console">
              Send a prompt <ArrowUpRight size={16} />
            </Link>
          )}
          <Link className="text-link" href="/models">
            View token rates <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="panel stack-panel buy-credits" id="buy-credits">
          <div className="between">
            <h2>Buy credits</h2>
            <span className="pill">{session?.billingEnabled ? session.cluster : "Solana Pay"}</span>
          </div>
          {(showSol || showConfidential || showOther) && (
            <fieldset className="billing-payment-method">
              <legend>Payment method</legend>
              <div className="billing-payment-options">
                {(
                  [
                    { id: "usdc", label: "USDC", available: true },
                    { id: "sol", label: "SOL", available: showSol },
                    { id: "confidential", label: "Confidential USDC", available: showConfidential },
                    { id: "other", label: "Other crypto", available: showOther },
                  ] as const
                )
                  .filter(({ available }) => available)
                  .map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className="button quiet"
                      aria-pressed={method === id}
                      disabled={!!pending || submitted}
                      onClick={() => {
                        if (method === id) return;
                        setMethod(id);
                        setIntent(null);
                        setFailure(undefined);
                      }}
                    >
                      {label}
                    </button>
                  ))}
              </div>
            </fieldset>
          )}
          {(method === "usdc" || method === "sol") && (
            <>
              <p className="caption">
                {session?.termsRequired
                  ? "Accept the current terms above to buy credits."
                  : profile
                    ? method === "sol"
                      ? "Enter the USD credit amount. You’ll review a time-limited SOL quote before you pay."
                      : "Credits post after your public USDC transfer finalizes."
                    : "Connect your Solana wallet in the header to buy credits."}
              </p>
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("deposit", async () => {
                    const amount = parseCreditAmount(dollars);
                    if (amount === null)
                      throw new Error("Enter a positive amount with up to six decimal places.");
                    if (
                      order?.amount === amount &&
                      Boolean(order.sol) === (method === "sol") &&
                      !quoteExpired &&
                      !archived
                    ) {
                      reviewHeading.current?.focus();
                      return;
                    }
                    const existing = data?.find(
                      (item) =>
                        !item.signature &&
                        item.archivedAt === undefined &&
                        item.cluster === session?.cluster &&
                        item.amount === amount &&
                        Boolean(item.sol) === (method === "sol") &&
                        (!item.sol || item.sol.expiresAt > Date.now()),
                    );
                    if (existing) await resumePayment(existing.reference);
                    else {
                      openPayment(
                        await request<Payment>("deposit", {
                          dollars,
                          ...(method === "sol" ? { asset: "sol" } : {}),
                        }),
                      );
                      reload();
                    }
                  });
                }}
              >
                <label>
                  {method === "sol" ? "Credits in USD" : "Amount in USDC"}
                  <input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    inputMode="decimal"
                    required
                    ref={paymentAmount}
                    value={dollars}
                    onChange={(e) => {
                      setDollars(e.target.value);
                      if (failure?.action === "deposit" || failure?.action === "pay") setFailure(undefined);
                    }}
                  />
                </label>
                <button
                  className="button accent"
                  disabled={!profile || !session?.billingEnabled || !!pending || submitted}
                >
                  {pending === "deposit" ? "Preparing…" : "Continue to payment"}
                </button>
              </form>
              {failure?.action === "deposit" && <Failure message={failure.message} />}
            </>
          )}
          {method === "confidential" && showConfidential && (
            <ConfidentialCheckout
              key={profile?.wallet}
              order={confidentialOrder}
              available={Boolean(confidential.data?.available && session?.billingEnabled)}
              loading={!confidential.data && !confidential.error}
              lookupError={confidential.error}
              retry={confidential.reload}
              amount={dollars}
              changeAmount={setDollars}
              onOrder={selectConfidentialPayment}
            />
          )}
          {method === "other" && showOther && intentsWidgetUrl && (
            <IntentsCheckout
              url={intentsWidgetUrl}
              wallet={profile?.wallet}
              unavailableReason={
                session?.termsRequired
                  ? "Accept the current terms above to use NEAR Intents."
                  : !session?.billingEnabled
                    ? "Swaps are temporarily unavailable."
                    : undefined
              }
            />
          )}
          {method === "other" && showOther && !intentsWidgetUrl && (
            <div className="stack-panel">
              <p className="caption">
                NEAR Intents converts your funds to USDC in your wallet. Then pay with USDC to add credits.
              </p>
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setIntent(null);
                  void run("quote", async () =>
                    setIntent(
                      await request<FundingQuote>("quote", {
                        asset: fund,
                        amount: fundAmount.trim(),
                        ...(fund !== "sol" ? { refundTo: refundTo.trim() } : {}),
                      }),
                    ),
                  );
                }}
              >
                {method === "other" && (
                  <label>
                    Source asset
                    <select
                      value={fund}
                      disabled={quoting}
                      onChange={(event) => {
                        setFund(event.target.value as IntentFund);
                        setIntent(null);
                      }}
                    >
                      {Object.entries(intentFunds).map(([id, asset]) => (
                        <option key={id} value={id}>
                          {asset.symbol} on {asset.network}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Amount in {swapAsset.symbol}
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    maxLength={37}
                    disabled={quoting}
                    value={fundAmount}
                    onChange={(event) => {
                      setFundAmount(event.target.value);
                      setIntent(null);
                    }}
                  />
                </label>
                {fund !== "sol" && (
                  <label>
                    Refund wallet on {swapAsset.network}
                    <input
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="0x…"
                      required
                      maxLength={42}
                      disabled={quoting}
                      value={refundTo}
                      onChange={(event) => {
                        setRefundTo(event.target.value);
                        setIntent(null);
                      }}
                    />
                  </label>
                )}
                <button className="button quiet" disabled={!profile || !session?.billingEnabled || !!pending}>
                  {pending === "quote" ? "Quoting…" : "Get quote"}
                </button>
              </form>
              {fundingDetails && (
                <section className="checkout" aria-label="Swap details">
                  <p role="status" className="status">
                    {creditBalance(Number(fundingDetails.amountOut))} estimated ·{" "}
                    {creditBalance(Number(fundingDetails.minAmountOut))} minimum
                  </p>
                  {fundingDetails.depositAddress ? (
                    <>
                      <p>
                        Send exactly{" "}
                        <strong>
                          {fundAmount.trim()} {swapAsset.symbol}
                        </strong>{" "}
                        on <strong>{swapAsset.network} mainnet</strong> to the address below before{" "}
                        {new Date(fundingDetails.deadline).toLocaleTimeString([], { timeZoneName: "short" })}.
                        Save the address and transaction ID.
                      </p>
                      <CopyButton value={fundingDetails.depositAddress} label="Copy swap deposit address" />
                      <code style={{ overflowWrap: "anywhere" }}>{fundingDetails.depositAddress}</code>
                      {fundingDetails.depositMemo && (
                        <>
                          <p>Include this memo with your transfer.</p>
                          <CopyButton value={fundingDetails.depositMemo} label="Copy deposit memo" />
                          <code style={{ overflowWrap: "anywhere" }}>{fundingDetails.depositMemo}</code>
                        </>
                      )}
                      <p className="caption">
                        Solana USDC goes to {shorten(fundingDetails.recipient)}. Refunds go to{" "}
                        {shorten(fundingDetails.refundTo)} on {swapAsset.network}. Once USDC arrives in your
                        wallet, select USDC to finish paying for credits.
                      </p>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button accent"
                      disabled={!!pending || !session?.billingEnabled || session.termsRequired}
                      onClick={() =>
                        void run("prepare-swap", async () =>
                          setIntent(
                            await request<FundingQuote>("quote", {
                              asset: fund,
                              amount: fundAmount.trim(),
                              ...(fund !== "sol" ? { refundTo: refundTo.trim() } : {}),
                              prepare: true,
                            }),
                          ),
                        )
                      }
                    >
                      {pending === "prepare-swap" ? "Preparing…" : "Get swap deposit address"}
                    </button>
                  )}
                </section>
              )}
            </div>
          )}
          {order && profile && method === (order.sol ? "sol" : "usdc") && (
            <section
              ref={review}
              className="checkout"
              aria-label={archived ? "Archived payment" : "Review transfer"}
            >
              <div className="between">
                <h2 ref={reviewHeading} tabIndex={-1}>
                  {archived
                    ? "Archived payment"
                    : order.sol
                      ? "Pay " + solDecimal(order.sol.lamports) + " SOL"
                      : "Pay " + creditBalance(order.amount) + " in USDC"}
                </h2>
                <span className="pill">{order.cluster}</span>
              </div>
              <p className="caption">
                {archived
                  ? "If you already sent this transfer, you can still check for confirmation and receive credits."
                  : order.sol
                    ? `${creditBalance(order.amount)} in credits at $${order.sol.priceUsd} per SOL. Quote expires at ${new Date(order.sol.expiresAt).toLocaleTimeString()}. Network fees are separate.`
                    : "Your wallet shows the transfer before you approve. A small SOL fee and token account setup may apply."}
              </p>
              {submitted ? (
                <p role="status" className="status">
                  Payment submitted. Waiting for Solana finality…
                </p>
              ) : archived ? null : quoteExpired ? (
                <p role="status">SOL quote expired. Continue to payment to request a new quote.</p>
              ) : (
                <>
                  <button
                    type="button"
                    className="button accent"
                    disabled={!session?.billingEnabled || !!pending}
                    onClick={() =>
                      void run("pay", async () => {
                        const sent = await payWithWallet(profile.wallet, order.reference, order.cluster);
                        setSignature(sent);
                        setSubmittedSignature(sent);
                      })
                    }
                  >
                    {pending === "pay" ? "Waiting for wallet…" : "Pay with connected wallet"}
                  </button>
                  {failure?.action === "pay" && <Failure message={failure.message} />}
                  <details>
                    <summary>Use a Solana Pay link or QR code</summary>
                    <div className="payment-qr">
                      <img src={order.qr} width={176} height={176} alt="Scan with a Solana Pay wallet" />
                      <div>
                        <p>Open the payment in a compatible wallet on {order.cluster}.</p>
                        <a className="button quiet" href={order.uri}>
                          Open in wallet <ArrowUpRight size={16} />
                        </a>
                        <CopyButton value={order.uri} label="Copy payment link" />
                      </div>
                    </div>
                  </details>
                </>
              )}
              <details key={order.reference} open={archived || undefined}>
                <summary>Check payment status</summary>
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run("confirm", async () => {
                      const result = await request<Confirmation>("confirm", {
                        reference: order.reference,
                        signature: signature.trim() || undefined,
                      });
                      if (result.ok) await finishPayment(result.cluster);
                      else setStatus("Waiting for a matching, finalized payment.");
                    });
                  }}
                >
                  <label>
                    Transaction signature (optional)
                    <input
                      minLength={64}
                      maxLength={88}
                      value={signature}
                      onChange={(event) => setSignature(event.target.value)}
                    />
                  </label>
                  <button
                    className="button quiet"
                    disabled={!session?.paymentVerificationEnabled || !!pending}
                  >
                    {pending === "confirm" ? "Checking…" : "Check now"}
                  </button>
                </form>
                {failure?.action === "confirm" && <Failure message={failure.message} />}
              </details>
            </section>
          )}
        </section>
        <section className="panel breakdown billing-history">
          <h2 id="payment-history" ref={historyHeading} tabIndex={-1}>
            Payment history
          </h2>
          {profile && paymentHistory.length > 0 ? (
            <div
              className="table-wrap workspace-data-table payment-history"
              role="region"
              aria-labelledby="payment-history"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th>Network</th>
                    <th>Credits</th>
                    <th>Paid with</th>
                    <th>Status</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map(({ kind, item, time }) => kind === "confidential" ? (
                    <tr key={item.reference}>
                      <td>{date(time)}</td>
                      <td>{item.cluster}</td>
                      <td>{creditBalance(item.amount)}</td>
                      <td>Confidential USDC</td>
                      <td>{confidentialPaymentStatus(item)}</td>
                      <td>
                        <button
                          type="button"
                          className="text-link"
                          disabled={Boolean(pending) || submitted}
                          onClick={() => {
                            setMethod("confidential");
                            selectConfidentialPayment(item);
                          }}
                        >
                          View payment
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.reference}>
                      <td>{date(item.time)}</td>
                      <td>{item.cluster}</td>
                      <td>{creditBalance(item.amount)}</td>
                      <td>{item.sol ? solDecimal(item.sol.lamports) + " SOL" : "USDC"}</td>
                      <td>
                        {item.signature ? (
                          <div className="payment-status">
                            <a
                              className="text-link"
                              href={
                                "https://explorer.solana.com/tx/" +
                                item.signature +
                                (item.cluster === "devnet" ? "?cluster=devnet" : "")
                              }
                            >
                              Finalized <ArrowUpRight size={13} />
                            </a>
                            <CopyButton
                              value={`Sonnely ${item.sol ? "SOL" : "USDC"} receipt ${creditBalance(item.amount)} ${item.cluster} ${item.signature}`}
                              label="Copy receipt"
                            />
                          </div>
                        ) : archive === item.reference ? (
                          <div className="payment-status">
                            <span className="caption">Archive this payment request?</span>
                            <button
                              className="text-link"
                              type="button"
                              ref={archiveConfirmation}
                              disabled={!!pending}
                              onClick={() =>
                                void run("archive", async () => {
                                  await request("cancel-deposit", { reference: item.reference });
                                  historyHeading.current?.focus();
                                  setOrder((current) =>
                                    current?.reference === item.reference
                                      ? { ...current, archivedAt: Date.now(), uri: "", qr: "" }
                                      : current,
                                  );
                                  setArchive("");
                                  reload();
                                  setStatus("Payment request archived. You can still check for a finalized transfer.");
                                })
                              }
                            >
                              Confirm archive
                            </button>
                            <button
                              className="text-link"
                              type="button"
                              disabled={!!pending}
                              onClick={() => {
                                setArchive("");
                                historyHeading.current?.focus();
                              }}
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <div className="payment-status">
                            <span className="caption">
                              {item.archivedAt !== undefined ? "Archived" : "Awaiting payment"}
                            </span>
                            <button
                              className="text-link"
                              type="button"
                              aria-label={item.archivedAt !== undefined ? "Check archived payment" : "Resume payment"}
                              disabled={!!pending}
                              onClick={() => {
                                if (order?.reference === item.reference && reviewHeading.current)
                                  reviewHeading.current.focus();
                                else void run("resume", () => resumePayment(item.reference));
                              }}
                            >
                              {item.archivedAt !== undefined ? "Check status" : "Resume"}
                            </button>
                            {item.archivedAt === undefined && (
                              <button
                                className="text-link"
                                type="button"
                                disabled={!!pending}
                                onClick={() => setArchive(item.reference)}
                              >
                                Archive request
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <CopyButton value={item.reference} label="Copy payment reference" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="caption" role="status">
              {!profile
                ? "Connect a wallet to view payment history."
                : error
                  ? "Payment history is unavailable."
                  : data
                    ? "No payments to show."
                    : "Loading payment history…"}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

type ReferralRow = { username?: string; wallet: string; joined: number; funded: boolean; active: boolean };
type ReferralPage = { page: ReferralRow[]; isDone: boolean; continueCursor: string };

export function Referrals({ profile }: { profile: Profile }) {
  const [cursor, setCursor] = useState("");
  const [earlier, setEarlier] = useState<ReferralRow[]>([]);
  const { data, error, reload } = useRemote<ReferralPage>(
    Boolean(profile),
    "referral-pipeline" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
  );
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = profile ? origin + "/console?ref=" + profile.referral : "";
  const loading = Boolean(profile) && !data && !error;
  const rows = [...earlier, ...(data?.page ?? [])];
  return (
    <>
      <WorkspaceHeading
        icon={Users}
        title="Referrals"
        description="Track invitations from wallet sign-up through funding and first paid request."
      />
      <Failure message={error} />
      <section className="panel callout referral-invite">
        <div>
          <span className="empty-icon">
            <Users size={22} />
          </span>
          <h2>Your invite link</h2>
          {profile && origin ? (
            <>
              <p>
                {profile.username
                  ? "@" + profile.username
                  : "Add a username in Settings so referrals can recognize you."}
              </p>
              <code className="secret-code">{url}</code>
            </>
          ) : (
            <p>Connect a Solana wallet to get your personal invite link.</p>
          )}
        </div>
        {profile && origin && (
          <div className="actions">
            <CopyButton value={url} label="Copy invite link" />
            <Link href="/console/settings" className="button quiet">
              {profile.username ? "Edit username" : "Set username"}
            </Link>
          </div>
        )}
      </section>
      <section className="panel breakdown">
        <div className="between">
          <h2>Referral activity</h2>
          {profile && (
            <button
              className="button quiet small"
              disabled={loading}
              onClick={() => {
                setEarlier([]);
                setCursor("");
                reload();
              }}
            >
              Refresh
            </button>
          )}
        </div>
        {!!rows.length && (
          <>
            <p className="caption">
              Showing {rows.length} sign-ups · {rows.filter((row) => row.funded).length} funded ·{" "}
              {rows.filter((row) => row.active).length} active
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Joined (UTC)</th>
                    <th>Mainnet funding</th>
                    <th>Paid inference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, index) => (
                    <tr key={item.joined + ":" + item.wallet + ":" + index}>
                      <th scope="row">{item.username ? "@" + item.username : item.wallet}</th>
                      <td>{date(item.joined)}</td>
                      <td>{item.funded ? "Funded" : "Pending"}</td>
                      <td>{item.active ? "Active" : "Pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!rows.length && (
          <p className="caption" role="status">
            {!profile
              ? "Sign in to view referrals."
              : loading
                ? "Loading referrals…"
                : "No verified sign-ups yet."}
          </p>
        )}
        {data && !data.isDone && (
          <button
            className="button quiet small"
            disabled={loading}
            onClick={() => {
              setEarlier((items) => [...items, ...data.page]);
              setCursor(data.continueCursor);
            }}
          >
            Load more referrals
          </button>
        )}
        <p className="caption">
          An invite is recorded when a wallet signs in for the first time through your link.
        </p>
      </section>
    </>
  );
}

type ActiveSession = { id: string; created: number; expires: number; current: boolean };

export function SettingsPanel({
  profile,
  refresh,
  preferences,
  change,
}: {
  profile: Profile;
  refresh: () => Promise<void>;
  preferences: Preferences;
  change: (next: Preferences) => void;
}) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sessions = useRemote<ActiveSession[]>(Boolean(profile), "sessions");
  async function signOutOthers() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { removed } = await request<{ removed: number }>("signout-others", {});
      setSigningOut(false);
      sessions.reload();
      setNotice(
        removed
          ? `Signed out ${removed} other session${removed === 1 ? "" : "s"}.`
          : "No other sessions to sign out.",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out other sessions.");
    } finally {
      setBusy(false);
    }
  }
  async function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("profile", { name: fields.get("name"), username: fields.get("username") });
      await refresh();
      setNotice("Profile saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <WorkspaceHeading
        icon={Settings}
        title="Settings"
        description="Edit your profile and choose how this device displays the console."
      />
      <Failure message={error} />
      <p role="status" className={notice ? "status" : "visually-hidden"}>
        {notice}
      </p>
      <section className="panel stack-panel settings-panel">
        <div className="between">
          <h2>Workspace identity</h2>
          <Shield size={20} />
        </div>
        <div className="settings-row">
          <div>
            <strong>Solana wallet</strong>
            <p>{profile ? shorten(profile.wallet) : "Connect a wallet to manage your account."}</p>
          </div>
          {profile && <CopyButton value={profile.wallet} label="Copy address" />}
        </div>
        {profile && (
          <form
            className="settings-row"
            onSubmit={rename}
            key={profile.wallet + profile.name + (profile.username ?? "")}
          >
            <label>
              Display name
              <input name="name" maxLength={60} defaultValue={profile.name} placeholder="Your name" />
            </label>
            <label>
              Username
              <input
                name="username"
                aria-describedby="username-help"
                maxLength={24}
                defaultValue={profile.username ?? ""}
                placeholder="your_username"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span id="username-help" className="caption">
                {usernameHelp} Shown in referral activity.
              </span>
            </label>
            <button className="button quiet" type="submit" disabled={busy}>
              Save profile
            </button>
          </form>
        )}
      </section>
      <section className="panel stack-panel settings-panel">
        <div className="between">
          <h2>Preferences</h2>
          <Code2 size={20} />
        </div>
        <div className="settings-row">
          <div>
            <strong>Appearance</strong>
            <p>Choose the console theme.</p>
          </div>
          <div className="segmented">
            {(["system", "light", "dark"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={preferences.theme === value}
                onClick={() => change({ ...preferences, theme: value })}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>Ambient motion</strong>
            <p>Animate the background and the homepage request trace.</p>
          </div>
          <MotionSwitch />
        </div>
        <div className="settings-row">
          <div>
            <strong>Plain writing</strong>
            <p>Ask the chat model for concise, clear language.</p>
          </div>
          <button
            type="button"
            role="switch"
            className="toggle"
            aria-label="Plain writing"
            aria-checked={preferences.plain}
            onClick={() => change({ ...preferences, plain: !preferences.plain })}
          >
            <span />
          </button>
        </div>
        <div className="settings-row">
          <div>
            <strong>Save on this device</strong>
            <p>Turning this off clears saved Sonnely chats from this browser.</p>
          </div>
          <button
            type="button"
            role="switch"
            className="toggle"
            aria-label="Save on this device"
            aria-checked={preferences.localHistory}
            onClick={() => change({ ...preferences, localHistory: !preferences.localHistory })}
          >
            <span />
          </button>
        </div>
      </section>
      <section className="panel stack-panel settings-panel">
        <div className="between">
          <h2>Active sessions</h2>
          <MonitorSmartphone size={20} />
        </div>
        {profile && sessions.data?.length ? (
          sessions.data.map((item) => (
            <div className="settings-row" key={item.id}>
              <div>
                <strong>{item.current ? "This session" : "Signed in " + date(item.created)}</strong>
                <p>Expires {date(item.expires)} UTC</p>
              </div>
              {item.current && <span className="pill">Current</span>}
            </div>
          ))
        ) : (
          <p className="caption" role="status">
            {!profile
              ? "Connect a wallet to see active sessions."
              : sessions.error
                ? "Active sessions are unavailable."
                : "Loading sessions…"}
          </p>
        )}
        {profile &&
          (sessions.data?.length ?? 0) > 1 &&
          (signingOut ? (
            <div className="settings-row">
              <div>
                <strong>Sign out other sessions?</strong>
                <p>Other devices will need to sign in again.</p>
              </div>
              <div className="actions">
                <button type="button" className="button quiet" disabled={busy} onClick={signOutOthers}>
                  Sign out others
                </button>
                <button
                  type="button"
                  className="button quiet"
                  disabled={busy}
                  onClick={() => setSigningOut(false)}
                >
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <div className="actions">
              <button
                type="button"
                className="button quiet"
                disabled={busy}
                onClick={() => setSigningOut(true)}
              >
                Sign out other sessions
              </button>
            </div>
          ))}
      </section>
      <div className="actions">
        <Link className="button quiet" href="/docs/attestation#data-handling">
          <FileText size={17} /> Data handling
        </Link>
        <Link className="button quiet" href="/contact">
          <CircleHelp size={17} /> Account support
        </Link>
      </div>
    </>
  );
}
