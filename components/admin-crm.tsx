"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { creditBalance, parseCreditAmount } from "@/lib/credit-amount";
import { models, shorten } from "@/lib/models";
import { providerNames } from "@/lib/provider-catalog";
import { CopyButton } from "./shared";
import { request } from "./wallet";

export type CrmView = "customers" | "support" | "traces";
type Customer = FunctionReturnType<typeof api.crm.customers>["page"][number];
type CustomerDetail = NonNullable<FunctionReturnType<typeof api.crm.customer>>;
type Ticket = FunctionReturnType<typeof api.crm.tickets>["page"][number];
type Trace = FunctionReturnType<typeof api.crm.traces>["page"][number];
type OperatorOption = FunctionReturnType<typeof api.operators.operators>[number];
type CrmPage = { page: (Customer | Ticket | Trace)[]; isDone: boolean; continueCursor: string };

const localTime = (date: number) => new Date(date).toLocaleString();
const ticketStates = { open: "Open", in_progress: "In progress", resolved: "Resolved" } as const;
const traceStates = {
  pending: "Pending",
  complete: "Completed",
  failed: "Failed",
  unreported: "Unreported",
} as const;
const outcomes: Record<string, string> = {
  complete: "Completed",
  upstream_http: "Provider HTTP error",
  upstream_transport: "Provider transport error",
  invalid_usage: "Invalid provider response",
  stream_incomplete: "Stream ended without terminal usage",
  phala_unavailable: "Phala receipt unavailable",
  phala_payload_mismatch: "Phala receipt payload mismatch",
  phala_route_mismatch: "Phala serving route mismatch",
};

