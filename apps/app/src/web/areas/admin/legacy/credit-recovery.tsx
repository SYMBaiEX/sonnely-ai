// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useState } from "react";
import type { FunctionReturnType } from "./convex-server.ts";
import type { api } from "./convex-api.ts";
import { creditBalance, parseCreditAmount } from "./lib/credit-amount.ts";
import { models, shorten } from "./lib/models.ts";
import { EmptyState, Pill } from "./admin/ui.tsx";
import { CopyButton } from "./shared.tsx";
import { request } from "./wallet";

type Queue = FunctionReturnType<typeof api.creditRecovery.queue>;

export function CreditRecovery({
  data,
  busy,
  act,
}: {
  data: Queue | null;
  busy: boolean;
  act: (action: () => Promise<string>) => Promise<void>;
}) {
  const [selected, select] = useState("");
  const row = data?.held.find(({ id }) => id === selected);
  return (
    <section className="panel stack-panel">
      <h2 id="credit-recovery-heading">Held credits</h2>
      <p className="caption">
        Review the provider record before resolving a reservation. In-flight requests appear here after five
        minutes.
      </p>
      {!data ? (
        <EmptyState
          title="Recovery queue unavailable"
          hint="Refresh the admin overview to retry fetching held credits."
        />
      ) : data.held.length ? (
        <div
          className="table-wrap"
          role="region"
          aria-labelledby="credit-recovery-heading"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Model</th>
                <th>Received</th>
                <th className="num">Held</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {data.held.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="cell-copy">
                      <code title={item.wallet}>{shorten(item.wallet)}</code>
                      <CopyButton value={item.wallet} label="Copy wallet" />
                    </span>
                  </td>
                  <th scope="row">{models.find(({ id }) => id === item.model)?.name ?? item.model}</th>
                  <td>{new Date(item.created).toLocaleString()}</td>
                  <td className="num">{creditBalance(item.cost)}</td>
                  <td>
                    <button
                      type="button"
                      className="button quiet small"
                      aria-expanded={selected === item.id}
                      onClick={() => select(selected === item.id ? "" : item.id)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No held credits"
          hint="In-flight requests appear here after five minutes when a reservation needs review."
        />
      )}
      {row && (
        <form
          className="recovery-form"
          key={row.id}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const resolution = form.get("resolution") === "settle" ? "settle" : "release";
            const charged = resolution === "release" ? 0 : parseCreditAmount(String(form.get("charge")));
            void act(async () => {
              if (charged === null || charged > row.cost)
                throw new Error("Enter a positive USDC amount up to " + creditBalance(row.cost) + ".");
              await request("admin-resolve-credit", {
                id: row.id,
                resolution,
                charged,
                evidence: form.get("evidence"),
              });
              select("");
              return resolution === "release"
                ? "Credits returned to the account."
                : "Final charge recorded and remaining credits returned.";
            });
          }}
        >
          <p className="caption">
            Request <code title={row.id}>{row.id}</code>{" "}
            <CopyButton value={row.id} label="Copy request ID" />{" "}
            <Pill tone={row.status === "pending" ? "warn" : "muted"}>{row.status}</Pill>
          </p>
          {row.providerRequest && (
            <p className="caption">
              NEAR request <code title={row.providerRequest}>{row.providerRequest}</code>{" "}
              <CopyButton value={row.providerRequest} label="Copy provider request ID" />
            </p>
          )}
          <label>
            Resolution
            <select name="resolution">
              <option value="release">Release the full reservation</option>
              <option value="settle">Record the final charge and release the remainder</option>
            </select>
          </label>
          <label>
            Final charge in USDC, if settling
            <input name="charge" type="text" inputMode="decimal" maxLength={24} placeholder="0.000001" />
          </label>
          <label>
            Provider receipt or investigation note
            <textarea name="evidence" rows={3} minLength={8} maxLength={500} required />
          </label>
          <button type="submit" className="button accent" disabled={busy}>
            Confirm resolution
          </button>
        </form>
      )}
      {!!data?.recent.length && (
        <details>
          <summary>Recent credit resolutions</summary>
          <ul>
            {data.recent.map((item) => (
              <li key={item.id}>
                <p>
                  {new Date(item.created).toLocaleString()} · {shorten(item.admin)} ·{" "}
                  <Pill tone={item.resolution === "release" ? "info" : "ok"}>
                    {item.resolution === "release" ? "Released" : "Settled"}
                  </Pill>{" "}
                  {creditBalance(item.held)} held · {creditBalance(item.charged)} charged
                </p>
                <p className="caption">
                  <code>{item.usage}</code> · {item.evidence}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
