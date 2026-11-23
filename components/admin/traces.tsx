"use client";

import { creditBalance } from "@/lib/credit-amount";
import { models } from "@/lib/models";
import { providerNames } from "@/lib/provider-catalog";
import { CopyButton } from "../shared";
import { localTime, outcomes, traceStates, type Trace } from "./shared";

export function TraceList({ rows, open }: { rows: Trace[]; open?: (id: string) => void }) {
  return rows.length ? (
    <div className="crm-records">
      {rows.map((row) => (
        <details key={row.id} className="crm-record">
          <summary>
            <span>
              <strong>{models.find((item) => item.id === row.model)?.name ?? row.model}</strong>
              <span className="caption">
                {localTime(row.started)} · {row.keyName} · {providerNames[row.provider] ?? "NEAR AI"}
              </span>
            </span>
            <span className="crm-state">{traceStates[row.status]}</span>
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
                <dd>${(row.providerReportedCostNano / 1e9).toFixed(9)}</dd>
              </div>
            )}
            <div>
              <dt>Time to settlement</dt>
              <dd>
                {row.settled === undefined ? "—" : ((row.settled - row.started) / 1000).toFixed(2) + " s"}
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
                {row.status === "pending" || row.status === "unreported" ? "Held credit" : "Customer charge"}
              </dt>
              <dd>{creditBalance(row.cost)}</dd>
            </div>
            <div>
              <dt>Reconciled provider cost</dt>
              <dd>
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
  ) : (
    <p className="caption">No request traces match this view.</p>
  );
}
