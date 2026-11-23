"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
type Thread = NonNullable<FunctionReturnType<typeof api.crm.ticketThread>>;
type Trace = FunctionReturnType<typeof api.crm.traces>["page"][number];
type OperatorOption = FunctionReturnType<typeof api.operators.operators>[number];
type Task = CustomerDetail["tasks"][number];
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

export function useCrm<T>(route: string, revision: number) {
  const [state, setState] = useState<{ route: string; revision: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!route) return;
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
  return route !== "" && state?.route === route && state.revision === revision ? state : undefined;
}

function Identity({ customer }: { customer: { name: string; username?: string; wallet: string } }) {
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

function TicketThread({ id, refresh }: { id: string; refresh: () => void }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const state = useCrm<Thread | null>("admin-crm?view=support-thread&id=" + encodeURIComponent(id), revision);
  const reload = () => setRevision((value) => value + 1);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setFailure("");
    try {
      await request("admin-reply", {
        id,
        body: fields.get("body"),
        visibility: fields.get("visibility") ?? "public",
      });
      form.reset();
      reload();
      refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not send the reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-thread">
      {state?.error ? (
        <p role="alert" className="error">
          {state.error}
        </p>
      ) : state?.data === undefined ? (
        <p role="status" className="caption">
          Loading conversation…
        </p>
      ) : state.data === null ? (
        <p className="caption">Support request unavailable.</p>
      ) : state.data.replies.length ? (
        <ul className="crm-activity">
          {state.data.replies.map((item) => (
            <li key={item.id}>
              <p className="crm-note">{item.body}</p>
              <p className="caption">
                {localTime(item.time)} · {shorten(item.author)} ·{" "}
                <span className="crm-state">{item.visibility === "public" ? "Public" : "Internal"}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="caption">No replies yet.</p>
      )}
      <form className="recovery-form" onSubmit={(event) => void send(event)}>
        <label>
          Reply
          <textarea
            name="body"
            rows={3}
            maxLength={4000}
            required
            placeholder="Reply to the customer, or keep the note internal."
          />
        </label>
        <div className="crm-controls" role="radiogroup" aria-label="Reply visibility">
          <label>
            <input type="radio" name="visibility" value="public" defaultChecked /> Public reply
          </label>
          <label>
            <input type="radio" name="visibility" value="internal" /> Internal note
          </label>
        </div>
        <button className="button quiet" disabled={busy}>
          {busy ? "Sending…" : "Send reply"}
        </button>
        {failure && (
          <p role="alert" className="error">
            {failure}
          </p>
        )}
      </form>
    </div>
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
            <details
              key={row.id}
              className="crm-record"
              onToggle={(event) => {
                if (event.currentTarget.open && !expanded[row.id])
                  setExpanded((current) => ({ ...current, [row.id]: true }));
              }}
            >
              <summary>
                <span>
                  <strong>{row.topic}</strong>
                  <span className="caption">
                    {localTime(row.opened)} · {row.email}
                    {row.replyCount
                      ? " · " + row.replyCount + (row.replyCount === 1 ? " reply" : " replies")
                      : ""}
                  </span>
                </span>
                <span className="crm-state">{ticketStates[row.state]}</span>
              </summary>
              <p className="crm-note">{row.message}</p>
              {expanded[row.id] && <TicketThread id={row.id} refresh={refresh} />}
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

function CrmSection({
  title,
  children,
  open = true,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="panel stack-panel" open={open}>
      <summary className="crm-section-head">
        <h2>{title}</h2>
      </summary>
      {children}
    </details>
  );
}

type Segment = { id: string; name: string; definition: string };

function CustomerWorkspace({ id, back, open }: { id: string; back: () => void; open: (id: string) => void }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [taskError, setTaskError] = useState("");
  const [flagDraft, setFlagDraft] = useState("");
  const [flagError, setFlagError] = useState("");
  const state = useCrm<CustomerDetail | null>(
    "admin-crm?view=customer&id=" + encodeURIComponent(id),
    revision,
  );
  const flagState = useCrm<string[]>("admin-crm?view=customer-flags&id=" + encodeURIComponent(id), revision);
  const flagOptions = useCrm<string[]>("admin-crm?view=flags", revision);
  const data = state?.data;
  const flags = flagState?.data;
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
            <dl className="admin-metrics">
              <div>
                <dt>Total deposits</dt>
                <dd>{creditBalance(data.stats.totalDeposits)}</dd>
              </div>
              <div>
                <dt>Total spend</dt>
                <dd>{creditBalance(data.stats.totalSpend)}</dd>
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
            </dl>
          </section>
          <AccountActions id={id} data={data} refresh={refresh} />
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
                          <button type="button" className="button quiet small" onClick={() => open(row.id)}>
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
          <CrmSection title="Account activity">
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
          </CrmSection>
          <CrmSection title="Recent requests">
            <TraceList rows={data.traces} />
          </CrmSection>
          <CrmSection title="Support history">
            <TicketList rows={data.tickets} refresh={refresh} />
          </CrmSection>
        </>
      )}
    </section>
  );
}

export function AdminCrm({ view, canOpenCustomer = true }: { view: CrmView; canOpenCustomer?: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [flag, setFlag] = useState("");
  const [funded, setFunded] = useState("any");
  const [activeOnly, setActiveOnly] = useState(false);
  const [selected, setSelected] = useState<Customer["id"][]>([]);
  const [bulkFlag, setBulkFlag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [segmentError, setSegmentError] = useState("");
  const [trail, setTrail] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [revision, setRevision] = useState(0);
  const cursor = trail.at(-1);
  const params = new URLSearchParams({ view, filter, search, ...(cursor ? { cursor } : {}) });
  if (view === "customers") {
    if (flag) params.set("flag", flag);
    if (funded !== "any") params.set("funded", funded);
    if (activeOnly) params.set("active", "true");
  }
  const state = useCrm<CrmPage>("admin-crm?" + params, revision);
  const segments = useCrm<Segment[]>(view === "customers" ? "admin-crm?view=segments" : "", revision);
  const flagOptions = useCrm<string[]>(view === "customers" ? "admin-crm?view=flags" : "", revision);
  const refresh = () => setRevision((value) => value + 1);
  function applySegment(segment: Segment) {
    try {
      const saved = JSON.parse(segment.definition) as {
        search?: string;
        flag?: string;
        funded?: string;
        active?: boolean;
      };
      setSearch(typeof saved.search === "string" ? saved.search : "");
      setFlag(typeof saved.flag === "string" ? saved.flag : "");
      setFunded(saved.funded === "funded" || saved.funded === "unfunded" ? saved.funded : "any");
      setActiveOnly(Boolean(saved.active));
      setTrail([]);
      setSegmentId(segment.id);
      setSegmentError("");
    } catch {
      setSegmentError("That saved view could not be read.");
    }
  }

  async function saveView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("view-name") ?? "").trim();
    if (!name) return;
    setSegmentError("");
    try {
      const saved = await request<Segment>("admin-segment-save", {
        name,
        definition: JSON.stringify({ search, flag, funded, active: activeOnly }),
      });
      form.reset();
      setSegmentId(saved.id);
      refresh();
    } catch (error) {
      setSegmentError(error instanceof Error ? error.message : "Could not save the view.");
    }
  }

  async function deleteView() {
    if (!segmentId) return;
    setSegmentError("");
    try {
      await request("admin-segment-delete", { id: segmentId });
      setSegmentId("");
      refresh();
    } catch (error) {
      setSegmentError(error instanceof Error ? error.message : "Could not delete the view.");
    }
  }

  async function flagSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = bulkFlag.trim();
    if (!value || !selected.length) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      for (const accountId of selected) await request("admin-flag", { account: accountId, flag: value });
      setSelected([]);
      setBulkFlag("");
      refresh();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Could not flag the selected accounts.");
    } finally {
      setBulkBusy(false);
    }
  }

  if (account) return <CustomerWorkspace id={account} back={() => setAccount("")} open={setAccount} />;

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
        {view === "customers" && (
          <>
            <select
              aria-label="Flag filter"
              value={flag}
              onChange={(event) => {
                setFlag(event.target.value);
                setTrail([]);
              }}
            >
              <option value="">Any flag</option>
              {(flagOptions?.data ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {flag && !(flagOptions?.data ?? []).includes(flag) && <option value={flag}>{flag}</option>}
            </select>
            <select
              aria-label="Funding filter"
              value={funded}
              onChange={(event) => {
                setFunded(event.target.value);
                setTrail([]);
              }}
            >
              <option value="any">Any funding</option>
              <option value="funded">Funded</option>
              <option value="unfunded">Unfunded</option>
            </select>
            <label className="crm-check">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => {
                  setActiveOnly(event.target.checked);
                  setTrail([]);
                }}
              />
              Active 30d
            </label>
            <select
              aria-label="Saved views"
              value={segmentId}
              onChange={(event) => {
                const segment = segments?.data?.find((item) => item.id === event.target.value);
                if (segment) applySegment(segment);
                else setSegmentId("");
              }}
            >
              <option value="">Saved views…</option>
              {(segments?.data ?? []).map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
            {segmentId && (
              <button type="button" className="button quiet small" onClick={() => void deleteView()}>
                Delete view
              </button>
            )}
            <form className="crm-search" onSubmit={(event) => void saveView(event)}>
              <input
                name="view-name"
                type="text"
                maxLength={40}
                required
                placeholder="Name this view"
                aria-label="Name this view"
              />
              <button className="button quiet small">Save view</button>
            </form>
            {segmentError && (
              <p role="alert" className="error">
                {segmentError}
              </p>
            )}
          </>
        )}
      </div>
      {view === "customers" && selected.length > 0 && (
        <form className="crm-controls" onSubmit={(event) => void flagSelected(event)}>
          <span className="pill">{selected.length} selected</span>
          <input
            type="text"
            list="crm-flag-list"
            value={bulkFlag}
            onChange={(event) => setBulkFlag(event.target.value)}
            maxLength={24}
            required
            placeholder="flag-name"
            aria-label="Flag to apply"
          />
          <datalist id="crm-flag-list">
            {(flagOptions?.data ?? []).map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <button className="button quiet small" disabled={bulkBusy}>
            {bulkBusy ? "Flagging…" : "Flag selected"}
          </button>
          <button type="button" className="button quiet small" onClick={() => setSelected([])}>
            Clear
          </button>
          {bulkError && (
            <p role="alert" className="error">
              {bulkError}
            </p>
          )}
        </form>
      )}
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
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select all customers on this page"
                          checked={(state.data.page as Customer[]).every((row) => selected.includes(row.id))}
                          onChange={(event) => {
                            const ids = (state.data!.page as Customer[]).map((row) => row.id);
                            setSelected(
                              event.target.checked
                                ? [...new Set([...selected, ...ids])]
                                : selected.filter((id) => !ids.includes(id)),
                            );
                          }}
                        />
                      </th>
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
                        <td>
                          <input
                            type="checkbox"
                            aria-label="Select customer"
                            checked={selected.includes(row.id)}
                            onChange={(event) =>
                              setSelected(
                                event.target.checked
                                  ? [...selected, row.id]
                                  : selected.filter((id) => id !== row.id),
                              )
                            }
                          />
                        </td>
                        <th scope="row">
                          <Identity customer={row} />
                          {row.flags.length > 0 && (
                            <span className="crm-flags">
                              {row.flags.map((flag) => (
                                <span key={flag} className="pill">
                                  {flag}
                                </span>
                              ))}
                            </span>
                          )}
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
