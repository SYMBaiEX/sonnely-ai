// spec/app/keys.md, "Story: Issue a key": the console's API key list, create, edit and revoke.
import { ArrowUpRight, KeyRound, Plus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Key, Keys } from "../../../../gen/app__keys.ts";
import { Button, Card, CardTitle, EmptyState, Input, Label } from "@repo/ui";
import { useRemote } from "../../remote.ts";

const day = (time: number) => new Date(time).toISOString().slice(0, 10);
const date = (time: number) => new Date(time).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" });
const usd = (micros: number) => "$" + (micros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2 });

/** Micro-USD from a USD field; "" means no cap, anything else must be at least $0.01. */
const cap = (value: string) => {
  if (!value.trim()) return 0;
  const dollars = Number(value);
  if (!Number.isFinite(dollars)) return 0;
  const micros = Math.round(dollars * 1_000_000);
  return micros >= 10_000 ? micros : -1;
};

const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
function secret() {
  const bytes = crypto.getRandomValues(new Uint8Array(43));
  return "sonnely_live_" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function CapFields({ editing }: { editing?: Key }) {
  return (
    <>
      <Label className="flex flex-col gap-1 text-sm">
        Daily cap (USD)
        <Input
          name="daily"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Optional"
          defaultValue={editing && editing.dailyCap !== 0 ? editing.dailyCap / 1_000_000 : ""}
        />
      </Label>
      <Label className="flex flex-col gap-1 text-sm">
        Lifetime cap (USD)
        <Input
          name="cap"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Optional"
          defaultValue={editing && editing.cap !== 0 ? editing.cap / 1_000_000 : ""}
        />
      </Label>
      <Label className="flex flex-col gap-1 text-sm">
        Expires (UTC)
        <Input
          name="expires"
          type="date"
          min={day(Date.now())}
          defaultValue={editing && editing.expiresAt !== 0 ? day(editing.expiresAt) : ""}
        />
      </Label>
    </>
  );
}

function fields(form: HTMLFormElement) {
  const data = new FormData(form);
  const name = String(data.get("name") ?? "").trim();
  const dailyCap = cap(String(data.get("daily") ?? ""));
  const keyCap = cap(String(data.get("cap") ?? ""));
  const dateValue = String(data.get("expires") ?? "");
  const expiresAt = dateValue ? Date.parse(dateValue + "T23:59:59Z") : 0;
  return { name, dailyCap, cap: keyCap, expiresAt };
}

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Keys") return null;
  return <KeysArea />;
}

