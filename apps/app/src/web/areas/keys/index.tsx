/* eslint-disable better-tailwindcss/no-unknown-classes, no-restricted-syntax -- this area intentionally uses the migrated key-management class names and keeps the dialog workflow together */
// spec/app/keys.md, "Story: Issue a key"
import { ArrowUpRight, KeyRound, Plus } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Key, Keys } from "../../../../gen/app__keys.ts";
import { reconnectMachine, useRemote } from "../../remote.ts";
import { ConsoleFrame, useWorkspaceSession } from "../console/frame.tsx";
import { CopyButton, Empty, Failure, WorkspaceHeading, creditBalance, date, day, parseCreditAmount } from "../console/bits.tsx";
import "../console/logs.css";
import "./keys.css";

const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
function secret() {
  const bytes = crypto.getRandomValues(new Uint8Array(43));
  return "sonnely_live_" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function capField(value: FormDataEntryValue | null) {
  const text = (typeof value === "string" ? value : "").trim();
  if (!text) return 0;
  const parsed = parseCreditAmount(text);
  return parsed === null ? -1 : parsed;
}

function formFields(form: HTMLFormElement) {
  const fields = new FormData(form);
  const expires = fields.get("expires");
  return {
    name: (() => { const value = fields.get("name"); return typeof value === "string" ? value.trim() : ""; })(),
    cap: capField(fields.get("cap")),
    dailyCap: capField(fields.get("daily")),
    expiresAt: typeof expires === "string" && expires ? Date.parse(expires + "T23:59:59Z") : 0,
  };
}

function focusHeading(node: HTMLHeadingElement | null) {
  node?.focus();
}

function CapFields({ editing, now }: { editing?: Key; now: number }) {
  return (
    <>
      <label>
        Daily cap (USD)
        <input name="daily" type="number" min="0.01" step="0.01" placeholder="Optional" defaultValue={editing && editing.dailyCap !== 0 ? editing.dailyCap / 1_000_000 : ""} />
      </label>
      <label>
        Lifetime cap (USD)
        <input name="cap" type="number" min="0.01" step="0.01" placeholder="Optional" defaultValue={editing && editing.cap !== 0 ? editing.cap / 1_000_000 : ""} />
      </label>
      <label>
        Expires (UTC)
        <input name="expires" type="date" min={day(now)} defaultValue={editing && editing.expiresAt !== 0 ? day(editing.expiresAt) : ""} />
      </label>
    </>
  );
}

function KeysConsole() {
  const session = useWorkspaceSession();
  const remote = useRemote<Keys>("workspace-keys");
  const { state, error } = remote;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<Key | null>(null);
  const [editing, setEditing] = useState<Key | null>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const rowActionRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState("");
  const signedIn = session.state?.tag === "SignedIn";
  const data = state?.keys;
  const [now] = useState(() => Date.now());

  function cancelRowAction() {
    setEditing(null);
    setRevoke(null);
    rowActionRef.current?.focus();
  }

  function capInvalid(cap: number, dailyCap: number) {
    return cap < 0 || dailyCap < 0;
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formFields(event.currentTarget);
    if (capInvalid(values.cap, values.dailyCap)) {
      setFailure("Caps start at $0.01 and may use at most six decimal places.");
      return;
    }
    setBusy(true);
    setFailure("");
    setKey("");
    try {
      const full = secret();
      const hash = await sha256(full);
      const ok = await remote.send({
        type: "create",
        id: crypto.randomUUID(),
        label: values.name || "Workspace key",
        prefix: full.slice(0, 20),
        hash,
        project: "",
        scopes: ["inference"],
        cap: values.cap,
        dailyCap: values.dailyCap,
        expiresAt: values.expiresAt,
        now: Date.now(),
      });
      if (!ok) throw new Error("Could not create the key.");
      setKey(full);
      setOpen(false);
      setStatus("");
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const values = formFields(event.currentTarget);
    if (capInvalid(values.cap, values.dailyCap)) {
      setFailure("Caps start at $0.01 and may use at most six decimal places.");
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      const ok = await remote.send({
        type: "update",
        id: editing.id,
        label: values.name || editing.label,
        cap: values.cap,
        dailyCap: values.dailyCap,
        expiresAt: values.expiresAt,
        now: Date.now(),
      });
      if (!ok) throw new Error("Could not update the key.");
      setEditing(null);
      setStatus("API key updated.");
      createButtonRef.current?.focus();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Could not update the key.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!revoke) return;
    setBusy(true);
    setFailure("");
    try {
      const ok = await remote.send({ type: "revoke", id: revoke.id });
      if (!ok) throw new Error("Could not revoke the key.");
      setRevoke(null);
      setStatus("API key revoked.");
      createButtonRef.current?.focus();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Could not revoke the key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="telemetry-legacy keys-legacy">
      <WorkspaceHeading icon={KeyRound} title="API keys" description="Issue keys, set spending limits, and revoke access.">
        <button
          type="button"
          className="button accent"
          ref={createButtonRef}
          disabled={!signedIn || busy}
          aria-expanded={open}
          onClick={() => {
            if (open) {
              document.getElementById("key-form-heading")?.focus();
              return;
            }
            setEditing(null);
            setRevoke(null);
            setStatus("");
            setOpen(true);
            setKey("");
            setFailure("");
          }}
        >
          <Plus size={17} /> Create key
        </button>
      </WorkspaceHeading>
      <Failure message={failure || error || ""} />
      {error && <button type="button" className="button quiet" onClick={() => reconnectMachine("workspace-keys")}>Reload keys</button>}
      <div role="status" className="visually-hidden">{status}</div>
      {signedIn && !!key && (
        <section className="panel callout" aria-label="New API key">
          <div>
            <h2 ref={focusHeading} tabIndex={-1}>Save your new key</h2>
            <p>Store it securely. The full key is shown once.</p>
            <code className="secret-code">{key}</code>
          </div>
          <div className="actions">
            <CopyButton value={key} label="Copy key" />
            <button type="button" className="button quiet" onClick={() => { setKey(""); createButtonRef.current?.focus(); }}>Done</button>
          </div>
        </section>
      )}
      {signedIn && open && (
        <form className="panel stack-panel" onSubmit={(event) => void create(event)}>
          <h2 id="key-form-heading" ref={focusHeading} tabIndex={-1}>Create an API key</h2>
          <div className="form-row">
            <label>Name<input name="name" maxLength={60} placeholder="CI, notebook, or app" /></label>
            <CapFields now={now} />
          </div>
          <div className="actions">
            <button type="submit" className="button accent" disabled={busy}>{busy ? "Creating…" : "Create key"}</button>
            <button type="button" className="button quiet" onClick={() => { setOpen(false); createButtonRef.current?.focus(); }} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
      {signedIn && editing && (
        <form className="panel stack-panel" onSubmit={(event) => void update(event)} key={editing.id}>
          <h2 id="key-form-heading" ref={focusHeading} tabIndex={-1}>Edit {editing.label}</h2>
          <div className="form-row">
            <label>Name<input name="name" maxLength={60} defaultValue={editing.label} /></label>
            <CapFields editing={editing} now={now} />
          </div>
          <div className="actions">
            <button type="submit" className="button accent" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            <button type="button" className="button quiet" onClick={cancelRowAction} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
      {signedIn && revoke && (
        <div className="panel callout">
          <div>
            <h2 ref={focusHeading} tabIndex={-1}>Revoke {revoke.label}?</h2>
            <p>Clients using this key will lose API access immediately.</p>
          </div>
          <div className="actions">
            <button className="button danger" type="button" onClick={() => void disable()} disabled={busy}>Revoke key</button>
            <button className="button quiet" type="button" onClick={cancelRowAction} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      <div className="panel key-records">
        {signedIn && data?.length ? (
          <div className="table-wrap">
            <table role="table" aria-label="Workspace API keys">
              <thead role="rowgroup"><tr role="row">{["Name", "Key", "Status", "Last used", "Created", "Daily / total", "Actions"].map((label) => <th role="columnheader" scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody role="rowgroup">
                {data.map((item) => {
                  const expired = item.expiresAt !== 0 && item.expiresAt < now;
                  return (
                    <tr role="row" key={item.id}>
                      <th role="rowheader" scope="row">{item.label}</th>
                      <td role="cell" className="key-record-prefix"><code>{item.prefix}…</code></td>
                      <td role="cell"><span className="key-record-label" aria-hidden="true">Status</span><span className="pill">{item.status === "Revoked" ? "Revoked" : expired ? "Expired" : "Active"}</span>{item.expiresAt !== 0 && item.status === "Active" ? <small className="key-record-expiry">Expires {date(item.expiresAt)} UTC</small> : null}</td>
                      <td role="cell"><span className="key-record-label" aria-hidden="true">Last used</span>{item.lastUsedAt !== 0 ? date(item.lastUsedAt) : "Never"}</td>
                      <td role="cell"><span className="key-record-label" aria-hidden="true">Created</span>{date(item.createdAt)}</td>
                      <td role="cell"><span className="key-record-label" aria-hidden="true">Daily / total cap</span>{item.dailyCap !== 0 ? creditBalance(item.dailyCap) : "—"} / {item.cap !== 0 ? creditBalance(item.cap) : "—"}<small className="key-record-expiry">Today {creditBalance(item.daySpent)}</small></td>
                      <td role="cell" className="key-record-action">
                        {item.status === "Active" && item.project === "" && (
                          <>
                            <button type="button" className="button quiet small" aria-label={`Edit ${item.label}`} disabled={busy} onClick={(event) => { rowActionRef.current = event.currentTarget; setOpen(false); setKey(""); setRevoke(null); setStatus(""); setEditing(item); setFailure(""); }}>Edit</button>
                            <button type="button" className="button quiet small" aria-label={`Revoke ${item.label}`} disabled={busy} onClick={(event) => { rowActionRef.current = event.currentTarget; setOpen(false); setKey(""); setEditing(null); setStatus(""); setRevoke(item); }}>Revoke</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={signedIn && error ? "API keys unavailable" : signedIn && !data ? "Loading keys…" : "No API keys yet"} icon={<KeyRound size={23} />}>
            <p>{!signedIn ? "Connect a Solana wallet to open your workspace." : error ? "Try reloading the list." : data ? "Create a key to call the API from your own client." : "Getting your workspace keys."}</p>
            {signedIn && error ? <button className="button quiet small" type="button" onClick={() => reconnectMachine("workspace-keys")}>Reload keys</button> : <a className="text-link" href="/docs/quickstart">Read the quickstart <ArrowUpRight size={15} /></a>}
          </Empty>
        )}
      </div>
    </div>
  );
}

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Keys") return null;
  return <ConsoleFrame section="Keys"><KeysConsole /></ConsoleFrame>;
}
