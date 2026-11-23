"use client";

import { useState, type FormEvent } from "react";
import { shorten } from "@/lib/models";
import { request } from "../wallet";
import {
  localTime,
  ticketStates,
  useCrm,
  type OperatorOption,
  type Thread,
  type Ticket,
} from "./shared";

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
