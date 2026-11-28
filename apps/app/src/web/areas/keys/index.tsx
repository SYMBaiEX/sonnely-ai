// spec/app/keys.md, "Story: Issue a key"
import { ArrowUpRight, KeyRound, Plus } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@repo/ui";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Key, Keys } from "../../../../gen/app__keys.ts";
import { reconnectMachine, useRemote } from "../../remote.ts";
import { ConsoleFrame, useWorkspaceSession } from "../console/frame.tsx";
import { CopyButton, Empty, Failure, WorkspaceHeading, creditBalance, date, day, parseCreditAmount } from "../console/bits.tsx";
import { DataTable, FieldLabel, StatusPill, TextInput, actionRowClass, panelClass } from "../console/ops.tsx";

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
      <FieldLabel>
        Daily cap (USD)
        <TextInput name="daily" type="number" min="0.01" step="0.01" placeholder="Optional" defaultValue={editing && editing.dailyCap !== 0 ? editing.dailyCap / 1_000_000 : ""} />
      </FieldLabel>
      <FieldLabel>
        Lifetime cap (USD)
        <TextInput name="cap" type="number" min="0.01" step="0.01" placeholder="Optional" defaultValue={editing && editing.cap !== 0 ? editing.cap / 1_000_000 : ""} />
      </FieldLabel>
      <FieldLabel>
        Expires (UTC)
        <TextInput name="expires" type="date" min={day(now)} defaultValue={editing && editing.expiresAt !== 0 ? day(editing.expiresAt) : ""} />
      </FieldLabel>
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
    <div className="grid gap-4">
      <WorkspaceHeading icon={KeyRound} title="API keys" description="Issue keys, set spending limits, and revoke access.">
        <Button
          type="button"
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
        </Button>
      </WorkspaceHeading>
      <Failure message={failure || error || ""} />
      {error && <Button type="button" variant="ghost" size="sm" className="w-max" onClick={() => reconnectMachine("workspace-keys")}>Reload keys</Button>}
      <div role="status" className="sr-only">{status}</div>
      {signedIn && !!key && (
        <section className={`${panelClass} flex flex-wrap items-center justify-between gap-4 border-primary/50 bg-primary/10`} aria-label="New API key">
          <div className="grid min-w-0 gap-2">
            <h2 ref={focusHeading} tabIndex={-1} className="text-heading leading-heading font-medium outline-none">Save your new key</h2>
            <p className="text-ui text-muted-foreground">Store it securely. The full key is shown once.</p>
            <code className="w-max max-w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-meta wrap-anywhere">{key}</code>
          </div>
          <div className={actionRowClass}>
            <CopyButton value={key} label="Copy key" quiet={false} />
            <Button type="button" variant="ghost" size="sm" onClick={() => { setKey(""); createButtonRef.current?.focus(); }}>Done</Button>
          </div>
        </section>
      )}
      {signedIn && open && (
        <form className={`${panelClass} grid gap-4`} onSubmit={(event) => void create(event)}>
          <h2 id="key-form-heading" ref={focusHeading} tabIndex={-1} className="text-heading leading-heading font-medium outline-none">Create an API key</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FieldLabel>Name<TextInput name="name" maxLength={60} placeholder="CI, notebook, or app" /></FieldLabel>
            <CapFields now={now} />
          </div>
          <div className={actionRowClass}>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create key"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); createButtonRef.current?.focus(); }} disabled={busy}>Cancel</Button>
          </div>
        </form>
      )}
      {signedIn && editing && (
        <form className={`${panelClass} grid gap-4`} onSubmit={(event) => void update(event)} key={editing.id}>
          <h2 id="key-form-heading" ref={focusHeading} tabIndex={-1} className="text-heading leading-heading font-medium outline-none">Edit {editing.label}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FieldLabel>Name<TextInput name="name" maxLength={60} defaultValue={editing.label} /></FieldLabel>
            <CapFields editing={editing} now={now} />
          </div>
          <div className={actionRowClass}>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
            <Button type="button" variant="ghost" onClick={cancelRowAction} disabled={busy}>Cancel</Button>
          </div>
        </form>
      )}
      {signedIn && revoke && (
        <div className={`${panelClass} flex flex-wrap items-center justify-between gap-4 border-destructive/50 bg-destructive/10`}>
          <div className="grid min-w-0 gap-2">
            <h2 ref={focusHeading} tabIndex={-1} className="text-heading leading-heading font-medium outline-none">Revoke {revoke.label}?</h2>
            <p className="text-ui text-muted-foreground">Clients using this key will lose API access immediately.</p>
          </div>
          <div className={actionRowClass}>
            <Button variant="destructive" type="button" onClick={() => void disable()} disabled={busy}>Revoke key</Button>
            <Button variant="ghost" type="button" onClick={cancelRowAction} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
      <div className={`${panelClass} p-0`}>
        {signedIn && data?.length ? (
          <DataTable
            rows={data}
            rowKey={(item) => item.id}
            ariaLabel="Workspace API keys"
            columns={[
              { label: "Name", header: true, value: (item) => item.label },
              { label: "Key", value: (item) => <code className="font-mono text-meta">{item.prefix}…</code> },
              {
                label: "Status",
                value: (item) => {
                  const expired = item.expiresAt !== 0 && item.expiresAt < now;
                  return (
                    <span className="grid w-max gap-1">
                      <StatusPill tone={item.status === "Revoked" || expired ? "neutral" : "ok"}>{item.status === "Revoked" ? "Revoked" : expired ? "Expired" : "Active"}</StatusPill>
                      {item.expiresAt !== 0 && item.status === "Active" ? <small className="text-meta text-muted-foreground">Expires {date(item.expiresAt)} UTC</small> : null}
                    </span>
                  );
                },
              },
              { label: "Last used", value: (item) => item.lastUsedAt !== 0 ? date(item.lastUsedAt) : "Never" },
              { label: "Created", value: (item) => date(item.createdAt) },
              {
                label: "Daily / total",
                value: (item) => (
                  <span className="grid gap-1">
                    {item.dailyCap !== 0 ? creditBalance(item.dailyCap) : "—"} / {item.cap !== 0 ? creditBalance(item.cap) : "—"}
                    <small className="text-meta text-muted-foreground">Today {creditBalance(item.daySpent)}</small>
                  </span>
                ),
              },
              {
                label: "Actions",
                value: (item) => item.status === "Active" && item.project === "" ? (
                  <span className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${item.label}`} disabled={busy} onClick={(event) => { rowActionRef.current = event.currentTarget; setOpen(false); setKey(""); setRevoke(null); setStatus(""); setEditing(item); setFailure(""); }}>Edit</Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Revoke ${item.label}`} disabled={busy} onClick={(event) => { rowActionRef.current = event.currentTarget; setOpen(false); setKey(""); setEditing(null); setStatus(""); setRevoke(item); }}>Revoke</Button>
                  </span>
                ) : null,
              },
            ]}
          />
        ) : (
          <div className="p-4">
            <Empty title={signedIn && error ? "API keys unavailable" : signedIn && !data ? "Loading keys…" : "No API keys yet"} icon={<KeyRound size={23} />}>
              <p>{!signedIn ? "Connect a Solana wallet to open your workspace." : error ? "Try reloading the list." : data ? "Create a key to call the API from your own client." : "Getting your workspace keys."}</p>
              {signedIn && error ? <Button variant="ghost" size="sm" type="button" onClick={() => reconnectMachine("workspace-keys")}>Reload keys</Button> : <a className="inline-flex items-center gap-1 text-ui text-primary hover:underline" href="/docs/quickstart">Read the quickstart <ArrowUpRight size={15} /></a>}
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Keys") return null;
  return <ConsoleFrame section="Keys"><KeysConsole /></ConsoleFrame>;
}
