"use client";

import { useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { shorten } from "@/lib/models";
import { request } from "./wallet";

type Operator = FunctionReturnType<typeof api.operators.directory>[number];
const localTime = (date: number) => new Date(date).toLocaleString();

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
        <p role="status">Loading operators…</p>
      ) : state.data.length === 0 ? (
        <p className="caption">No operator wallets are configured.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Role</th>
                  <th>Last active</th>
                  <th>Open tickets</th>
                  <th>Open tasks</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((row) => (
                  <tr key={row.wallet}>
                    <th scope="row">
                      <span className="crm-identity">
                        <strong>{row.name || shorten(row.wallet)}</strong>
                        {row.name && <span className="caption">{shorten(row.wallet)}</span>}
                      </span>
                    </th>
                    <td>
                      <span className="pill">{row.role}</span>
                    </td>
                    <td>{row.lastActiveAt === undefined ? "—" : localTime(row.lastActiveAt)}</td>
                    <td>{row.openTickets.toLocaleString()}</td>
                    <td>{row.openTasks.toLocaleString()}</td>
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
