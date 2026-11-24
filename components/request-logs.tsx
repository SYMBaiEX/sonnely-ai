"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, ArrowUpRight, Download, List, RefreshCw, Search, X } from "lucide-react";
import { apiOrigin } from "@/lib/api-contract";
import { creditBalance } from "@/lib/credit-amount";
import { models } from "@/lib/models";
import { providerIds, providerNames } from "@/lib/provider-models";
import { requestLogCsv } from "@/lib/request-log-export";
import { requestLogStatuses, type RequestLogPage, type RequestLogRow } from "@/lib/request-logs";
import { CopyButton } from "./shared";
import { request } from "./wallet";
import { WorkspaceHeading } from "./workspace-heading";
import styles from "./request-logs.module.css";

const defaults = { days: "7", provider: "", model: "", keyName: "", status: "" };
const statusLabels = {
  pending: "In progress",
  complete: "Completed",
  failed: "Failed",
  unreported: "Under review",
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
const modelNames = new Map<string, string>(models.map(({ id, name }) => [id, name]));
const logPath = "/console/logs";
const apiPath = "request-logs?";
const time = (value: number) => formatTime.format(value) + " UTC";
const amount = (value: number | undefined) => value?.toLocaleString("en");
const milliseconds = (value: number | undefined) => (value === undefined ? undefined : amount(value) + " ms");
const logsError = (error: unknown) =>
  error instanceof Error ? error.message : "Could not load request activity.";

function detailPath(id: string) {
  return logPath + "?" + new URLSearchParams({ request: id });
}

function billing(row: RequestLogRow) {
  if (row.status === "failed") return "Released";
  return (row.status === "complete" ? "Charged " : "Reserved ") + creditBalance(row.cost);
}

type DetailValue = string | number | undefined;
function DetailList({ fields }: { fields: [string, DetailValue][] }) {
  return (
    <dl className={styles.details}>
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

function RequestDetail({ id, close }: { id: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [row, setRow] = useState<RequestLogRow>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
    };
  }, []);
  useEffect(() => {
    let active = true;
    void request<RequestLogRow>(apiPath + new URLSearchParams({ id }))
      .then((value) => {
        if (active) setRow(value);
      })
      .catch((cause) => {
        if (active) setError(logsError(cause));
      });
    return () => {
      active = false;
    };
  }, [id, version]);

  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
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
              {statusLabels[row.status]} · {time(row.time)}
            </p>
          )}
        </div>
        <button type="button" className="icon-button" onClick={close} aria-label="Close request details">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.drawerBody}>
        {error ? (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="button quiet"
              onClick={() => {
                setError("");
                setVersion((v) => v + 1);
              }}
            >
              Retry
            </button>
          </>
        ) : !row ? (
          <p role="status" className="caption">
            Loading request details…
          </p>
        ) : (
          <>
            <div className={styles.actions}>
              <CopyButton value={row.id} label="Copy request reference" />
              <CopyButton value={apiOrigin + detailPath(row.id)} label="Copy link to request" />
            </div>
            <h3>Route and status</h3>
            {!!row.providerRejections?.length && (
              <ol className={styles.routeAttempts} aria-label="Provider attempts">
                {row.providerRejections.map((attempt) => (
                  <li key={attempt.provider}>
                    {providerNames[attempt.provider]} · Rate limited (HTTP 429) ·{" "}
                    {milliseconds(attempt.endedAt - attempt.startedAt)}
                  </li>
                ))}
                <li>
                  {providerNames[row.provider]} · {statusLabels[row.status]}
                </li>
              </ol>
            )}
            <DetailList
              fields={[
                ["Request reference", row.id],
                ["Model ID", row.model],
                ["Provider", providerNames[row.provider]],
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
                ["Started", time(row.time)],
                ["Settled", row.settledAt === undefined ? undefined : time(row.settledAt)],
                ["Total duration", milliseconds(row.durationMs)],
                ["Provider duration", milliseconds(row.providerDurationMs)],
                ["Time to first token", milliseconds(row.timeToFirstTokenMs)],
              ]}
            />
            {(row.endpoint === "chat/completions" || !row.endpoint) && (
              <Link className="text-link" href="/verify">
                Inspect a completion receipt <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            )}
            <Link className="text-link" href="/console/support">
              Get help with a request <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </dialog>
  );
}

