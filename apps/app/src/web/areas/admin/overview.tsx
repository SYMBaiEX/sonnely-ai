// spec/app/admin/index.md: the operations overview — what needs action first, then the
// work queues, then the passive analytics an operator consults once the queue is clear.
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Landmark,
  LifeBuoy,
  RefreshCw,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { creditBalance } from "../console/bits.tsx";
import { EmptyState, Pill, Skeleton } from "./legacy/admin/ui.tsx";
import { CreditRecovery } from "./legacy/credit-recovery.tsx";
import { models, shorten } from "./legacy/lib/models.ts";
import { payWithWallet, request } from "./legacy/wallet.tsx";
import { CopyButton } from "./legacy/shared.tsx";

type ModelMetric = {
  requests: number;
  complete: number;
  failed: number;
  held: number;
  spendMicros: number;
};

type FollowUp = {
  id: string;
  title: string;
  name: string;
  wallet: string;
  dueAt?: number;
};

type Payout = {
  reference: string;
  recipient: string;
  treasury: string;
  cluster: "mainnet";
  amount: number;
  signature?: string;
};

export type AdminOverviewData = {
  stats: {
    requests: number;
    complete: number;
    failed: number;
    held: number;
    input: number;
    output: number;
    spendMicros: number;
  };
  deposits: number;
  depositMicros: number;
  activeWallets: number;
  tickets: number;
  activation: {
    joined: number;
    accepted: number;
    finishedSetup: number;
    startedFunding: number;
    funded: number;
    active: number;
    capped: boolean;
  } | null;
  creditRecovery: React.ComponentProps<typeof CreditRecovery>["data"];
  creditLiability: number | null;
  treasuryMicros: number | null;
  gateway?: {
    state: "ready" | "unavailable" | "disabled";
    count: number;
    completed: number;
    errors: number;
    cancelled: number;
    from: string;
    through: string;
    fetchedAt: number;
    latestSettledAt: number | null;
    truncated: boolean;
    latestReceiptUrl?: string;
  };
  payouts: Payout[];
  finance: {
    reconciled: number;
    customerMicros: number;
    providerNano: number;
    availableMicros: number;
    paidMicros: number;
  };
  models: Record<string, ModelMetric | undefined>;
  truncated: boolean;
  hasUnreconciled: boolean;
};

export type NavBadges = { openTickets: number; overdueTasks: number };

export function useNavBadges(authorized: boolean) {
  const [badges, setBadges] = useState<NavBadges>();
  useEffect(() => {
    if (!authorized) return;
    let active = true;
    void request<NavBadges>("admin-crm?view=nav-badges")
      .then((value) => {
        if (active) setBadges(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [authorized]);
  return badges;
}

function FollowUpsDue() {
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
              <a className="button quiet small" href="/console/admin/customers">
                Open customers
              </a>
            </div>
          );
        })}
      </div>
      {state.data.length > 8 && <p className="caption">Showing the 8 most urgent follow-ups.</p>}
    </section>
  );
}

type AttentionItem = {
  Icon: LucideIcon;
  label: string;
  href?: string;
  run?: () => void;
  anchor?: string;
};

function metricRows(data: AdminOverviewData) {
  const rows = models.map(({ id, name }) => ({ id, name, metric: data.models[id] }));
  const active = rows.filter(
    ({ metric }) =>
      metric && (metric.requests > 0 || metric.complete > 0 || metric.failed > 0 || metric.held > 0 || metric.spendMicros > 0),
  );
  const extra = rows.filter((row) => !active.includes(row));
  return { active, extra };
}

