"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { creditBalance, parseCreditAmount } from "@/lib/credit-amount";
import { shorten } from "@/lib/models";
import { CopyButton } from "../shared";
import { request } from "../wallet";
import {
  CrmSection,
  Identity,
  localTime,
  useCrm,
  type CustomerDetail,
  type Task,
} from "./shared";
import { TicketList } from "./support";
import { TraceList } from "./traces";
import { Pill, Skeleton } from "./ui";

type PendingAction = { kind: "suspend" } | { kind: "sessions" } | { kind: "key"; id: string; name: string };
type RecordTab = "activity" | "requests" | "billing" | "support" | "keys" | "notes";

function CustomerAvatar({ customer }: { customer: CustomerDetail["customer"] }) {
  const source = (customer.name || customer.username || customer.wallet).replace(/^@/, "");
  const initials =
    source
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  let hash = 0;
  for (const ch of customer.wallet) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="crm-avatar"
      aria-hidden="true"
      style={{ background: "hsl(" + (hash % 360) + " 45% 40%)" }}
    >
      {initials}
    </span>
  );
}

function TabPanel({
  id,
  tab,
  mounted,
  children,
}: {
  id: RecordTab;
  tab: RecordTab;
  mounted: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={"crm-panel-" + id}
      aria-labelledby={"crm-tab-" + id}
      className="crm-tab-panel crm-records"
      hidden={tab !== id}
    >
      {mounted ? children : null}
    </div>
  );
}

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
      <h2>Account actions</h2>
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
    </section>
  );
}

function FollowUpList({
  rows,
  busy,
  update,
}: {
  rows: Task[];
  busy: boolean;
  update: (action: string, id: string) => void;
}) {
  const open = rows.filter((row) => row.doneAt === undefined);
  const done = rows.filter((row) => row.doneAt !== undefined);
  const ordered = [
    ...open.sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER)),
    ...done,
  ];
  return ordered.length ? (
    <div className="crm-records">
      {ordered.map((row) => {
        const overdue = row.doneAt === undefined && row.dueAt !== undefined && row.dueAt < Date.now();
        return (
          <div key={row.id} className={"crm-record crm-task" + (row.doneAt === undefined ? "" : " crm-done")}>
            <span>
              <strong>{row.title}</strong>
              <span className={"caption" + (overdue ? " crm-overdue" : "")}>
                {row.dueAt === undefined ? "No due date" : "Due " + localTime(row.dueAt)}
                {overdue ? " · Overdue" : ""} · {shorten(row.assignee)}
              </span>
            </span>
            <button
              type="button"
              className="button quiet small"
              disabled={busy}
              onClick={() =>
                update(row.doneAt === undefined ? "admin-task-done" : "admin-task-reopen", row.id)
              }
            >
              {row.doneAt === undefined ? "Done" : "Reopen"}
            </button>
          </div>
        );
      })}
    </div>
  ) : (
    <p className="caption">No follow-ups recorded.</p>
  );
}

