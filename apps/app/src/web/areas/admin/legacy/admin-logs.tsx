// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useState, type FormEvent } from "react";
import { Download, Search } from "lucide-react";
import type { FunctionReturnType } from "./convex-server.ts";
import type { api } from "./convex-api.ts";
import { shorten } from "./lib/models.ts";
import { useCrm } from "./admin-crm.tsx";
import { EmptyState, Pill, Skeleton } from "./admin/ui.tsx";
import { CopyButton } from "./shared.tsx";

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
const actionTone = (action: string): "info" | "warn" | "muted" => {
  if (action.startsWith("crm.")) return "info";
  if (/^(credit|finance|invoice)\./.test(action)) return "warn";
  return "muted";
};

const actionNames: Record<string, string> = {
  "crm.note": "Note added",
  "crm.ticket": "Support request updated",
  "credit.resolve": "Held credit resolved",
  "finance.openPayout": "Profit payout prepared",
  "finance.confirmPayout": "Payout finality checked",
  "finance.savePayoutTransaction": "Payout transaction saved",
  "finance.reconcile": "Provider costs reconciled",
  "invoice.record": "Provider invoice recorded",
  "operations.alert-test": "Test alert sent",
};

function actionLabel(action: string) {
  if (actionNames[action]) return actionNames[action];
  const tail = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  const words = tail.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll(/[-_]/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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
        <Skeleton rows={8} />
      ) : (
        <>
          {state.data.page.length ? (
            <div
              className="table-wrap"
              role="region"
              aria-labelledby="logs-heading"
              tabIndex={0}
            >
              <table data-cards>
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
                      <td data-label="Time (UTC)">{utc(row.time)}</td>
                      <td data-label="Actor">
                        <span className="cell-copy">
                          <code title={row.actor}>
                            {row.actor.length > 16 ? shorten(row.actor) : row.actor}
                          </code>
                          <CopyButton value={row.actor} label="Copy actor" />
                        </span>
                      </td>
                      <td data-label="Action">
                        <Pill tone={actionTone(row.action)}>
                          <span title={row.action}>{actionLabel(row.action)}</span>
                        </Pill>
                      </td>
                      <td data-label="Target">
                        <span className="cell-copy">
                          <Pill>{row.targetKind}</Pill>
                          <code className="caption" title={row.targetId}>
                            {row.targetId.length > 16 ? shorten(row.targetId) : row.targetId}
                          </code>
                          <CopyButton value={row.targetId} label="Copy target ID" />
                        </span>
                      </td>
                      <td data-label="Summary">{row.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No audit entries"
              hint="Widen the time range or clear the action and actor filters to see more."
            />
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
