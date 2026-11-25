// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import type { ComputeFeatures } from "./lib/compute-features.ts";

import { usePathname, useRouter } from "./next-navigation.ts";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Landmark,
  LifeBuoy,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { FunctionReturnType } from "./convex-server.ts";
import type { api } from "./convex-api.ts";
import { adminAreas, type AdminArea } from "./admin-areas.ts";
import { AdminBoatCapacity } from "./admin-boat-capacity.tsx";
import { AdminInvoices } from "./admin-gateway.tsx";
import { AdminCrm } from "./admin-crm.tsx";
import { adminNavGroups, adminTabs } from "./admin-tabs.tsx";
import { EmptyState, Pill, Skeleton } from "./admin/ui.tsx";
import { CreditRecovery } from "./credit-recovery.tsx";
import { computePlans } from "./lib/compute.ts";
import { creditBalance } from "./lib/credit-amount.ts";
import { models, shorten } from "./lib/models.ts";
import type { GatewayReport } from "./lib/usagemax-gateway.ts";
import { payWithWallet, request, type Session } from "./wallet";
import { CopyButton } from "./shared.tsx";
import { WorkspaceHeading } from "./workspace-heading.tsx";

type Overview = FunctionReturnType<typeof api.finance.overview> & {
  activation?: FunctionReturnType<typeof api.crm.activation> | null;
  creditRecovery: FunctionReturnType<typeof api.creditRecovery.queue> | null;
  creditLiability: number | null;
  treasuryMicros: number | null;
  compute?: FunctionReturnType<typeof api.compute.adminSummary> | null;
  gateway?: GatewayReport;
};
type FollowUp = FunctionReturnType<typeof api.crmTasks.mine>[number];