function ModelTable({ rows, labelledBy }: { rows: ReturnType<typeof metricRows>["active"]; labelledBy: string }) {
  return (
    <div className="table-wrap workspace-data-table" role="region" aria-labelledby={labelledBy} tabIndex={0}>
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
          {rows.map(({ id, name, metric }) => (
            <tr key={id}>
              <th scope="row">{name}</th>
              <td className="num">{(metric?.requests ?? 0).toLocaleString()}</td>
              <td className="num">{(metric?.complete ?? 0).toLocaleString()}</td>
              <td className="num">{(metric?.failed ?? 0).toLocaleString()}</td>
              <td className="num">{(metric?.held ?? 0).toLocaleString()}</td>
              <td className="num">{creditBalance(metric?.spendMicros ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminOverview({ wallet, badges }: { wallet: string; badges: NavBadges | undefined }) {
  const [data, setData] = useState<AdminOverviewData>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setData(await request<AdminOverviewData>("admin"));
  }, []);
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

  if (!data) {
    return error ? (
      <p className="caption" role="status">
        Platform activity is unavailable.
      </p>
    ) : (
      <section className="panel stack-panel" aria-label="Loading platform activity">
        <Skeleton rows={8} />
      </section>
    );
  }

  const unsignedPayouts = data.payouts.filter((payout) => !payout.signature).length;
  const heldRequests = data.creditRecovery?.held.length ?? 0;
  const attention: AttentionItem[] = (
    [
      badges?.openTickets
        ? {
            Icon: LifeBuoy,
            label: badges.openTickets + " support request" + (badges.openTickets === 1 ? "" : "s") + " open",
            href: "/console/admin/support",
          }
        : null,
      badges?.overdueTasks
        ? {
            Icon: CalendarClock,
            label: badges.overdueTasks + " follow-up" + (badges.overdueTasks === 1 ? "" : "s") + " overdue",
            href: "/console/admin/customers",
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
      data.hasUnreconciled
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

  const inference = metricRows(data);

  return (
    <div className="admin-overview">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="status" role="status">
          {notice}
        </p>
      )}
      {attention.length > 0 && (
        <div className="admin-attention" aria-label="Needs attention">
          {attention.map((item) =>
            item.href ? (
              <a key={item.label} className="attention-row" href={item.href}>
                <item.Icon size={15} aria-hidden="true" />
                <span>{item.label}</span>
                <ArrowRight size={14} aria-hidden="true" className="attention-arrow" />
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                className="attention-row"
                disabled={busy}
                onClick={() => {
                  if (item.run) item.run();
                  else if (item.anchor)
                    document.getElementById(item.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <item.Icon size={15} aria-hidden="true" />
                <span>{item.label}</span>
                <ArrowRight size={14} aria-hidden="true" className="attention-arrow" />
              </button>
            ),
          )}
        </div>
      )}
      {attention.length === 0 && (
        <p className="status admin-clear" role="status">
          Nothing needs action right now. Support, follow-ups, payouts, and held credits are clear.
        </p>
      )}
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
      <div className="admin-grid admin-queues">
        <FollowUpsDue />
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
                  <a className="text-link" href={"https://explorer.solana.com/tx/" + payout.signature}>
                    Finalized receipt <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                ) : (
                  <>
                    <p className="caption">
                      From {shorten(payout.treasury)} on Solana mainnet. The treasury pays network fees and any
                      token account setup.
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
                              await payWithWallet();
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
            <EmptyState
              title="No payouts"
              hint="Prepared profit payouts awaiting treasury approval will appear here."
            />
          )}
        </section>
      </div>
      <div className="admin-grid">
        {data.activation && (
          <section className="panel stack-panel">
            <h2>New workspaces · Last 14 days</h2>
            {data.activation.capped && <p className="caption">Showing the most recent 200 workspaces.</p>}
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
            <p className="caption">Activity is based on the 1,000 newest records of each type in this window.</p>
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
                  <p className="caption">Counts cover the returned receipts. More receipts exist in this window.</p>
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
              disabled={busy || !data.finance.availableMicros || data.payouts.some((payout) => !payout.signature)}
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
            Manage NEAR funding <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </section>
        <section className="panel breakdown">
          <h2 id="admin-inference-by-model">Inference by model</h2>
          {inference.active.length ? (
            <ModelTable rows={inference.active} labelledBy="admin-inference-by-model" />
          ) : (
            <EmptyState
              title="No inference traffic"
              hint="Models with requests, failures, held credit, or spend in this window will appear here."
            />
          )}
          {inference.extra.length > 0 && inference.active.length > 0 && (
            <details className="admin-zero-rows">
              <summary className="caption">
                {inference.extra.length} model{inference.extra.length === 1 ? "" : "s"} with no traffic
              </summary>
              <ModelTable rows={inference.extra} labelledBy="admin-inference-by-model" />
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