export function CustomerWorkspace({
  id,
  back,
  open,
}: {
  id: string;
  back: () => void;
  open: (id: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [taskError, setTaskError] = useState("");
  const [flagDraft, setFlagDraft] = useState("");
  const [flagError, setFlagError] = useState("");
  const [tab, setTab] = useState<RecordTab>("activity");
  const [visited, setVisited] = useState<Partial<Record<RecordTab, boolean>>>({ activity: true });
  const [prevId, setPrevId] = useState(id);
  const state = useCrm<CustomerDetail | null>(
    "admin-crm?view=customer&id=" + encodeURIComponent(id),
    revision,
  );
  const flagState = useCrm<string[]>("admin-crm?view=customer-flags&id=" + encodeURIComponent(id), revision);
  const flagOptions = useCrm<string[]>("admin-crm?view=flags", revision);
  const data = state?.data;
  const flags = flagState?.data;
  const refresh = () => setRevision((value) => value + 1);

  if (prevId !== id) {
    setPrevId(id);
    setTab("activity");
    setVisited({ activity: true });
  }

  function choose(next: RecordTab) {
    setTab(next);
    setVisited((seen) => (seen[next] ? seen : { ...seen, [next]: true }));
  }

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

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const due = String(fields.get("due") ?? "");
    setBusy(true);
    setTaskError("");
    try {
      await request("admin-task-create", {
        account: id,
        title: fields.get("title"),
        ...(due ? { dueAt: new Date(due + "T23:59:59").getTime() } : {}),
      });
      form.reset();
      refresh();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not save the follow-up.");
    } finally {
      setBusy(false);
    }
  }

  async function flagAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const flag = flagDraft.trim();
    if (!flag) return;
    setBusy(true);
    setFlagError("");
    try {
      await request("admin-flag", { account: id, flag });
      setFlagDraft("");
      refresh();
    } catch (error) {
      setFlagError(error instanceof Error ? error.message : "Could not add the flag.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(action: string, task: string) {
    setBusy(true);
    setTaskError("");
    try {
      await request(action, { id: task });
      refresh();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not update the follow-up.");
    } finally {
      setBusy(false);
    }
  }

  async function unflagAccount(flag: string) {
    setBusy(true);
    setFlagError("");
    try {
      await request("admin-unflag", { account: id, flag });
      refresh();
    } catch (error) {
      setFlagError(error instanceof Error ? error.message : "Could not remove the flag.");
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
        state ? (
          <p role="status" className="caption">
            Account unavailable.
          </p>
        ) : (
          <Skeleton rows={7} />
        )
      ) : (
        <>
          <section className={"panel stack-panel crm-head" + (data.suspended ? " crm-suspended" : "")}>
            <div className="crm-head-top">
              <CustomerAvatar customer={data.customer} />
              <div className="crm-head-id">
                <h2>
                  <Identity customer={data.customer} />
                </h2>
                <div className="crm-head-pills">
                  <CopyButton value={data.customer.wallet} label="Copy customer wallet" />
                  {data.suspended && <Pill tone="error">Suspended</Pill>}
                  {data.flags
                    .filter((flag) => flag !== "suspended")
                    .map((flag) => (
                      <Pill key={flag}>{flag}</Pill>
                    ))}
                </div>
              </div>
            </div>
            <dl className="crm-facts">
              <div>
                <dt>Credit balance</dt>
                <dd>{creditBalance(data.customer.balance)}</dd>
              </div>
              <div>
                <dt>Total spend</dt>
                <dd>{creditBalance(data.stats.totalSpend)}</dd>
              </div>
              <div>
                <dt>Total deposits</dt>
                <dd>{creditBalance(data.stats.totalDeposits)}</dd>
              </div>
              <div>
                <dt>Requests</dt>
                <dd>{data.stats.requestCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Last active</dt>
                <dd>{data.stats.lastActiveAt === undefined ? "—" : localTime(data.stats.lastActiveAt)}</dd>
              </div>
              <div>
                <dt>Referrals</dt>
                <dd>{data.stats.referredCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{localTime(data.customer.joined)}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{data.customer.role}</dd>
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
          <div className="crm-body">
            <aside className="crm-side">
              <AccountActions id={id} data={data} refresh={refresh} />
            </aside>
            <div className="crm-main">
              <div className="crm-tabs" role="tablist" aria-label="Customer record sections">
                {(
                  [
                    { id: "activity", label: "Activity" },
                    { id: "requests", label: "Requests" },
                    { id: "billing", label: "Billing" },
                    {
                      id: "support",
                      label: "Support",
                      badge: data.tickets.filter((row) => row.state !== "resolved").length,
                    },
                    { id: "keys", label: "Keys" },
                    {
                      id: "notes",
                      label: "Notes & tasks",
                      badge: data.tasks.filter((row) => row.doneAt === undefined).length,
                    },
                  ] satisfies { id: RecordTab; label: string; badge?: number }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={"crm-tab-" + item.id}
                    aria-selected={tab === item.id}
                    aria-controls={"crm-panel-" + item.id}
                    className="crm-tab"
                    onClick={() => choose(item.id)}
                  >
                    {item.label}
                    {item.badge ? (
                      <span className="admin-nav-badge">{item.badge > 99 ? "99+" : item.badge}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <TabPanel id="activity" tab={tab} mounted={visited.activity === true}>
                <CrmSection title="Timeline">
                  {data.timeline.length ? (
                    <ul className="crm-activity">
                      {data.timeline.map((item) => (
                        <li key={item.id}>
                          <p className="crm-note">
                            <span className="crm-state">{item.kind}</span> {item.summary ?? item.note}
                          </p>
                          <p className="caption">
                            {localTime(item.time)} · {item.actor.length > 20 ? shorten(item.actor) : item.actor}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="caption">No events recorded.</p>
                  )}
                </CrmSection>
                <CrmSection title="Account activity">
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
                </CrmSection>
                <CrmSection title="Referred accounts" open={data.referrals.length > 0}>
                  {data.referrals.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Account</th>
                            <th>Joined</th>
                            <th>Funded</th>
                            <th>Active</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.referrals.map((row) => (
                            <tr key={row.id}>
                              <th scope="row">{row.username ? "@" + row.username : shorten(row.wallet)}</th>
                              <td>{localTime(row.joined)}</td>
                              <td>{row.funded ? <span className="crm-state">Funded</span> : "—"}</td>
                              <td>{row.active ? <span className="crm-state">Active</span> : "—"}</td>
                              <td>
                                <button
                                  type="button"
                                  className="button quiet small"
                                  onClick={() => open(row.id)}
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
                    <p className="caption">No referred accounts.</p>
                  )}
                </CrmSection>
              </TabPanel>
              <TabPanel id="requests" tab={tab} mounted={visited.requests === true}>
                <CrmSection title="Recent requests">
                  <dl className="crm-facts">
                    <div>
                      <dt>Requests</dt>
                      <dd>{data.stats.requestCount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Total spend</dt>
                      <dd>{creditBalance(data.stats.totalSpend)}</dd>
                    </div>
                    <div>
                      <dt>Last active</dt>
                      <dd>
                        {data.stats.lastActiveAt === undefined ? "—" : localTime(data.stats.lastActiveAt)}
                      </dd>
                    </div>
                  </dl>
                  <TraceList rows={data.traces} compact />
                </CrmSection>
              </TabPanel>
              <TabPanel id="billing" tab={tab} mounted={visited.billing === true}>
                <CrmSection title="Balance">
                  <dl className="crm-facts">
                    <div>
                      <dt>Credit balance</dt>
                      <dd>{creditBalance(data.customer.balance)}</dd>
                    </div>
                    <div>
                      <dt>Total deposits</dt>
                      <dd>{creditBalance(data.stats.totalDeposits)}</dd>
                    </div>
                    <div>
                      <dt>Total spend</dt>
                      <dd>{creditBalance(data.stats.totalSpend)}</dd>
                    </div>
                  </dl>
                </CrmSection>
                <CrmSection title="Recent payments">
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
                                    href={
                                      "https://explorer.solana.com/tx/" + encodeURIComponent(item.signature)
                                    }
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
                </CrmSection>
                <CrmSection title="Balance adjustments" open={data.adjustments.length > 0}>
                  {data.adjustments.length ? (
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
                  ) : (
                    <p className="caption">No balance adjustments.</p>
                  )}
                </CrmSection>
              </TabPanel>
              <TabPanel id="support" tab={tab} mounted={visited.support === true}>
                <CrmSection title="Support history">
                  <TicketList rows={data.tickets} refresh={refresh} />
                </CrmSection>
              </TabPanel>
              <TabPanel id="keys" tab={tab} mounted={visited.keys === true}>
                <CrmSection title="API keys" open={data.keys.length > 0}>
                  {data.keys.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Prefix</th>
                            <th>Last used</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.keys.map((row) => (
                            <tr key={row.id}>
                              <td>{row.name}</td>
                              <td>
                                <code>{row.prefix}…</code>
                              </td>
                              <td>{row.lastUsed === undefined ? "—" : localTime(row.lastUsed)}</td>
                              <td>{row.revoked ? "Revoked" : "Active"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="caption">No API keys.</p>
                  )}
                </CrmSection>
              </TabPanel>
              <TabPanel id="notes" tab={tab} mounted={visited.notes === true}>
                <CrmSection title="Notes">
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
                </CrmSection>
                <CrmSection title="Follow-ups">
                  <form className="recovery-form" onSubmit={(event) => void addTask(event)}>
                    <label>
                      Follow-up
                      <input
                        name="title"
                        type="text"
                        maxLength={160}
                        required
                        placeholder="Check in with the customer."
                      />
                    </label>
                    <label>
                      Due date
                      <input name="due" type="date" />
                    </label>
                    <button className="button quiet" disabled={busy}>
                      {busy ? "Saving…" : "Add follow-up"}
                    </button>
                    {taskError && (
                      <p role="alert" className="error">
                        {taskError}
                      </p>
                    )}
                  </form>
                  <FollowUpList
                    rows={data.tasks}
                    busy={busy}
                    update={(action, task) => void updateTask(action, task)}
                  />
                </CrmSection>
                <CrmSection title="Tags">
                  <div className="crm-flags">
                    {flags?.length ? (
                      flags.map((flag) => (
                        <span key={flag} className="pill">
                          {flag}
                          <button
                            type="button"
                            aria-label={"Remove flag " + flag}
                            disabled={busy}
                            onClick={() => void unflagAccount(flag)}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <p className="caption">{flags ? "No flags yet." : "Loading flags…"}</p>
                    )}
                  </div>
                  <form className="crm-controls" onSubmit={(event) => void flagAccount(event)}>
                    <input
                      type="text"
                      list="crm-flag-list"
                      value={flagDraft}
                      onChange={(event) => setFlagDraft(event.target.value)}
                      maxLength={24}
                      required
                      placeholder="flag-name"
                      aria-label="New flag"
                    />
                    <datalist id="crm-flag-list">
                      {(flagOptions?.data ?? []).map((flag) => (
                        <option key={flag} value={flag} />
                      ))}
                    </datalist>
                    <button className="button quiet" disabled={busy}>
                      Add flag
                    </button>
                  </form>
                  {flagError && (
                    <p role="alert" className="error">
                      {flagError}
                    </p>
                  )}
                </CrmSection>
              </TabPanel>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