function LogResults({ scope, wallet }: { scope: string; wallet: string }) {
  const [data, setData] = useState<RequestLogPage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    let current = true;
    void request<RequestLogPage>(apiPath + scope)
      .then((page) => {
        if (!current) return;
        if (page.wallet !== wallet) throw new Error("Your workspace changed. Refresh and try again.");
        setData(page);
      })
      .catch((cause) => {
        if (current) setError(logsError(cause));
      });
    return () => {
      current = false;
      active.current = false;
    };
  }, [scope, wallet, version]);

  async function loadOlder() {
    if (!data?.nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const page = await request<RequestLogPage>(
        apiPath + scope + "&" + new URLSearchParams({ cursor: data.nextCursor }),
      );
      if (!active.current) return;
      if (page.wallet !== wallet) throw new Error("Your workspace changed. Refresh and try again.");
      setData((current) => {
        if (!current) return page;
        const loaded = new Set(current.rows.map(({ id }) => id));
        return { ...page, rows: [...current.rows, ...page.rows.filter(({ id }) => !loaded.has(id))] };
      });
    } catch (cause) {
      if (active.current) setError(logsError(cause));
    } finally {
      if (active.current) setBusy(false);
    }
  }

  function exportRows() {
    if (!data?.rows.length) return;
    const blob = new Blob([requestLogCsv(data.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sonnely-request-logs-" + new Date().toISOString().slice(0, 10) + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={"panel " + styles.log} aria-labelledby="request-log-table-heading">
      <div className="between">
        <h2 id="request-log-table-heading">Request history</h2>
        <button type="button" className="button quiet" disabled={!data?.rows.length} onClick={exportRows}>
          <Download size={16} aria-hidden="true" /> Export loaded CSV
        </button>
      </div>
      <p role="status" className="caption">
        {!data
          ? error
            ? "Request history unavailable."
            : "Loading request history…"
          : data.rows.length
            ? `${data.rows.length} ${data.rows.length === 1 ? "request" : "requests"} loaded`
            : data.nextCursor
              ? "No matches on this page. Load older requests to continue."
              : "No matching requests."}
      </p>
      {error && (
        <div className={styles.actions}>
          <p className="error" role="alert">
            {error}
          </p>
          {!data && (
            <button
              type="button"
              className="button quiet"
              onClick={() => {
                setError("");
                setVersion((v) => v + 1);
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {Boolean(data?.rows.length) && (
        <div
          className="table-wrap workspace-data-table"
          role="region"
          aria-labelledby="request-log-table-heading"
          tabIndex={0}
        >
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
              {data?.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <div className={styles.model}>
                      <Link
                        className="text-link"
                        href={detailPath(row.id)}
                        scroll={false}
                        aria-label={`View ${modelNames.get(row.model) ?? row.model} request ${row.id}`}
                      >
                        {modelNames.get(row.model) ?? row.model}
                      </Link>
                      <span className="caption">{time(row.time)}</span>
                      {row.endpoint && <code className="caption">/{row.endpoint}</code>}
                    </div>
                  </th>
                  <td>{providerNames[row.provider]}</td>
                  <td>
                    <span className={"pill " + styles.status}>{statusLabels[row.status]}</span>
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
      {data?.nextCursor && (
        <div className={styles.pagination}>
          <button type="button" className="button quiet" disabled={busy} onClick={() => void loadOlder()}>
            {busy ? "Loading older requests…" : "Load older requests"}
          </button>
        </div>
      )}
    </section>
  );
}

export function RequestLogs({ wallet }: { wallet?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const requestId = params.get("request");
  const [lookup, setLookup] = useState("");
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const [version, setVersion] = useState(0);
  const scope = new URLSearchParams(Object.entries(applied).filter(([, value]) => value)).toString();

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ ...draft, model: draft.model.trim(), keyName: draft.keyName.trim() });
    setVersion((value) => value + 1);
  }

  return (
    <>
      <WorkspaceHeading
        icon={List}
        title="Request logs"
        description="Find inference requests and review routing, timing, token usage, and charges."
      >
        <Link href="/console/usage" className="button quiet">
          <Activity size={16} aria-hidden="true" /> View usage
        </Link>
      </WorkspaceHeading>
      {!wallet ? (
        <p className="panel empty">Connect a Solana wallet to view your request logs.</p>
      ) : (
        <>
          <section className={"panel " + styles.filters} aria-label="Request log controls">
            <form
              className={styles.lookup}
              onSubmit={(event) => {
                event.preventDefault();
                router.push(detailPath(lookup.trim().toLowerCase()), { scroll: false });
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
            <form className={styles.filtersForm} onSubmit={update}>
              <div className={styles.controls}>
                <label>
                  Date range
                  <select
                    value={draft.days}
                    onChange={(event) => setDraft({ ...draft, days: event.target.value })}
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="all">All time</option>
                  </select>
                </label>
                <label>
                  Provider
                  <select
                    value={draft.provider}
                    onChange={(event) => setDraft({ ...draft, provider: event.target.value })}
                  >
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
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                  >
                    <option value="">All statuses</option>
                    {requestLogStatuses.map((id) => (
                      <option key={id} value={id}>
                        {statusLabels[id]}
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
              <div className={styles.actions}>
                <button className="button accent" type="submit">
                  Apply filters
                </button>
                <button
                  className="button quiet"
                  type="button"
                  onClick={() => {
                    setDraft(defaults);
                    setApplied(defaults);
                    setVersion((value) => value + 1);
                  }}
                >
                  Reset
                </button>
                <button
                  className="button quiet"
                  type="button"
                  onClick={() => setVersion((value) => value + 1)}
                >
                  <RefreshCw size={15} aria-hidden="true" /> Refresh
                </button>
              </div>
            </form>
          </section>
          <LogResults key={scope + ":" + version} scope={scope} wallet={wallet} />
          {requestId && (
            <RequestDetail
              key={requestId}
              id={requestId}
              close={() => router.replace(logPath, { scroll: false })}
            />
          )}
        </>
      )}
    </>
  );
}
