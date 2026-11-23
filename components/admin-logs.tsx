"use client";

import { useState, type FormEvent } from "react";
import { Download, Search } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { shorten } from "@/lib/models";
import { useCrm } from "./admin-crm";

type AuditPage = FunctionReturnType<typeof api.audit.auditTrail>;
type AuditRow = AuditPage["page"][number];

const day = 86_400_000;
const utc = (value: number) => new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC";
const sinceFor = (days: string) => (days === "all" ? 0 : Date.now() - Number(days) * day);
const knownActions = [
  "crm.note",
  "crm.ticket",
  "credit.resolve",
  "finance.openPayout",
  "finance.confirmPayout",
  "finance.savePayoutTransaction",
  "finance.reconcile",
  "invoice.record",
  "operations.alert-test",
];

function exportCsv(rows: AuditRow[]) {
  const cell = (value: unknown) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  const lines = [
    ["time", "actor", "action", "target_kind", "target_id", "summary", "meta"].join(","),
    ...rows.map((row) =>
      [
        new Date(row.time).toISOString(),
        row.actor,
        row.action,
        row.targetKind,
        row.targetId,
        row.summary,
        row.meta === undefined ? "" : JSON.stringify(row.meta),
      ]
        .map(cell)
        .join(","),
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "admin-audit-" + new Date().toISOString().slice(0, 10) + ".csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminLogs() {
  const [filters, setFilters] = useState({ action: "", actor: "", days: "30", since: sinceFor("30") });
  const [trail, setTrail] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const cursor = trail.at(-1);
  const params = new URLSearchParams({ view: "audit" });
  if (filters.action) params.set("action", filters.action);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.since) params.set("since", String(filters.since));
  if (cursor) params.set("cursor", cursor);
  const state = useCrm<AuditPage>("admin-crm?" + params, revision);
  const refresh = () => setRevision((value) => value + 1);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFilters((current) => ({
      ...current,
      action: String(data.get("action") ?? "").trim(),
      actor: String(data.get("actor") ?? "").trim(),
      since: sinceFor(current.days),
    }));
    setTrail([]);
  }

  return (
    <section className="panel stack-panel" aria-labelledby="logs-heading">
      <div className="between">
        <div>
          <h2 id="logs-heading">Audit log</h2>
          <p className="caption">Privileged admin actions recorded across the workspace.</p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button quiet small"
            disabled={!state?.data?.page.length}
            onClick={() => state?.data && exportCsv(state.data.page)}
          >
            <Download size={14} /> Export CSV
          </button>
          <button type="button" className="button quiet small" onClick={refresh}>
            Refresh logs
          </button>
        </div>
      </div>
      <div className="crm-controls">
        <form className="crm-search" onSubmit={apply}>
          <input
            name="action"
            list="audit-actions"
            maxLength={40}
            aria-label="Filter by action"
            placeholder="Action, e.g. crm.note"
          />
          <datalist id="audit-actions">
            {knownActions.map((action) => (
              <option key={action} value={action} />
            ))}
          </datalist>
          <input
            name="actor"
            maxLength={60}
            aria-label="Filter by actor wallet"
            placeholder="Actor wallet"
          />
          <button className="button quiet">
            <Search size={16} /> Filter
          </button>
        </form>
        <select
          aria-label="Time range"
          value={filters.days}
          onChange={(event) => {
            const days = event.target.value;
            setFilters((current) => ({ ...current, days, since: sinceFor(days) }));
            setTrail([]);
          }}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>
      {state?.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : !state?.data ? (
        <p role="status">Loading audit log…</p>
      ) : (
        <>
          {state.data.page.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Time (UTC)</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Target</th>
                    <th scope="col">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.page.map((row) => (
                    <tr key={row.id}>
                      <td>{utc(row.time)}</td>
                      <td>
                        <code title={row.actor}>
                          {row.actor.length > 16 ? shorten(row.actor) : row.actor}
                        </code>
                      </td>
                      <td>
                        <code>{row.action}</code>
                      </td>
                      <td>
                        {row.targetKind}
                        <span className="caption">
                          {" "}
                          · {row.targetId.length > 16 ? shorten(row.targetId) : row.targetId}
                        </span>
                      </td>
                      <td>{row.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="caption">No audit entries match this view.</p>
          )}
          {(trail.length > 0 || !state.data.isDone) && (
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
                onClick={() => {
                  if (state.data) setTrail([...trail, state.data.continueCursor]);
                }}
              >
                Next page
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