function useCrm<T>(route: string, revision: number) {
  const [state, setState] = useState<{ route: string; revision: number; data?: T; error?: string }>();
  useEffect(() => {
    let active = true;
    void request<T>(route)
      .then((data) => {
        if (active) setState({ route, revision, data });
      })
      .catch((error: Error) => {
        if (active) setState({ route, revision, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [route, revision]);
  return state?.route === route && state.revision === revision ? state : undefined;
}

function Identity({ customer }: { customer: Customer }) {
  return (
    <span className="crm-identity">
      <strong>
        {customer.name || (customer.username ? "@" + customer.username : shorten(customer.wallet))}
      </strong>
      <span className="caption">
        {customer.name && customer.username ? "@" + customer.username + " · " : ""}
        {shorten(customer.wallet)}
      </span>
    </span>
  );
}

function TraceList({ rows, open }: { rows: Trace[]; open?: (id: string) => void }) {
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

function TicketList({
  rows,
  open,
  refresh,
}: {
  rows: Ticket[];
  open?: (id: string) => void;
  refresh: () => void;
}) {
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const directory = useCrm<OperatorOption[]>("admin-crm?view=operator-list", 0);
  const assignable = (directory?.data ?? []).filter((operator) => operator.id !== undefined);
  async function update(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const selection = String(fields.get("assignment") ?? "keep");
    setSaving(id);
    setFailure("");
    setNotice("");
    try {
      await request("admin-ticket", {
        id,
        state: fields.get("state"),
        ...(selection.startsWith("assign:")
          ? { assignment: "assign", assignTo: selection.slice(7) }
          : { assignment: selection }),
      });
      setNotice("Support request updated.");
      refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not update the support request.");
    } finally {
      setSaving("");
    }
  }

  return (
    <>
      {failure && (
        <p role="alert" className="error">
          {failure}
        </p>
      )}
      {notice && (
        <p role="status" className="status">
          {notice}
        </p>
      )}
      {rows.length ? (
        <div className="crm-records">
          {rows.map((row) => (
            <details key={row.id} className="crm-record">
              <summary>
                <span>
                  <strong>{row.topic}</strong>
                  <span className="caption">
                    {localTime(row.opened)} · {row.email}
                  </span>
                </span>
                <span className="crm-state">{ticketStates[row.state]}</span>
              </summary>
              <p className="crm-note">{row.message}</p>
              <p className="caption">
                {row.assignedWallet ? "Assigned to " + shorten(row.assignedWallet) : "Unassigned"}
              </p>
              <form
                className="crm-controls"
                onSubmit={(event) => void update(event, row.id)}
                key={row.updated ?? row.opened}
              >
                <label>
                  Status
                  <select name="state" defaultValue={row.state}>
                    {Object.entries(ticketStates).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Assignment
                  <select name="assignment" defaultValue="keep">
                    <option value="keep">Keep assignment</option>
                    <option value="claim">Assign to me</option>
                    <option value="unassign">Unassign</option>
                    {assignable.map((operator) => (
                      <option key={operator.id} value={"assign:" + operator.id}>
                        Assign to {operator.name || shorten(operator.wallet)}
                        {operator.name ? " · " + shorten(operator.wallet) : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button quiet" disabled={Boolean(saving)}>
                  {saving === row.id ? "Saving…" : "Save request"}
                </button>
                {open && (
                  <button type="button" className="button quiet" onClick={() => open(row.account)}>
                    Open customer
                  </button>
                )}
              </form>
            </details>
          ))}
        </div>
      ) : (
        <p className="caption">No support requests match this view.</p>
      )}
    </>
  );
}

type PendingAction = { kind: "suspend" } | { kind: "sessions" } | { kind: "key"; id: string; name: string };

function AccountActions({ id, data, refresh }: { id: string; data: CustomerDetail; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      setNotice(await action());
      setPending(null);
      refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The account action failed.");
    } finally {
      setBusy(false);
    }
  }

  function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const amount = String(fields.get("amount") ?? "").trim();
    const negative = amount.startsWith("-");
    const parsed = parseCreditAmount(negative ? amount.slice(1) : amount);
    void run(async () => {
      if (parsed === null || parsed > 1_000_000_000)
        throw new Error("Enter a USD amount up to $1,000 with up to six decimal places.");
      await request("admin-adjust-balance", {
        account: id,
        delta: negative ? -parsed : parsed,
        reason: String(fields.get("reason") ?? ""),
      });
      form.reset();
      return "Balance adjustment applied and written to the audit log.";
    });
  }

  function suspend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    const suspended = !data.suspended;
    void run(async () => {
      await request("admin-suspend", { account: id, suspended, ...(note ? { note } : {}) });
      return suspended ? "Inference access suspended." : "Inference access restored.";
    });
  }

  return (
    <section className="panel stack-panel">
      <div className="between">
        <h2>Account actions</h2>
        {data.flags.length > 0 && (
          <div className="actions">
            {data.flags.map((flag) => (
              <span key={flag} className="crm-state">
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>
      {failure && (
        <p role="alert" className="error">
          {failure}
        </p>
      )}
      {notice && (
        <p role="status" className="status">
          {notice}
        </p>
      )}
      <form className="recovery-form" onSubmit={adjust}>
        <label>
          Balance adjustment in USD, prefix with - to debit
          <input name="amount" inputMode="decimal" maxLength={24} placeholder="25.00 or -25.00" required />
        </label>
        <label>
          Evidence note
          <textarea
            name="reason"
            rows={2}
            minLength={8}
            maxLength={500}
            required
            placeholder="Ticket, receipt, or incident reference."
          />
        </label>
        <p className="caption">
          Adjustments take effect immediately and are recorded on the customer timeline and in the admin audit
          log.
        </p>
        <button className="button quiet" disabled={busy}>
          Apply audited adjustment
        </button>
      </form>
      {data.keys.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>API key</th>
                <th>Prefix</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.keys.map((key) => (
                <tr key={key.id}>
                  <th scope="row">{key.name}</th>
                  <td>
                    <code>{key.prefix}…</code>
                  </td>
                  <td>{key.revoked ? "Revoked" : "Active"}</td>
                  <td>
                    {!key.revoked && (
                      <button
                        type="button"
                        className="button quiet small"
                        disabled={busy}
                        onClick={() => setPending({ kind: "key", id: key.id, name: key.name })}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="actions">
        <button
          type="button"
          className="button quiet"
          disabled={busy}
          onClick={() => setPending({ kind: "suspend" })}
        >
          {data.suspended ? "Restore access" : "Suspend inference"}
        </button>
        <button
          type="button"
          className="button danger"
          disabled={busy}
          onClick={() => setPending({ kind: "sessions" })}
        >
          Reset sessions
        </button>
      </div>
      {pending?.kind === "suspend" && (
        <form className="panel callout" onSubmit={suspend}>
          <div>
            <h2>{data.suspended ? "Restore inference access?" : "Suspend inference?"}</h2>
            <p>
              {data.suspended
                ? "The customer can reserve inference credit again."
                : "New inference reservations are blocked immediately."}
            </p>
            <label>
              Note for the record
              <input name="note" maxLength={500} placeholder="Optional context" />
            </label>
          </div>
          <div className="actions">
            <button className="button danger" disabled={busy}>
              {data.suspended ? "Restore access" : "Suspend account"}
            </button>
            <button type="button" className="button quiet" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {pending?.kind === "sessions" && (
        <div className="panel callout">
          <div>
            <h2>Reset sessions?</h2>
            <p>The customer is signed out on every device. API keys keep working.</p>
          </div>
          <div className="actions">
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await request("admin-reset-sessions", { account: id });
                  return "All customer sessions were signed out.";
                })
              }
            >
              Reset sessions
            </button>
            <button type="button" className="button quiet" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {pending?.kind === "key" && (
        <div className="panel callout">
          <div>
            <h2>Revoke {pending.name}?</h2>
            <p>Clients using this key lose API access immediately.</p>
          </div>
          <div className="actions">
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await request("admin-revoke-key", { id: pending.id });
                  return "API key " + pending.name + " revoked.";
                })
              }
            >
              Revoke key
            </button>
            <button type="button" className="button quiet" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {data.adjustments.length > 0 && (
        <details>
          <summary>Recent balance adjustments</summary>
          <ul className="crm-activity">
            {data.adjustments.map((item) => (
              <li key={item.id}>
                <p className="crm-note">
                  {(item.delta < 0 ? "-" : "+") + creditBalance(Math.abs(item.delta))} →{" "}
                  {creditBalance(item.balanceAfter)}
                </p>
                <p className="caption">
                  {localTime(item.time)} · {shorten(item.adminWallet)} · {item.reason}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CustomerWorkspace({ id, back }: { id: string; back: () => void }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState("");
  const state = useCrm<CustomerDetail | null>(
    "admin-crm?view=customer&id=" + encodeURIComponent(id),
    revision,
  );
  const data = state?.data;
  const refresh = () => setRevision((value) => value + 1);

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setNoteError("");
    try {
      await request("admin-note", { account: id, note: new FormData(form).get("note") });
      form.reset();
      refresh();
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Could not save your note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crm-workspace" aria-label="Customer workspace">
      <button type="button" className="button quiet small crm-back" onClick={back}>
        <ArrowLeft size={15} /> Back to results
      </button>
      {state?.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : !data ? (
        <p role="status">{state ? "Account unavailable." : "Loading customer…"}</p>
      ) : (
        <>
          <section className="panel stack-panel">
            <div className="between">
              <h2>
                <Identity customer={data.customer} />
              </h2>
              <div className="actions">
                {data.suspended && <span className="crm-state">Suspended</span>}
                <CopyButton value={data.customer.wallet} label="Copy customer wallet" />
              </div>
            </div>
            <dl className="crm-facts">
              <div>
                <dt>Joined</dt>
                <dd>{localTime(data.customer.joined)}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{data.customer.role}</dd>
              </div>
              <div>
                <dt>Credit balance</dt>
                <dd>{creditBalance(data.customer.balance)}</dd>
              </div>
              <div>
                <dt>Referral</dt>
                <dd>
                  {data.inviter?.username
                    ? "@" + data.inviter.username
                    : data.inviter
                      ? shorten(data.inviter.wallet)
                      : "Direct"}
                </dd>
              </div>
              <div>
                <dt>Workspace setup</dt>
                <dd>
                  {data.customer.onboarding === "fund"
                    ? "Chose to add credits"
                    : data.customer.onboarding === "later"
                      ? "Explored first"
                      : data.customer.onboarding === "pending"
                        ? "In progress"
                        : "—"}
                </dd>
              </div>
              <div>
                <dt>Activation</dt>
                <dd>{data.active ? "Paid request completed" : data.funded ? "Funded" : "Signed up"}</dd>
              </div>
              <div>
                <dt>Terms</dt>
                <dd>
                  {data.acceptedTerms
                    ? data.acceptedTerms + (data.acceptedAt ? " · " + localTime(data.acceptedAt) : "")
                    : "Awaiting acceptance"}
                </dd>
              </div>
            </dl>
          </section>
          <AccountActions id={id} data={data} refresh={refresh} />
          <section className="panel stack-panel">
            <h2>Account activity</h2>
            <form className="recovery-form" onSubmit={(event) => void addNote(event)}>
              <label>
                Internal note
                <textarea
                  name="note"
                  rows={2}
                  maxLength={2000}
                  required
                  placeholder="Add support context or a follow-up."
                />
              </label>
              <button className="button quiet" disabled={busy}>
                {busy ? "Saving…" : "Add note"}
              </button>
              {noteError && (
                <p role="alert" className="error">
                  {noteError}
                </p>
              )}
            </form>
            {data.activity.length ? (
              <ul className="crm-activity">
                {data.activity.map((item) => (
                  <li key={item.id}>
                    <p className="crm-note">{item.note}</p>
                    <p className="caption">
                      {localTime(item.time)} · {shorten(item.actor)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="caption">No admin activity recorded.</p>
            )}
          </section>
          <section className="panel stack-panel">
            <h2>Recent payments</h2>
            {data.deposits.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Network</th>
                      <th>Amount</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deposits.map((item) => (
                      <tr key={item.id}>
                        <td>{localTime(item.time)}</td>
                        <td>{item.cluster}</td>
                        <td>{creditBalance(item.amount)}</td>
                        <td>
                          {item.signature && item.cluster === "mainnet" ? (
                            <a
                              className="text-link"
                              href={"https://explorer.solana.com/tx/" + encodeURIComponent(item.signature)}
                            >
                              Finalized ↗
                            </a>
                          ) : item.signature ? (
                            "Finalized"
                          ) : (
                            <CopyButton value={item.reference} label="Copy pending reference" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="caption">No payment drafts.</p>
            )}
          </section>
          <section className="panel stack-panel">
            <h2>Recent requests</h2>
            <TraceList rows={data.traces} />
          </section>
          <section className="panel stack-panel">
            <h2>Support history</h2>
            <TicketList rows={data.tickets} refresh={refresh} />
          </section>
        </>
      )}
    </section>
  );
}

export function AdminCrm({ view, canOpenCustomer = true }: { view: CrmView; canOpenCustomer?: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [trail, setTrail] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [revision, setRevision] = useState(0);
  const cursor = trail.at(-1);
  const params = new URLSearchParams({ view, filter, search, ...(cursor ? { cursor } : {}) });
  const state = useCrm<CrmPage>("admin-crm?" + params, revision);
  const refresh = () => setRevision((value) => value + 1);
  if (account) return <CustomerWorkspace id={account} back={() => setAccount("")} />;

  const description = {
    customers: "Find a wallet and review its account, referrals, payments, requests, and support history.",
    support: "Review support requests, assign ownership, and update their status.",
    traces: "Inspect request metadata, provider outcomes, and settlement amounts.",
  };
  const title = { customers: "Customers", support: "Support inbox", traces: "Request traces" };
  return (
    <section className="panel stack-panel" aria-labelledby="crm-heading">
      <div className="between">
        <div>
          <h2 id="crm-heading">{title[view]}</h2>
          <p className="caption">{description[view]}</p>
        </div>
        <button type="button" className="button quiet small" onClick={refresh}>
          Refresh {view}
        </button>
      </div>
      <div className="crm-controls">
        {view !== "support" && (
          <form
            className="crm-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(String(new FormData(event.currentTarget).get("search") ?? "").trim());
              setTrail([]);
            }}
          >
            <input
              name="search"
              type="search"
              maxLength={80}
              aria-label={view === "customers" ? "Search customers" : "Search request traces"}
              placeholder={
                view === "customers" ? "@username or wallet address" : "Sonnely or provider request ID"
              }
            />
            <button className="button quiet">
              <Search size={16} /> Search
            </button>
          </form>
        )}
        {view !== "customers" && (
          <select
            aria-label={view === "support" ? "Support status" : "Trace status"}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setTrail([]);
            }}
          >
            <option value="all">All statuses</option>
            {Object.entries(view === "support" ? ticketStates : traceStates).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>
      {state?.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : !state?.data ? (
        <p role="status">Loading {title[view].toLowerCase()}…</p>
      ) : (
        <>
          {view === "customers" &&
            (state.data.page.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Joined</th>
                      <th>Balance</th>
                      <th>Role</th>
                      <th>Workspace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(state.data.page as Customer[]).map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <Identity customer={row} />
                        </th>
                        <td>{localTime(row.joined)}</td>
                        <td>{creditBalance(row.balance)}</td>
                        <td>{row.role}</td>
                        <td>
                          <button
                            type="button"
                            className="button quiet small"
                            onClick={() => setAccount(row.id)}
                          >
                            View account <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="caption">No matching customers.</p>
            ))}
          {view === "support" && (
            <TicketList
              rows={state.data.page as Ticket[]}
              open={canOpenCustomer ? setAccount : undefined}
              refresh={refresh}
            />
          )}
          {view === "traces" && <TraceList rows={state.data.page as Trace[]} open={setAccount} />}
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
