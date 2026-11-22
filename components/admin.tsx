"use client";

import { useCallback, useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { AdminBoatCapacity } from "./admin-boat-capacity";
import { AdminGateway } from "./admin-gateway";
import { AdminCrm, type CrmView } from "./admin-crm";
import { CreditRecovery } from "./credit-recovery";
import { computePlans } from "@/lib/compute";
import { creditBalance } from "@/lib/credit-amount";
import { models, shorten } from "@/lib/models";
import type { GatewayReport } from "@/lib/usagemax-gateway";
import { payWithWallet, request, type Session } from "./wallet";

type Overview = FunctionReturnType<typeof api.finance.overview> & {
  creditRecovery: FunctionReturnType<typeof api.creditRecovery.queue> | null;
  creditLiability: number | null;
  treasuryMicros: number | null;
  compute?: FunctionReturnType<typeof api.compute.adminSummary> | null;
  gateway?: GatewayReport;
};

export function Admin({ session }: { session: Session | null }) {
  const wallet = session?.profile?.wallet;
  const authorized = session?.profile?.role === "admin";
  const [result, setResult] = useState<{ wallet: string; value: Overview }>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState<"overview" | "gateway" | CrmView>("overview");
  const data = result?.wallet === wallet ? result?.value : undefined;
  const reload = useCallback(async () => {
    if (wallet && authorized) setResult({ wallet, value: await request<Overview>("admin") });
  }, [wallet, authorized]);
  useEffect(() => {
    void reload().catch((failure: Error) => setError(failure.message));
  }, [reload]);

  async function act(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The admin action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="console-title section-head">
        <div>
          <h1>Admin</h1>
          <p>Manage customers, support, request traces, and treasury operations.</p>
        </div>
        {authorized && area === "overview" && (
          <button
            type="button"
            className="button quiet"
            disabled={busy}
            onClick={() => void act(async () => "Metrics refreshed.")}
          >
            Refresh
          </button>
        )}
      </header>
      {authorized && (
        <nav className="segmented crm-navigation" aria-label="Admin workspace">
          {(
            [
              ["overview", "Overview"],
              ["customers", "Customers"],
              ["support", "Support"],
              ["traces", "Traces"],
              ["gateway", "Inference ops"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={area === key} onClick={() => setArea(key)}>
              {label}
            </button>
          ))}
        </nav>
      )}
      {area === "overview" && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {area === "overview" && notice && (
        <p className="status" role="status">
          {notice}
        </p>
      )}
      {!authorized ? (
        <section className="panel stack-panel">
          <h2>Administrator access required</h2>
          <p>Connect an authorized Solana wallet to view this workspace.</p>
        </section>
      ) : area === "gateway" ? (
        <AdminGateway key={wallet} />
      ) : area !== "overview" ? (
        <AdminCrm view={area} key={wallet + ":" + area} />
      ) : !data ? (
        <p className="caption" role="status">
          Loading platform activity…
        </p>
      ) : (
        <div className="admin-grid">
          <section className="panel stack-panel">
            <h2>Activity over 30 days</h2>
            <dl className="admin-metrics">
              <div>
                <dt>Requests</dt>
                <dd>{data.stats.requests.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{data.stats.complete.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Failed</dt>
                <dd>{data.stats.failed.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Open reservations</dt>
                <dd>{data.stats.held.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Input tokens</dt>
                <dd>{data.stats.input.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Output tokens</dt>
                <dd>{data.stats.output.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Active wallets</dt>
                <dd>{data.activeWallets.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Support requests</dt>
                <dd>{data.tickets.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Finalized deposits</dt>
                <dd>{data.deposits.toLocaleString()}</dd>
              </div>
              <div>
                <dt>USDC received</dt>
                <dd>{creditBalance(data.depositMicros)}</dd>
              </div>
              <div>
                <dt>Customer inference spend</dt>
                <dd>{creditBalance(data.stats.spendMicros)}</dd>
              </div>
            </dl>
            {data.truncated && (
              <p className="caption">
                Activity is based on the 1,000 newest records of each type in this window.
              </p>
            )}
          </section>
          {data.gateway && data.gateway.state !== "disabled" && (
            <section className="panel stack-panel">
              <h2>UsageMax receipts</h2>
              {data.gateway.state === "unavailable" ? (
                <p className="caption">UsageMax reporting is unavailable. Local activity is shown above.</p>
              ) : (
                <>
                  <dl className="admin-metrics">
                    <div>
                      <dt>Receipts returned</dt>
                      <dd>{data.gateway.count.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Completed</dt>
                      <dd>{data.gateway.completed.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Errors</dt>
                      <dd>{data.gateway.errors.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Cancelled</dt>
                      <dd>{data.gateway.cancelled.toLocaleString()}</dd>
                    </div>
                  </dl>
                  <p className="caption">
                    From {data.gateway.from} through {data.gateway.through} UTC. Refreshed{" "}
                    {new Date(data.gateway.fetchedAt).toLocaleString()}.
                  </p>
                  <p className="caption">
                    {data.gateway.latestSettledAt === null
                      ? "No receipts returned in this window."
                      : "Latest settlement " + new Date(data.gateway.latestSettledAt).toLocaleString() + "."}
                  </p>
                  {data.gateway.truncated && (
                    <p className="caption">
                      Counts cover the returned receipts. More receipts exist in this window.
                    </p>
                  )}
                  {data.gateway.latestReceiptUrl && (
                    <a className="caption" href={data.gateway.latestReceiptUrl}>
                      Open latest receipt in UsageMax
                    </a>
                  )}
                  <p className="caption">Analytics powered by UsageMax</p>
                </>
              )}
            </section>
          )}
          {data.compute && (
            <section className="panel stack-panel">
              <h2>Compute over 30 days</h2>
              <AdminBoatCapacity />
              {(["blackboxes", "dry-docks"] as const).map((kind) => {
                const row = data.compute![kind];
                return (
                  <div key={kind}>
                    <h3>{computePlans[kind].title}</h3>
                    <dl className="admin-metrics">
                      <div>
                        <dt>Runs</dt>
                        <dd>{row.runs}</dd>
                      </div>
                      <div>
                        <dt>Active</dt>
                        <dd>{row.active}</dd>
                      </div>
                      <div>
                        <dt>Pending deletion</dt>
                        <dd>{row.teardown}</dd>
                      </div>
                      {kind === "dry-docks" && (
                        <>
                          <div>
                            <dt>Completed builds</dt>
                            <dd>{row.completed}</dd>
                          </div>
                          <div>
                            <dt>Failed builds</dt>
                            <dd>{row.failed}</dd>
                          </div>
                          <div>
                            <dt>Metered runtime</dt>
                            <dd>{row.meteredSeconds}s</dd>
                          </div>
                          <div>
                            <dt>Cleanup over 2 min</dt>
                            <dd>{row.delayedTeardown}</dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt>Credits held</dt>
                        <dd>{creditBalance(row.held)}</dd>
                      </div>
                      <div>
                        <dt>Customer charges</dt>
                        <dd>{creditBalance(row.charged)}</dd>
                      </div>
                      <div>
                        <dt>Metered base</dt>
                        <dd>{creditBalance(row.base)}</dd>
                      </div>
                      <div>
                        <dt>Platform fees</dt>
                        <dd>{creditBalance(row.fee)}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
              <p className="caption">
                Fees are gross revenue before provider plan charges or invoice adjustments.
              </p>
              {data.compute.truncated && <p className="caption">Showing totals for the latest 100 runs.</p>}
            </section>
          )}
          <section className="panel stack-panel">
            <h2>Treasury</h2>
            <dl className="admin-metrics">
              <div>
                <dt>Finalized treasury USDC</dt>
                <dd>{data.treasuryMicros === null ? "—" : creditBalance(data.treasuryMicros)}</dd>
              </div>
              <div>
                <dt>Credits and open reservations</dt>
                <dd>{data.creditLiability === null ? "—" : creditBalance(data.creditLiability)}</dd>
              </div>
              <div>
                <dt>Reconciled requests</dt>
                <dd>{data.finance.reconciled.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Reconciled charges</dt>
                <dd>{creditBalance(data.finance.customerMicros)}</dd>
              </div>
              <div>
                <dt>Verified NEAR cost</dt>
                <dd>${(data.finance.providerNano / 1e9).toFixed(9).replace(/0{1,7}$/, "")}</dd>
              </div>
              <div>
                <dt>Available margin</dt>
                <dd>{creditBalance(data.finance.availableMicros)}</dd>
              </div>
              <div>
                <dt>Profit paid</dt>
                <dd>{creditBalance(data.finance.paidMicros)}</dd>
              </div>
            </dl>
            <p className="caption">
              Only reconciled margin is available. Older usage without an upstream billing ID is excluded.
            </p>
            <div className="actions">
              <button
                className="button quiet"
                type="button"
                disabled={busy || !data.hasUnreconciled}
                onClick={() =>
                  void act(async () => {
                    const { count } = await request<{ count: number }>("admin-reconcile", {});
                    return count
                      ? "Reconciled " + count + " requests."
                      : "NEAR has no new finalized cost records yet.";
                  })
                }
              >
                Reconcile NEAR costs
              </button>
              <button
                className="button accent"
                type="button"
                disabled={
                  busy || !data.finance.availableMicros || data.payouts.some((payout) => !payout.signature)
                }
                onClick={() =>
                  void act(async () => {
                    await request("admin-open-payout", {});
                    return "Payout prepared for treasury approval.";
                  })
                }
              >
                Prepare profit payout
              </button>
            </div>
            <a className="text-link" href="https://cloud.near.ai/">
              Manage NEAR funding ↗
            </a>
          </section>
          <section className="panel breakdown">
            <h2>Inference by model</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Requests</th>
                    <th>Completed</th>
                    <th>Failed</th>
                    <th>Held</th>
                    <th>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map(({ id, name }) => {
                    const metric = data.models[id];
                    return (
                      <tr key={id}>
                        <th scope="row">{name}</th>
                        <td>{metric?.requests ?? 0}</td>
                        <td>{metric?.complete ?? 0}</td>
                        <td>{metric?.failed ?? 0}</td>
                        <td>{metric?.held ?? 0}</td>
                        <td>{creditBalance(metric?.spendMicros ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <CreditRecovery data={data.creditRecovery} busy={busy} act={act} />
          <section className="panel stack-panel">
            <h2>Profit payouts</h2>
            {data.payouts.length ? (
              data.payouts.map((payout) => (
                <div className="admin-payout" key={payout.reference}>
                  <strong>
                    {creditBalance(payout.amount)} USDC to {shorten(payout.recipient)}
                  </strong>
                  {payout.signature ? (
                    <a className="text-link" href={"https://explorer.solana.com/tx/" + payout.signature}>
                      Finalized receipt ↗
                    </a>
                  ) : (
                    <>
                      <p className="caption">
                        From {shorten(payout.treasury)} on Solana mainnet. The treasury pays network fees and
                        any token account setup.
                      </p>
                      <code>{payout.recipient}</code>
                      <div className="actions">
                        {wallet === payout.treasury && (
                          <button
                            type="button"
                            className="button accent"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await payWithWallet(
                                  wallet,
                                  payout.reference,
                                  payout.cluster,
                                  "admin-payout-transaction",
                                );
                                return "Payout submitted. Check finality before attempting another transfer.";
                              })
                            }
                          >
                            Approve with treasury wallet
                          </button>
                        )}
                        <button
                          type="button"
                          className="button quiet"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              const { ok } = await request<{ ok: boolean }>("admin-confirm-payout", {
                                reference: payout.reference,
                              });
                              return ok ? "Payout finalized." : "Waiting for a matching finalized transfer.";
                            })
                          }
                        >
                          Check finality
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            ) : (
              <p className="caption">No payouts recorded.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
