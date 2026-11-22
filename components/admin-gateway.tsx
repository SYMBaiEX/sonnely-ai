"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowUpRight } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { invoiceProviders } from "@/lib/provider-invoice";
import type { GatewayReceipt } from "@/lib/usagemax-gateway";
import type { GatewayMetrics, GatewayOperations } from "@/lib/usagemax-operations";
import { request } from "./wallet";
import styles from "./admin-gateway.module.css";

type Invoice = FunctionReturnType<typeof api.providerInvoices.history>[number];
type InvoiceLine = Invoice["lines"][number];
type Report = {
  operations: GatewayOperations | null;
  delivery: FunctionReturnType<typeof api.usageMaxOutbox.adminHealth>;
  invoices: Invoice[];
};

const day = 86_400_000;
const number = new Intl.NumberFormat("en-US");
const providerName: Record<string, string> = { "near-ai": "NEAR AI", phala: "Phala", tinfoil: "Tinfoil" };
const spanName = {
  request: "Gateway request",
  reservation: "Reserve credits",
  provider: "Provider attempt",
  verification: "Verify provider evidence",
  settlement: "Write settlement",
  recovery: "Resolve reservation",
};
const receiptStatus = { ok: "Complete", error: "Error", cancelled: "Cancelled" };
const invoiceState = {
  exact: "Exact match",
  variance: "Cost variance",
  new: "New cost",
  unmatched: "Unmatched",
  previously_invoiced: "Already invoiced",
};