function FollowUpsDue({ open }: { open: () => void }) {
  const [state, setState] = useState<{ data?: FollowUp[]; error?: string }>();
  useEffect(() => {
    let active = true;
    void request<FollowUp[]>("admin-crm?view=tasks")
      .then((data) => {
        if (active) setState({ data });
      })
      .catch((error: Error) => {
        if (active) setState({ error: error.message });
      });
    return () => {
      active = false;
    };
  }, []);
  if (!state?.data?.length) return null;
  const now = Date.now();
  const week = now + 7 * 86_400_000;
  const overdue = state.data.filter((row) => row.dueAt !== undefined && row.dueAt < now).length;
  const dueSoon = state.data.filter(
    (row) => row.dueAt !== undefined && row.dueAt >= now && row.dueAt <= week,
  ).length;
  const rows = [...state.data].sort(
    (a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER),
  );
  return (
    <section className="panel stack-panel">
      <h2>Follow-ups due</h2>
      <dl className="admin-metrics">
        <div>
          <dt>Overdue</dt>
          <dd>{overdue.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Next 7 days</dt>
          <dd>{dueSoon.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Open</dt>
          <dd>{state.data.length.toLocaleString()}</dd>
        </div>
      </dl>
      <div className="crm-records">
        {rows.slice(0, 8).map((row) => {
          const late = row.dueAt !== undefined && row.dueAt < now;
          return (
            <div key={row.id} className="crm-record crm-task">
              <span>
                <strong>{row.title}</strong>
                <span className={"caption" + (late ? " crm-overdue" : "")}>
                  {row.name || shorten(row.wallet)} ·{" "}
                  {row.dueAt === undefined ? "No due date" : "Due " + new Date(row.dueAt).toLocaleString()}
                  {late ? " · Overdue" : ""}
                </span>
              </span>
              <button type="button" className="button quiet small" onClick={open}>
                Open customer
              </button>
            </div>
          );
        })}
      </div>
      {state.data.length > 8 && <p className="caption">Showing the 8 most urgent follow-ups.</p>}
    </section>
  );
}

export function Admin({ session, features }: { session: Session | null; features: ComputeFeatures }) {
  const wallet = session?.profile?.wallet;
  const authorized = session?.profile?.role === "admin";
  const [result, setResult] = useState<{ wallet: string; value: Overview }>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const segment = usePathname().split("/")[3];
  const area: AdminArea = (adminAreas as readonly string[]).includes(segment ?? "")
    ? (segment as AdminArea)
    : "overview";
  const choose = useCallback(
    (id: AdminArea) => router.push(id === "overview" ? "/console/admin" : "/console/admin/" + id),
    [router],
  );
  const [badges, setBadges] = useState<{ openTickets: number; overdueTasks: number }>();
  const data = result?.wallet === wallet ? result?.value : undefined;
  const reload = useCallback(async () => {
    if (wallet && authorized) setResult({ wallet, value: await request<Overview>("admin") });
  }, [wallet, authorized]);
  useEffect(() => {
    void reload().catch((failure: Error) => setError(failure.message));
  }, [reload]);
  useEffect(() => {
    if (!authorized) return;
    let active = true;
    void request<{ openTickets: number; overdueTasks: number }>("admin-crm?view=nav-badges")
      .then((value) => {
        if (active) setBadges(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [authorized]);
  const badgeFor = (id: AdminArea) =>
    id === "support" ? badges?.openTickets : id === "overview" ? badges?.overdueTasks : undefined;

  const unsignedPayouts = data?.payouts.filter((payout) => !payout.signature).length ?? 0;
  const heldRequests = data?.creditRecovery?.held.length ?? 0;
  type AttentionItem = {
    Icon: LucideIcon;
    label: string;
    to?: AdminArea;
    run?: () => void;
    anchor?: string;
  };
  const attention: AttentionItem[] = (
    [
      badges?.openTickets
        ? {
            Icon: LifeBuoy,
            label: badges.openTickets + " support request" + (badges.openTickets === 1 ? "" : "s") + " open",
            to: "support" as AdminArea,
          }
        : null,
      badges?.overdueTasks
        ? {
            Icon: CalendarClock,
            label: badges.overdueTasks + " follow-up" + (badges.overdueTasks === 1 ? "" : "s") + " overdue",
            to: "customers" as AdminArea,
          }
        : null,
      unsignedPayouts
        ? {
            Icon: Landmark,
            label:
              unsignedPayouts +
              " payout" +
              (unsignedPayouts === 1 ? "" : "s") +
              " awaiting treasury approval",
            anchor: "admin-payouts",
          }
        : null,
      data?.hasUnreconciled
        ? {
            Icon: RefreshCw,
            label: "Usage records awaiting reconciliation",
            run: () =>
              void act(async () => {
                const { count } = await request<{ count: number }>("admin-reconcile", {});
                return count
                  ? "Reconciled " + count + " requests."
                  : "NEAR has no new finalized cost records yet.";
              }),
          }
        : null,
      heldRequests
        ? {
            Icon: ShieldAlert,
            label: heldRequests + " held request" + (heldRequests === 1 ? "" : "s") + " awaiting resolution",
            anchor: "admin-recovery",
          }
        : null,
    ] as (AttentionItem | null)[]
  ).filter((item): item is AttentionItem => item !== null);

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

  const role = session?.profile?.role;
  if (role === "support" || role === "finance") {
    return (
      <>
        <WorkspaceHeading
          icon={ShieldCheck}
          title={role === "support" ? "Support workspace" : "Finance workspace"}
          description={
            role === "support"
              ? "Review and assign support requests."
              : "Reconcile finalized provider statements."
          }
        />
        {role === "support" ? (
          <AdminCrm view="support" key={wallet} canOpenCustomer={false} />
        ) : (
          <AdminInvoices key={wallet} />
        )}
      </>
    );
  }

  return (
    <>
      <WorkspaceHeading
        icon={ShieldCheck}
        title="Admin"
        description="Manage customers, support, request traces, and treasury operations."
      >
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
      </WorkspaceHeading>
      {!authorized ? (
        <section className="panel stack-panel admin-access">
          <ShieldCheck size={21} aria-hidden="true" />
          <h2>Administrator access required</h2>
          <p>Connect an authorized Solana wallet to view this workspace.</p>
        </section>
      ) : (
        <div className="admin-shell">
          <div className="admin-area-mobile">
            <label htmlFor="admin-area-select" className="caption">
              Section
            </label>
            <select
              id="admin-area-select"
              value={area}
              onChange={(event) => choose(event.target.value as AdminArea)}
            >
              {adminNavGroups.map((group) =>
                group.label ? (
                  <optgroup key={group.label} label={group.label}>
                    {group.tabs.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.label}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  group.tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.label}
                    </option>
                  ))
                ),
              )}
            </select>
          </div>
          <nav className="admin-nav" aria-label="Admin workspace">
            {adminNavGroups.map((group) => (
              <div key={group.label ?? "workspace"} className="admin-nav-set">
                {group.label && <p className="admin-nav-group">{group.label}</p>}
                {group.tabs.map(({ id, label, Icon }) => {
                  const badge = badgeFor(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className="admin-nav-item"
                      aria-current={area === id ? "page" : undefined}
                      onClick={() => choose(id)}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>{label}</span>
                      {badge ? <span className="admin-nav-badge">{badge > 99 ? "99+" : badge}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="admin-content">
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
            {area !== "overview" ? (
              (adminTabs.find((tab) => tab.id === area)?.render?.(wallet ?? "") ?? null)
            ) : !data ? (
              error ? (
                <p className="caption" role="status">
                  Platform activity is unavailable.
                </p>
              ) : (
                <section className="panel stack-panel" aria-label="Loading platform activity">
                  <Skeleton rows={8} />
                </section>
              )
            ) : (
              <div className="admin-overview">
                <dl className="stat-cards">
                  <div>
                    <dt>Requests · 30d</dt>
                    <dd>{data.stats.requests.toLocaleString()}</dd>
                    <dd className="stat-sub">
                      {data.stats.requests
                        ? Math.round((data.stats.complete / data.stats.requests) * 100) + "% completed"
                        : "No traffic yet"}
                    </dd>
                  </div>
                  <div>
                    <dt>Customer spend · 30d</dt>
                    <dd>{creditBalance(data.stats.spendMicros)}</dd>
                    <dd className="stat-sub">
                      {data.stats.input.toLocaleString()} in · {data.stats.output.toLocaleString()} out
                    </dd>
                  </div>
                  <div>
                    <dt>USDC received · 30d</dt>
                    <dd>{creditBalance(data.depositMicros)}</dd>
                    <dd className="stat-sub">{data.deposits.toLocaleString()} deposits</dd>
                  </div>
                  <div>
                    <dt>Active wallets</dt>
                    <dd>{data.activeWallets.toLocaleString()}</dd>
                    <dd className="stat-sub">in 30 days</dd>
                  </div>
                  <div>
                    <dt>New workspaces · 14d</dt>
                    <dd>{data.activation ? data.activation.joined.toLocaleString() : "—"}</dd>
                    <dd className="stat-sub">{data.activation ? data.activation.funded + " funded" : ""}</dd>
                  </div>
                  <div>
                    <dt>Open support</dt>
                    <dd>{badges === undefined ? "—" : badges.openTickets.toLocaleString()}</dd>
                    <dd className="stat-sub">{data.tickets.toLocaleString()} in 30d</dd>
                  </div>
                </dl>
                {attention.length > 0 && (
                  <div className="admin-attention" aria-label="Needs attention">
                    {attention.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="attention-row"
                        disabled={busy}
                        onClick={() => {
                          if (item.to) choose(item.to);
                          else if (item.run) item.run();
                          else if (item.anchor)
                            document
                              .getElementById(item.anchor)
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        <item.Icon size={15} aria-hidden="true" />
                        <span>{item.label}</span>
                        <ArrowRight size={14} aria-hidden="true" className="attention-arrow" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="admin-grid">
                  {data.activation && (
                    <section className="panel stack-panel">
                      <h2>New workspaces · Last 14 days</h2>
                      {data.activation.capped && (
                        <p className="caption">Showing the most recent 200 workspaces.</p>
                      )}
                      <dl className="admin-metrics">
                        {(
                          [
                            ["Wallets signed in", data.activation.joined],
                            ["Terms accepted", data.activation.accepted],
                            ["Setup completed", data.activation.finishedSetup],
                            ["USDC checkout started", data.activation.startedFunding],
                            ["Credits added", data.activation.funded],
                            ["First paid request", data.activation.active],
                          ] as const
                        ).map(([label, count]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{count.toLocaleString()}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}
                  <FollowUpsDue open={() => choose("customers")} />
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
                        <p className="caption">
                          UsageMax reporting is unavailable. Local activity is shown above.
                        </p>
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
                              : "Latest settlement " +
                                new Date(data.gateway.latestSettledAt).toLocaleString() +
                                "."}
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
                      {features["dry-docks"] && <AdminBoatCapacity />}
                      {(["blackboxes", "dry-docks"] as const).map((kind) => {
                        const row = data.compute![kind];
                        return (
                          <div key={kind}>
                            <h3>
                              {computePlans[kind].title}
                              {!features[kind] && " · Coming soon"}
                            </h3>
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
                      {data.compute.truncated && (
                        <p className="caption">Showing totals for the latest 100 runs.</p>
                      )}
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
                      Only reconciled margin is available. Older usage without an upstream billing ID is
                      excluded.
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
                          busy ||
                          !data.finance.availableMicros ||
                          data.payouts.some((payout) => !payout.signature)
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
                    <h2 id="admin-inference-by-model">Inference by model</h2>
                    <div
                      className="table-wrap workspace-data-table"
                      role="region"
                      aria-labelledby="admin-inference-by-model"
                      tabIndex={0}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th className="num">Requests</th>
                            <th className="num">Completed</th>
                            <th className="num">Failed</th>
                            <th className="num">Held</th>
                            <th className="num">Spend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {models.map(({ id, name }) => {
                            const metric = data.models[id];
                            return (
                              <tr key={id}>
                                <th scope="row">{name}</th>
                                <td className="num">{(metric?.requests ?? 0).toLocaleString()}</td>
                                <td className="num">{(metric?.complete ?? 0).toLocaleString()}</td>
                                <td className="num">{(metric?.failed ?? 0).toLocaleString()}</td>
                                <td className="num">{(metric?.held ?? 0).toLocaleString()}</td>
                                <td className="num">{creditBalance(metric?.spendMicros ?? 0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <div id="admin-recovery">
                    <CreditRecovery data={data.creditRecovery} busy={busy} act={act} />
                  </div>
                  <section className="panel stack-panel">
                    <h2 id="admin-payouts">Profit payouts</h2>
                    {data.payouts.length ? (
                      data.payouts.map((payout) => (
                        <div className="admin-payout" key={payout.reference}>
                          <strong title={payout.recipient}>
                            {creditBalance(payout.amount)} USDC to {shorten(payout.recipient)}
                          </strong>{" "}
                          <Pill tone={payout.signature ? "ok" : "warn"}>
                            {payout.signature ? "Finalized" : "Awaiting signature"}
                          </Pill>
                          {payout.signature ? (
                            <a
                              className="text-link"
                              href={"https://explorer.solana.com/tx/" + payout.signature}
                            >
                              Finalized receipt ↗
                            </a>
                          ) : (
                            <>
                              <p className="caption">
                                From {shorten(payout.treasury)} on Solana mainnet. The treasury pays network
                                fees and any token account setup.
                              </p>
                              <span className="cell-copy">
                                <code title={payout.recipient}>{payout.recipient}</code>
                                <CopyButton value={payout.recipient} label="Copy recipient wallet" />
                              </span>
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
                                      return ok
                                        ? "Payout finalized."
                                        : "Waiting for a matching finalized transfer.";
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
                      <EmptyState
                        title="No payouts"
                        hint="Prepared profit payouts awaiting treasury approval will appear here."
                      />
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