function KeysArea() {
  const { state, send, error } = useRemote<Keys>("workspace-keys");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Key>();
  const [revoke, setRevoke] = useState<Key>();
  const [shown, setShown] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const keys = state?.keys ?? [];
  const now = Date.now();
  const today = day(now);

  async function run(event: object, success: () => void, message: string) {
    setBusy(true);
    setFailure("");
    try {
      const ok = await send(event);
      if (ok) success();
      else setFailure(message);
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { name, dailyCap, cap: keyCap, expiresAt } = fields(event.currentTarget);
    if (!name) return setFailure("Name the key."), undefined;
    if (dailyCap < 0 || keyCap < 0) return setFailure("Caps start at $0.01."), undefined;
    const full = secret();
    const hash = await sha256(full);
    await run(
      {
        type: "create",
        id: crypto.randomUUID(),
        label: name,
        prefix: full.slice(0, 20),
        hash,
        project: "",
        scopes: ["inference"],
        cap: keyCap,
        dailyCap,
        expiresAt,
        now: Date.now(),
      },
      () => {
        setShown(full);
        setOpen(false);
      },
      "Could not create the key.",
    );
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const { name, dailyCap, cap: keyCap, expiresAt } = fields(event.currentTarget);
    if (dailyCap < 0 || keyCap < 0) return setFailure("Caps start at $0.01."), undefined;
    await run(
      { type: "update", id: editing.id, label: name || editing.label, cap: keyCap, dailyCap, expiresAt, now: Date.now() },
      () => setEditing(undefined),
      "Could not update the key.",
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <KeyRound size={21} className="text-muted-foreground" aria-hidden />
          <div>
            <h1 className="font-serif text-3xl">API keys</h1>
            <p className="text-sm text-muted-foreground">Issue keys, set spending limits, and revoke access.</p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          aria-expanded={open}
          disabled={busy}
          onClick={() => {
            setEditing(undefined);
            setRevoke(undefined);
            setShown(undefined);
            setOpen((current) => !current);
          }}
        >
          <Plus size={15} aria-hidden /> Create key
        </Button>
      </header>

      {(failure || error) && (
        <p role="alert" className="text-sm text-destructive">
          {failure || error}
        </p>
      )}

      {shown && (
        <Card aria-label="New API key">
          <CardTitle>Save your new key</CardTitle>
          <p className="text-sm text-muted-foreground">Store it securely. The full key is shown once.</p>
          <code className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm break-all">{shown}</code>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(shown)}>
              Copy key
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShown(undefined)}>
              Done
            </Button>
          </div>
        </Card>
      )}

      {open && (
        <Card asChild>
          <form onSubmit={(event) => void create(event)} aria-label="Create an API key">
            <CardTitle>Create an API key</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Label className="flex flex-col gap-1 text-sm">
                Name
                <Input name="name" maxLength={60} placeholder="CI, notebook, or app" required />
              </Label>
              <CapFields />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={busy}>
                Create key
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {editing && (
        <Card asChild>
          <form onSubmit={(event) => void update(event)} aria-label={`Edit ${editing.label}`}>
            <CardTitle>Edit {editing.label}</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Label className="flex flex-col gap-1 text-sm">
                Name
                <Input name="name" maxLength={60} defaultValue={editing.label} />
              </Label>
              <CapFields editing={editing} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={busy}>
                Save changes
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(undefined)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {revoke && (
        <Card>
          <CardTitle>Revoke {revoke.label}?</CardTitle>
          <p className="text-sm text-muted-foreground">Clients using this key will lose API access immediately.</p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              loading={busy}
              onClick={() =>
                void run({ type: "revoke", id: revoke.id }, () => setRevoke(undefined), "Could not revoke the key.")
              }
            >
              Revoke key
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRevoke(undefined)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-0">
        {keys.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Workspace API keys">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {["Name", "Key", "Status", "Last used", "Created", "Daily / total", "Actions"].map((label) => (
                    <th scope="col" className="px-4 py-3 font-medium" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((item) => {
                  const expired = item.expiresAt !== 0 && item.expiresAt < now;
                  return (
                    <tr className="border-b border-border last:border-0" key={item.id}>
                      <th scope="row" className="px-4 py-3 text-left font-medium">
                        {item.label}
                      </th>
                      <td className="px-4 py-3">
                        <code className="font-mono text-xs">{item.prefix}…</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          {item.status === "Revoked" ? "Revoked" : expired ? "Expired" : "Active"}
                        </span>
                        {item.expiresAt !== 0 && item.status === "Active" ? (
                          <small className="block text-xs text-muted-foreground">Expires {date(item.expiresAt)} UTC</small>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{item.lastUsedAt !== 0 ? date(item.lastUsedAt) : "Never"}</td>
                      <td className="px-4 py-3">{date(item.createdAt)}</td>
                      <td className="px-4 py-3">
                        {item.dailyCap !== 0 ? usd(item.dailyCap) : "—"} / {item.cap !== 0 ? usd(item.cap) : "—"}
                        <small className="block text-xs text-muted-foreground">Today {usd(item.daySpent)}</small>
                      </td>
                      <td className="px-4 py-3">
                        {item.status === "Active" && item.project === "" && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${item.label}`}
                              disabled={busy}
                              onClick={() => {
                                setOpen(false);
                                setShown(undefined);
                                setRevoke(undefined);
                                setEditing(item);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Revoke ${item.label}`}
                              disabled={busy}
                              onClick={() => {
                                setOpen(false);
                                setShown(undefined);
                                setEditing(undefined);
                                setRevoke(item);
                              }}
                            >
                              Revoke
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={state === undefined ? "Loading keys…" : "No API keys to show"} icon={<KeyRound size={23} />}>
            <p className="text-sm text-muted-foreground">
              {state === undefined ? "Getting your workspace keys." : "Create a key to call the API from your own client."}
            </p>
            <a className="inline-flex items-center gap-1 text-sm underline" href="/docs/quickstart">
              Read the quickstart <ArrowUpRight size={15} />
            </a>
          </EmptyState>
        )}
      </Card>
    </main>
  );
}
