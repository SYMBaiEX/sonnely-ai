// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { shorten } from "../lib/models.ts";
import { request } from "../wallet";
import { CopyButton } from "../shared.tsx";
import { EmptyState, Pill, Skeleton, Toolbar, usePolling } from "./ui.tsx";
import {
  Identity,
  localTime,
  ticketStates,
  useCrm,
  type CrmPage,
  type OperatorOption,
  type Thread,
  type Ticket,
} from "./shared.tsx";

function relTime(time: number) {
  const elapsed = Date.now() - time;
  if (elapsed < 60_000) return "now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return minutes + "m";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d";
  return new Date(time).toLocaleDateString();
}

function stateTone(state: Ticket["state"]) {
  return state === "resolved" ? "ok" : state === "in_progress" ? "info" : "warn";
}

function ThreadBody({
  id,
  thread,
  showMessage,
  refresh,
}: {
  id: string;
  thread: Thread;
  showMessage?: boolean;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

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
      refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not send the reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {showMessage && <p className="crm-note">{thread.message}</p>}
      {thread.replies.length ? (
        <ul className="crm-activity">
          {[...thread.replies].reverse().map((item) => (
            <li key={item.id}>
              <p className="crm-note">{item.body}</p>
              <p className="caption">
                <Pill tone={item.visibility === "public" ? "info" : "muted"}>
                  {item.visibility === "public" ? "Public" : "Internal"}
                </Pill>{" "}
                {item.author === "Unavailable" ? item.author : shorten(item.author)} · {localTime(item.time)}
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
    </>
  );
}

function TicketThread({ id, refresh }: { id: string; refresh: () => void }) {
  const [revision, setRevision] = useState(0);
  const state = useCrm<Thread | null>("admin-crm?view=support-thread&id=" + encodeURIComponent(id), revision);
  const reload = () => setRevision((value) => value + 1);

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
      ) : (
        <ThreadBody
          id={id}
          thread={state.data}
          refresh={() => {
            reload();
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AssignmentOptions({ assignable }: { assignable: OperatorOption[] }) {
  return (
    <>
      <option value="keep">Keep assignment</option>
      <option value="claim">Assign to me</option>
      <option value="unassign">Unassign</option>
      {assignable.map((operator) => (
        <option key={operator.id} value={"assign:" + operator.id}>
          Assign to {operator.name || shorten(operator.wallet)}
          {operator.name ? " · " + shorten(operator.wallet) : ""}
        </option>
      ))}
    </>
  );
}

function ThreadPane({
  id,
  open,
  back,
  refresh,
}: {
  id: string;
  open?: (account: string) => void;
  back: () => void;
  refresh: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const state = useCrm<Thread | null>("admin-crm?view=support-thread&id=" + encodeURIComponent(id), revision);
  const directory = useCrm<OperatorOption[]>("admin-crm?view=operator-list", 0);
  const assignable = (directory?.data ?? []).filter((operator) => operator.id !== undefined);
  const reload = () => setRevision((value) => value + 1);
  const thread = state?.data;

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const selection = String(fields.get("assignment") ?? "keep");
    setSaving(true);
    setFailure("");
    try {
      await request("admin-ticket", {
        id,
        state: fields.get("state"),
        ...(selection.startsWith("assign:")
          ? { assignment: "assign", assignTo: selection.slice(7) }
          : { assignment: selection }),
      });
      reload();
      refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not update the support request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inbox-thread">
      <div>
        <button type="button" className="button quiet small inbox-back" onClick={back}>
          <ArrowLeft size={15} /> Queue
        </button>
      </div>
      {state?.error ? (
        <p role="alert" className="error">
          {state.error}
        </p>
      ) : state?.data === undefined ? (
        <Skeleton rows={5} />
      ) : thread === null || thread === undefined ? (
        <EmptyState title="Request unavailable" hint="This support request could not be found." />
      ) : (
        <>
          <div className="inbox-thread-head">
            <div className="inbox-thread-title">
              <strong>{thread.topic}</strong>
              <span className="caption">
                {thread.customer.wallet ? <Identity customer={thread.customer} /> : thread.email}
              </span>
            </div>
            <Pill tone={stateTone(thread.state)}>{ticketStates[thread.state]}</Pill>
          </div>
          <p className="inbox-thread-meta caption">
            {thread.email} · opened {localTime(thread.opened)} · waiting{" "}
            {relTime(thread.updated ?? thread.opened)} ·{" "}
            {thread.assignedWallet ? "assigned to " + shorten(thread.assignedWallet) : "unassigned"}
          </p>
          <div className="inbox-thread-actions">
            {thread.customer.wallet && <CopyButton value={thread.customer.wallet} label="Copy wallet" />}
            {open && (
              <button type="button" className="button quiet small" onClick={() => open(thread.account)}>
                Open customer
              </button>
            )}
          </div>
          <form
            className="crm-controls"
            onSubmit={(event) => void update(event)}
            key={thread.updated ?? thread.opened}
          >
            <label>
              Status
              <select name="state" defaultValue={thread.state}>
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
                <AssignmentOptions assignable={assignable} />
              </select>
            </label>
            <button className="button quiet" disabled={saving}>
              {saving ? "Saving…" : "Save request"}
            </button>
          </form>
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
          <ThreadBody
            id={id}
            thread={thread}
            showMessage
            refresh={() => {
              reload();
              refresh();
            }}
          />
        </>
      )}
    </div>
  );
}

function TicketRow({
  row,
  active,
  checked,
  onCheck,
  onOpen,
}: {
  row: Ticket;
  active: boolean;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <div className={"inbox-row" + (active ? " active" : "")}>
      <input
        type="checkbox"
        aria-label="Select request"
        checked={checked}
        onChange={(event) => onCheck(event.target.checked)}
      />
      <button type="button" className="inbox-row-main" onClick={onOpen}>
        <span className="inbox-row-top">
          <strong>{row.topic}</strong>
          <span className="inbox-row-meta">
            {row.replyCount > 0 && <span className="pill">{row.replyCount}</span>}
            <Pill tone={stateTone(row.state)}>{ticketStates[row.state]}</Pill>
            <span className="caption">{relTime(row.updated ?? row.opened)}</span>
          </span>
        </span>
        <span className="caption">
          {row.email}
          {row.assignedWallet ? " · " + shorten(row.assignedWallet) : " · unassigned"}
        </span>
      </button>
    </div>
  );
}

function BulkBar({
  selected,
  setSelected,
  busy,
  error,
  apply,
}: {
  selected: Ticket["id"][];
  setSelected: (ids: Ticket["id"][]) => void;
  busy: boolean;
  error: string;
  apply: (op: "claim" | "unassign" | "resolve") => Promise<void>;
}) {
  return (
    <div className="crm-controls" role="group" aria-label="Bulk actions">
      <span className="pill">{selected.length} selected</span>
      <button
        type="button"
        className="button quiet small"
        disabled={busy}
        onClick={() => void apply("claim")}
      >
        Assign to me
      </button>
      <button
        type="button"
        className="button quiet small"
        disabled={busy}
        onClick={() => void apply("resolve")}
      >
        Resolve
      </button>
      <button
        type="button"
        className="button quiet small"
        disabled={busy}
        onClick={() => void apply("unassign")}
      >
        Unassign
      </button>
      <button type="button" className="button quiet small" onClick={() => setSelected([])}>
        Clear
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function SupportInbox({ open }: { open?: (account: string) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [trail, setTrail] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState("");
  const [selected, setSelected] = useState<Ticket["id"][]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [notice, setNotice] = useState("");
  const cursor = trail.at(-1);
  const params = new URLSearchParams({
    view: "support",
    filter,
    search,
    ...(cursor ? { cursor } : {}),
  }).toString();
  const state = useCrm<CrmPage>("admin-crm?" + params, revision);
  const cache = useRef<{ route: string; data: CrmPage } | undefined>(undefined);
  if (state?.data) cache.current = { route: params, data: state.data };
  const page = state?.data ?? (cache.current?.route === params ? cache.current.data : undefined);
  const refresh = () => setRevision((value) => value + 1);
  usePolling(refresh, 30_000);

  async function apply(op: "claim" | "unassign" | "resolve") {
    if (!selected.length) return;
    setBulkBusy(true);
    setBulkError("");
    setNotice("");
    try {
      const result = await request<{ applied: number; skipped: number }>("admin-ticket-bulk", {
        ids: selected,
        op,
      });
      setSelected([]);
      setNotice(
        op +
          " applied to " +
          result.applied +
          (result.applied === 1 ? " request" : " requests") +
          (result.skipped ? " · " + result.skipped + " skipped" : "") +
          ".",
      );
      refresh();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Could not update the selected requests.");
    } finally {
      setBulkBusy(false);
    }
  }

  const rows = (page?.page ?? []) as Ticket[];
  return (
    <section className="panel stack-panel" aria-labelledby="crm-heading">
      <div className="between">
        <div>
          <h2 id="crm-heading">Support inbox</h2>
          <p className="caption">Triage the queue, assign ownership, and reply without losing your place.</p>
        </div>
      </div>
      <Toolbar>
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
            aria-label="Search support requests"
            placeholder="Topic, email, or message"
          />
          <button className="button quiet">
            <Search size={16} /> Search
          </button>
        </form>
        <select
          aria-label="Support status"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setTrail([]);
          }}
        >
          <option value="all">All statuses</option>
          {Object.entries(ticketStates).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className="button quiet small" onClick={refresh}>
          Refresh
        </button>
      </Toolbar>
      {notice && (
        <p role="status" className="status">
          {notice}
        </p>
      )}
      {selected.length > 0 && (
        <BulkBar
          selected={selected}
          setSelected={setSelected}
          busy={bulkBusy}
          error={bulkError}
          apply={apply}
        />
      )}
      {state?.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : !page ? (
        <Skeleton rows={6} />
      ) : (
        <div className={"inbox" + (active ? " inbox-open" : "")}>
          <div className="inbox-list">
            {rows.length ? (
              <>
                <label className="inbox-list-head">
                  <input
                    type="checkbox"
                    aria-label="Select all requests on this page"
                    checked={rows.every((row) => selected.includes(row.id))}
                    onChange={(event) => {
                      const ids = rows.map((row) => row.id);
                      setSelected(
                        event.target.checked
                          ? [...new Set([...selected, ...ids])]
                          : selected.filter((id) => !ids.includes(id)),
                      );
                    }}
                  />
                  <span className="caption">
                    {rows.length} request{rows.length === 1 ? "" : "s"}
                  </span>
                </label>
                {rows.map((row) => (
                  <TicketRow
                    key={row.id}
                    row={row}
                    active={row.id === active}
                    checked={selected.includes(row.id)}
                    onCheck={(checked) =>
                      setSelected(checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))
                    }
                    onOpen={() => setActive(row.id)}
                  />
                ))}
                {(trail.length > 0 || !page.isDone) && (
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
                      disabled={page.isDone}
                      onClick={() => {
                        if (page) setTrail([...trail, page.continueCursor]);
                      }}
                    >
                      Next page
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState title="Queue is clear" hint="No support requests match this view." />
            )}
          </div>
          <div className="inbox-detail">
            {active ? (
              <ThreadPane key={active} id={active} open={open} back={() => setActive("")} refresh={refresh} />
            ) : (
              <EmptyState
                title="Select a request"
                hint="Pick a request from the queue to read the conversation and reply."
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function TicketList({
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
                    <AssignmentOptions assignable={assignable} />
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