function usd(value: string | number | null) {
  if (value === null) return "—";
  const amount = BigInt(value);
  const size = amount < BigInt(0) ? -amount : amount;
  const units = size / BigInt(1e9);
  const fraction = String(size % BigInt(1e9))
    .padStart(9, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return (amount < BigInt(0) ? "−" : "") + "$" + number.format(units) + "." + fraction;
}

const ms = (value: number | undefined) => (value === undefined ? "—" : number.format(value) + " ms");
const utc = (value: number) => new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC";
const label = (key: string) => providerName[key] ?? key;

function MetricsTable({ rows }: { rows: GatewayMetrics[] }) {
  if (!rows.length) return <p className="caption">No requests in this range.</p>;
  return (
    <div className="table-wrap">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Requests</th>
            <th scope="col">Errors</th>
            <th scope="col">Attempts</th>
            <th scope="col">Input / output</th>
            <th scope="col">Latency p50 / p95 / p99</th>
            <th scope="col">P95 provider</th>
            <th scope="col">P95 first token</th>
            <th scope="col">Charges</th>
            <th scope="col">Known cost</th>
            <th scope="col">Covered margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{label(row.key)}</th>
              <td>{number.format(row.requests)}</td>
              <td>{number.format(row.errors)}</td>
              <td>{number.format(row.providerAttempts)}</td>
              <td
                title={`${number.format(row.cachedTokens)} cached and ${number.format(row.reasoningTokens)} reasoning tokens`}
              >
                {number.format(row.inputTokens)} / {number.format(row.outputTokens)}
              </td>
              <td title={row.latency ? row.latency.samples + " samples" : undefined}>
                {row.latency
                  ? [row.latency.p50, row.latency.p95, row.latency.p99]
                      .map((value) => number.format(value))
                      .join(" / ") + " ms"
                  : "—"}
              </td>
              <td>{ms(row.providerLatency?.p95)}</td>
              <td>{ms(row.firstToken?.p95)}</td>
              <td>{usd(row.customerChargeNanos)}</td>
              <td>{row.costCovered ? usd(row.knownProviderCostNanos) : "—"}</td>
              <td>{row.marginCovered ? usd(row.coveredMarginNanos) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trace({ receipt }: { receipt: GatewayReceipt }) {
  const root = receipt.trace?.spans[0];
  const depths = new Map<string, number>();
  return (
    <div className={styles.trace}>
      <div className="section-head">
        <div>
          <h3>
            {label(receipt.provider)} · {receipt.model}
          </h3>
          <p className="caption">
            {receiptStatus[receipt.status]} · Revision {receipt.revision} · {utc(receipt.settledAt)}
          </p>
        </div>
        <span className={styles.pill}>
          {receipt.trace?.billingStatus === "pending" ? "Billing pending" : "Settled"}
        </span>
      </div>
      <dl className="admin-metrics">
        <div>
          <dt>Charge</dt>
          <dd>{usd(receipt.customerChargeNanos)}</dd>
        </div>
        <div>
          <dt>Provider cost</dt>
          <dd>{usd(receipt.providerCostNanos)}</dd>
        </div>
        <div>
          <dt>First token</dt>
          <dd>
            {ms(
              receipt.firstTokenAt !== undefined && receipt.startedAt !== undefined
                ? receipt.firstTokenAt - receipt.startedAt
                : undefined,
            )}
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd className={styles.evidence}>{receipt.providerCostBasis.replaceAll("_", " ")}</dd>
        </div>
      </dl>
      <p className={styles.identifiers}>
        Request <code>{receipt.requestId}</code>
        {receipt.traceId && (
          <>
            {" "}
            · Trace <code>{receipt.traceId}</code>
          </>
        )}
      </p>
      {root && receipt.trace ? (
        <ol className={styles.spans} aria-label="Trace spans">
          {receipt.trace.spans.map((span) => {
            const depth = span.parentSpanId ? (depths.get(span.parentSpanId) ?? 0) + 1 : 0;
            depths.set(span.spanId, depth);
            const total = Math.max(1, root.endedAt - root.startedAt);
            return (
              <li key={span.spanId} className={styles.span}>
                <div style={{ paddingInlineStart: Math.min(depth, 4) * 10 }}>
                  <strong>{spanName[span.kind]}</strong>
                  <span className="caption">
                    {[
                      span.provider ? label(span.provider) : "",
                      span.model ?? "",
                      span.httpStatus ? "HTTP " + span.httpStatus : "",
                      span.outcome?.replaceAll("_", " ") ?? "",
                      span.status === "error" ? "Error" : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className={styles.timeline} aria-hidden="true">
                  <span
                    className={span.status === "error" ? styles.failed : ""}
                    style={{
                      insetInlineStart: ((span.startedAt - root.startedAt) / total) * 100 + "%",
                      width: ((span.endedAt - span.startedAt) / total) * 100 + "%",
                    }}
                  />
                </div>
                <span
                  className={styles.duration}
                  title={`Started ${ms(span.startedAt - root.startedAt)} into the request`}
                >
                  {ms(span.endedAt - span.startedAt)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="caption">This receipt predates span collection.</p>
      )}
    </div>
  );
}

function InvoiceTable({ lines }: { lines: InvoiceLine[] }) {
  const total = lines.reduce((sum, line) => sum + BigInt(line.costNanos), BigInt(0));
  return (
    <div className="table-wrap">
      <p className="caption">
        {lines.length} lines · {usd(String(total))} statement total
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Billing reference</th>
            <th scope="col">Statement cost</th>
            <th scope="col">Prior cost</th>
            <th scope="col">Match</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.reference}>
              <th scope="row">
                <code>{line.reference}</code>
              </th>
              <td>{usd(line.costNanos)}</td>
              <td>{usd(line.previousCostNanos)}</td>
              <td>
                {invoiceState[line.state]}
                {line.exported === false && " · local only"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Invoices({ invoices, refresh }: { invoices: Invoice[]; refresh: () => void }) {
  const [provider, setProvider] = useState<Invoice["provider"]>("near-ai");
  const [invoiceId, setInvoiceId] = useState("");
  const [rows, setRows] = useState("");
  const [preview, setPreview] = useState<InvoiceLine[]>();
  const [recorded, setRecorded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reset = () => {
    setPreview(undefined);
    setRecorded(false);
    setError("");
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    reset();
    try {
      setPreview(await request<InvoiceLine[]>("admin-invoice-preview", { provider, invoiceId, rows }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Invoice preview failed.");
    } finally {
      setBusy(false);
    }
  }
  async function record(existing?: Invoice) {
    setBusy(true);
    setError("");
    try {
      const payload = existing
        ? {
            provider: existing.provider,
            invoiceId: existing.invoiceId,
            rows: existing.lines
              .map(({ reference, costNanos }) => {
                const cost = BigInt(costNanos);
                return (
                  reference + "," + cost / BigInt(1e9) + "." + String(cost % BigInt(1e9)).padStart(9, "0")
                );
              })
              .join("\n"),
          }
        : { provider, invoiceId, rows };
      setPreview(await request<InvoiceLine[]>("admin-invoice-record", payload));
      setRecorded(true);
      refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Invoice could not be recorded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack-panel">
      <div>
        <h2>Invoice reconciliation</h2>
        <p className="caption">
          Compare a finalized provider statement with Sonnely’s billing references. Recording adds reporting
          evidence and leaves treasury payouts under the existing approval flow.
        </p>
      </div>
      <form onSubmit={submit} className={styles.invoice}>
        <label>
          Provider
          <select
            value={provider}
            disabled={busy}
            onChange={(event) => {
              setProvider(event.target.value as Invoice["provider"]);
              reset();
            }}
          >
            {invoiceProviders.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Invoice ID
          <input
            required
            maxLength={120}
            value={invoiceId}
            disabled={busy}
            onChange={(event) => {
              setInvoiceId(event.target.value);
              reset();
            }}
          />
        </label>
        <label className={styles.invoiceRows}>
          Invoice lines
          <span className="caption">Paste up to 100 lines as billing reference, USD amount.</span>
          <textarea
            required
            spellCheck={false}
            rows={4}
            maxLength={16384}
            value={rows}
            disabled={busy}
            placeholder={"reference,cost_usd\nprovider-request-id,0.000042"}
            onChange={(event) => {
              setRows(event.target.value);
              reset();
            }}
          />
        </label>
        <button className="button quiet" disabled={busy}>
          Preview matches
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className={styles.stack}>
          <InvoiceTable lines={preview} />
          {!recorded && (
            <button type="button" className="button accent" disabled={busy} onClick={() => void record()}>
              Record finalized invoice
            </button>
          )}
          {recorded && (
            <p role="status">Invoice recorded. Eligible receipt revisions are queued for UsageMax.</p>
          )}
        </div>
      )}
      {invoices.length > 0 && (
        <div className={styles.stack}>
          <h3>Recent invoice history</h3>
          {invoices.map((entry) => (
            <details key={entry.provider + ":" + entry.invoiceId}>
              <summary>
                {label(entry.provider)} · {entry.invoiceId} · {entry.lines.length} lines
              </summary>
              <p className="caption">{utc(entry.createdAt)}</p>
              <InvoiceTable lines={entry.lines} />
              {entry.lines.some(({ state }) => state === "unmatched") && (
                <button
                  type="button"
                  className="button quiet"
                  disabled={busy}
                  onClick={() => void record(entry)}
                >
                  Retry unmatched lines
                </button>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

export function AdminGateway() {
  const [days, setDays] = useState(7);
  const [pivot, setPivot] = useState<"providers" | "models" | "daily">("providers");
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [trace, setTrace] = useState<GatewayReceipt>();
  const [traceError, setTraceError] = useState("");
  const [traceLoading, setTraceLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const refreshId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    const now = Date.now();
    const from = new Date(now - (days - 1) * day).toISOString().slice(0, 10);
    const through = new Date(now).toISOString().slice(0, 10);
    try {
      const next = await request<Report>("admin-gateway?" + new URLSearchParams({ from, through }));
      if (id === refreshId.current) {
        setReport(next);
        setError("");
      }
    } catch (failure) {
      if (id === refreshId.current)
        setError(failure instanceof Error ? failure.message : "Gateway report could not be loaded.");
    }
  }, [days]);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    return () => {
      window.clearInterval(interval);
      refreshId.current++;
    };
  }, [refresh]);
  async function openTrace(requestId: string) {
    setSelected(requestId);
    setTrace(undefined);
    setTraceLoading(true);
    setTraceError("");
    try {
      setTrace(await request<GatewayReceipt>("admin-gateway?" + new URLSearchParams({ requestId })));
    } catch (failure) {
      setTraceError(failure instanceof Error ? failure.message : "Trace could not be opened.");
    } finally {
      setTraceLoading(false);
    }
  }
  const operations = report?.operations;
  const totals = operations?.overall;
  const outbox = report?.delivery;
  const delay = outbox?.oldestQueuedAt != null && Date.now() - outbox.oldestQueuedAt > 3 * 60_000;
  return (
    <div className="admin-grid">
      <section className="panel stack-panel">
        <div className="section-head">
          <div>
            <h2>Inference operations</h2>
            <p className="caption">Private UsageMax reporting · UTC</p>
          </div>
          <div className={styles.toolbar}>
            <select
              aria-label="Reporting period"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={1}>Today</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
            <button className="button quiet" type="button" onClick={() => void refresh()}>
              Refresh report
            </button>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!report && !error && <p role="status">Loading inference operations…</p>}
        {report && !operations && (
          <p role="status">
            UsageMax reporting is temporarily unavailable. Invoice history and local delivery status are
            available below.
          </p>
        )}
        {totals && operations && (
          <>
            <dl className="admin-metrics">
              <div>
                <dt>Requests</dt>
                <dd>{number.format(totals.requests)}</dd>
              </div>
              <div>
                <dt>Provider attempts</dt>
                <dd>{number.format(totals.providerAttempts)}</dd>
              </div>
              <div>
                <dt>P95 first token</dt>
                <dd>{ms(totals.firstToken?.p95)}</dd>
              </div>
              <div>
                <dt>Customer charges</dt>
                <dd>{usd(totals.customerChargeNanos)}</dd>
              </div>
              <div>
                <dt>Known provider cost</dt>
                <dd>{totals.costCovered ? usd(totals.knownProviderCostNanos) : "—"}</dd>
              </div>
              <div>
                <dt>Covered margin</dt>
                <dd>{totals.marginCovered ? usd(totals.coveredMarginNanos) : "—"}</dd>
              </div>
            </dl>
            <p className="caption">
              Cost evidence {totals.costCovered}/{totals.requests} · Invoice confirmed{" "}
              {totals.invoiceConfirmed} · Trace coverage {totals.traces}/{totals.requests}. Refreshed{" "}
              {utc(operations.generatedAt)}.
              {operations.latestReceiptAt !== null &&
                " Latest receipt " + utc(operations.latestReceiptAt) + "."}
            </p>
            {operations.truncated && (
              <p className="caption">
                Report covers the latest {number.format(operations.limit)} receipts. Choose a shorter period
                for tighter coverage.
              </p>
            )}
            {operations.groupsTruncated && (
              <p className="caption">Provider and model tables show up to 100 groups each.</p>
            )}
            {Date.parse(operations.from) < operations.retainedFromAt && (
              <p className="caption">Retention limits coverage before {utc(operations.retainedFromAt)}.</p>
            )}
            <div className="segmented" aria-label="Analytics grouping">
              {(["providers", "models", "daily"] as const).map((item) => (
                <button type="button" key={item} aria-pressed={pivot === item} onClick={() => setPivot(item)}>
                  {item === "daily" ? "Daily" : item === "providers" ? "Providers" : "Models"}
                </button>
              ))}
            </div>
            <MetricsTable rows={operations[pivot]} />
          </>
        )}
      </section>
      <section className="panel stack-panel">
        <div className="section-head">
          <h2>Operational alerts</h2>
          <Activity aria-hidden="true" size={18} />
        </div>
        {outbox && (
          <p className="caption">
            Receipt delivery · {outbox.queued} queued · {outbox.failed} failed
            {outbox.truncated && " · Counts capped at 500 per state"}
          </p>
        )}
        {outbox && (outbox.failed > 0 || delay) && (
          <p className="error" role="alert">
            UsageMax receipt delivery needs attention.
          </p>
        )}
        {operations?.alerts.evaluatedAt != null && (
          <p className="caption">Last evaluated {utc(operations.alerts.evaluatedAt)}.</p>
        )}
        {operations?.alerts.evaluatedAt === null && (
          <p className="caption">Waiting for the first scheduled evaluation.</p>
        )}
        {operations?.alerts.truncated && (
          <p className="caption">Alert evaluation or history reached its reporting limit.</p>
        )}
        {operations?.alerts.evaluatedAt != null && !operations.alerts.items.length && (
          <p>No gateway alerts.</p>
        )}
        {operations?.alerts.items.map((item) => (
          <div className={styles.alert} key={item.key + ":" + item.openedAt}>
            <div>
              <strong>{label(item.provider)}</strong>
              <p className="caption">
                {item.rule === "provider_errors"
                  ? `${item.observed}% provider attempt errors across ${item.samples} attempts`
                  : item.rule === "slow_provider"
                    ? `P95 provider latency ${ms(item.observed)} across ${item.samples} attempts`
                    : `${item.observed} requests pending billing recovery`}
              </p>
            </div>
            <span className={styles.pill}>{item.resolvedAt ? "Resolved" : "Open"}</span>
          </div>
        ))}
      </section>
      <section className="panel stack-panel">
        <div>
          <h2>Request traces</h2>
          <p className="caption">Open a recent receipt or enter an opaque UsageMax request ID.</p>
        </div>
        <form
          className={styles.toolbar}
          onSubmit={(event) => {
            event.preventDefault();
            void openTrace(query.trim());
          }}
        >
          <input
            aria-label="UsageMax request ID"
            placeholder="Request ID"
            value={query}
            maxLength={120}
            required
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="button quiet" disabled={traceLoading}>
            Find trace
          </button>
        </form>
        {operations?.recent.length ? (
          <div className={styles.recent}>
            {operations.recent.map((row) => (
              <button
                key={row.requestId}
                type="button"
                disabled={traceLoading}
                aria-pressed={selected === row.requestId}
                onClick={() => void openTrace(row.requestId)}
                className={styles.recentRow}
              >
                <span>
                  <strong>{label(row.provider)}</strong> <span className="caption">{row.model}</span>
                </span>
                <span className={styles.recentStatus}>
                  {receiptStatus[row.status]} · {row.hasTrace ? "Trace" : "Receipt"}{" "}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {traceLoading && <p role="status">Loading trace…</p>}
        {traceError && (
          <p className="error" role="alert">
            {traceError}
          </p>
        )}
        {trace && <Trace receipt={trace} />}
      </section>
      {report && <Invoices invoices={report.invoices} refresh={() => void refresh()} />}
    </div>
  );
}
