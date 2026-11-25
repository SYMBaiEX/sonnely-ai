// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useEffect, useState } from "react";
import type { FunctionReturnType } from "./convex-server.ts";
import type { api } from "./convex-api.ts";
import { shorten } from "./lib/models.ts";
import { EmptyState, Pill, Skeleton } from "./admin/ui.tsx";
import { CopyButton } from "./shared.tsx";
import { request } from "./wallet";

type Operator = FunctionReturnType<typeof api.operators.directory>[number];
const localTime = (date: number) => new Date(date).toLocaleString();
const roleTone = (role: string): "info" | "ok" | "warn" | "muted" =>
  role === "admin" ? "info" : role === "support" ? "ok" : role === "finance" ? "warn" : "muted";

export function AdminOperators() {
  const [state, setState] = useState<{ data?: Operator[]; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void request<Operator[]>("admin-crm?view=operators")
      .then((data) => {
        if (active) setState({ data });
      })
      .catch((error: Error) => {
        if (active) setState({ error: error.message });
      });
    return () => {
      active = false;
    };
  }, [revision]);

  return (
    <section className="panel stack-panel" aria-labelledby="operators-heading">
      <div className="between">
        <div>
          <h2 id="operators-heading">Operators</h2>
          <p className="caption">Admin, support, and finance wallets for this deployment.</p>
        </div>
        <button
          type="button"
          className="button quiet small"
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh operators
        </button>
      </div>
      {state?.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : !state?.data ? (
        <Skeleton rows={4} />
      ) : state.data.length === 0 ? (
        <EmptyState
          title="No operators configured"
          hint="Add wallets to SONNELY_ADMIN_WALLETS, SONNELY_SUPPORT_WALLETS, or SONNELY_FINANCE_WALLETS."
        />
      ) : (
        <>
          <div className="table-wrap" role="region" aria-labelledby="operators-heading" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Role</th>
                  <th>Last active</th>
                  <th className="num">Open tickets</th>
                  <th className="num">Open tasks</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((row) => (
                  <tr key={row.wallet}>
                    <th scope="row">
                      <span className="cell-copy">
                        <span className="crm-identity" title={row.wallet}>
                          <strong>{row.name || shorten(row.wallet)}</strong>
                          {row.name && <span className="caption">{shorten(row.wallet)}</span>}
                        </span>
                        <CopyButton value={row.wallet} label="Copy operator wallet" />
                      </span>
                    </th>
                    <td>
                      <Pill tone={roleTone(row.role)}>{row.role}</Pill>
                    </td>
                    <td>{row.lastActiveAt === undefined ? "—" : localTime(row.lastActiveAt)}</td>
                    <td className="num">{row.openTickets.toLocaleString()}</td>
                    <td className="num">{row.openTasks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="caption">
            Roles come from the SONNELY_ADMIN_WALLETS, SONNELY_SUPPORT_WALLETS, and SONNELY_FINANCE_WALLETS
            environment lists. Wallets that have not signed in cannot be assigned work yet.
          </p>
        </>
      )}
    </section>
  );
}
