import { useMemo, useState, type FormEvent } from "react";
import { Button, Checkbox, cn, Field, Input, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@repo/ui";
import { dateTime, postMachine, shortWallet, type AdminJoin, type Tickets } from "./data.ts";
import { ChoiceGroup, Empty, FormError, Panel, StatusMark, TableFrame, stateLabel, stateTone } from "./ui.tsx";

type Ticket = Tickets["tickets"][number];
type Filter = "all" | "Open" | "InProgress" | "Resolved";

const filters = [
  { value: "all", label: "All" },
  { value: "Open", label: "Open" },
  { value: "InProgress", label: "In progress" },
  { value: "Resolved", label: "Resolved" },
] as const;

function matches(ticket: Ticket, query: string) {
  const needle = query.trim().toLowerCase();
  return !needle || [ticket.topic, ticket.email, ticket.message, ticket.id].some((value) => value.toLowerCase().includes(needle));
}

function TicketDetail({ ticket, join, wallet }: { ticket: Ticket; join: AdminJoin; wallet: string }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const operators = join.registry.ops.roster.filter((row) => row.role !== "Member");

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "support action failed");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    void run(async () => {
      await postMachine("support", { type: "staffReply", id: ticket.id, body: body.trim(), visibility: internal ? "Internal" : "Public", author: wallet, now: Date.now() });
      setBody("");
    });
  }

  return (
    <Panel title={ticket.topic}>
      <div className="grid gap-2 border-b border-border px-4 py-3 text-meta text-muted-foreground">
        <p>{ticket.email} · opened {dateTime(ticket.openedAt)}</p>
        {ticket.wallet && <p className="font-mono">{shortWallet(ticket.wallet)}</p>}
        <StatusMark tone={stateTone(ticket.state)}>{stateLabel(ticket.state)}</StatusMark>
      </div>
      <div className="max-h-96 overflow-y-auto px-4 py-3">
        <div className="rounded-md bg-muted px-3 py-2 text-ui text-foreground">{ticket.message}</div>
        {ticket.replies.map((reply) => (
          <div key={`${reply.time}-${reply.body.slice(0, 20)}`} className={cn("mt-3 rounded-md border px-3 py-2", reply.visibility === "Internal" ? "border-warn bg-muted" : "border-border bg-card")}>
            <p className="text-micro uppercase tracking-micro text-muted-foreground">{reply.author === "Staff" ? "Staff" : "Customer"}{reply.visibility === "Internal" ? " · internal" : ""} · {dateTime(reply.time)}</p>
            <p className="mt-1 whitespace-pre-wrap text-ui text-foreground">{reply.body}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 border-t border-border px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => postMachine("support", { type: "assignOwner", id: ticket.id, wallet, now: Date.now() }))}>Assign me</Button>
          {operators.filter((row) => row.wallet !== wallet).slice(0, 3).map((operator) => (
            <Button key={operator.wallet} type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => postMachine("support", { type: "assignOwner", id: ticket.id, wallet: operator.wallet, now: Date.now() }))}>{shortWallet(operator.wallet)}</Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["Open", "InProgress", "Resolved"] as const).map((state) => (
            <Button key={state} type="button" size="sm" variant={ticket.state === state ? "secondary" : "outline"} disabled={busy} onClick={() => void run(async () => postMachine("support", { type: "setState", id: ticket.id, status: state, now: Date.now() }))}>{stateLabel(state)}</Button>
          ))}
        </div>
        <form onSubmit={submit} className="grid gap-2">
          <Field label={internal ? "Internal reply" : "Public reply"} control={(props) => <Textarea {...props} rows={4} value={body} onChange={(event) => setBody(event.target.value)} />} />
          <label className="flex items-center gap-2 text-ui text-muted-foreground"><Checkbox checked={internal} onCheckedChange={(value) => setInternal(value === true)} />Internal only</label>
          <Button type="submit" size="sm" disabled={busy || !body.trim()} className="justify-self-start">Send reply</Button>
        </form>
        <FormError message={error} />
      </div>
    </Panel>
  );
}

export function AdminSupport({ join, wallet, full }: { join: AdminJoin; wallet: string; full: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState("");
  const rows = useMemo(() => (join.support?.tickets ?? []).filter((ticket) => (filter === "all" || ticket.state === filter) && matches(ticket, query)).sort((a, b) => b.updatedAt - a.updatedAt), [join, filter, query]);
  const selected = rows.find((ticket) => ticket.id === selectedId) ?? rows[0];

  function toggle(id: string, value: boolean) {
    const next = new Set(checked);
    if (value) next.add(id); else next.delete(id);
    setChecked(next);
  }

  async function bulk(event: "resolve" | "assign" | "unassign") {
    setError("");
    try {
      for (const id of checked) {
        await postMachine("support", event === "resolve"
          ? { type: "setState", id, status: "Resolved", now: Date.now() }
          : { type: "assignOwner", id, wallet: event === "assign" ? wallet : "", now: Date.now() });
      }
      setChecked(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "bulk update failed");
    }
  }

  return (
    <div className={cn("grid gap-5", full ? "xl:grid-cols-[minmax(0,1fr)_26rem]" : "")}>
      <Panel className="min-w-0">
        <div className="grid gap-3 border-b border-border px-4 py-3 lg:grid-cols-[minmax(12rem,1fr)_auto]">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topic, email, or message" aria-label="Search support tickets" />
          <ChoiceGroup label="Ticket state" value={filter} choices={filters} onChange={setFilter} />
        </div>
        {checked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2">
            <span className="text-meta text-muted-foreground">{checked.size} selected</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void bulk("assign")}>Assign me</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void bulk("unassign")}>Unassign</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void bulk("resolve")}>Resolve</Button>
          </div>
        )}
        <FormError message={error} />
        {rows.length === 0 ? <Empty title="No tickets match" /> : (
          <TableFrame>
            <TableHeader><TableRow><TableHead><span className="sr-only">Select</span></TableHead><TableHead>Topic</TableHead><TableHead>State</TableHead><TableHead>Owner</TableHead><TableHead>Customer</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.slice(0, 80).map((ticket) => (
                <TableRow key={ticket.id} className={cn("cursor-pointer", selected?.id === ticket.id && "bg-secondary")} onClick={() => setSelectedId(ticket.id)}>
                  <TableCell onClick={(event) => event.stopPropagation()}><Checkbox checked={checked.has(ticket.id)} onCheckedChange={(value) => toggle(ticket.id, value === true)} aria-label={`Select ${ticket.topic}`} /></TableCell>
                  <TableCell label="Topic"><span className="block w-full max-w-56 truncate font-medium text-foreground">{ticket.topic}</span><span className="block w-full max-w-56 truncate text-meta text-muted-foreground">{ticket.message}</span></TableCell>
                  <TableCell label="State"><StatusMark tone={stateTone(ticket.state)}>{stateLabel(ticket.state)}</StatusMark></TableCell>
                  <TableCell className="font-mono text-meta" label="Owner">{ticket.assignedTo ? shortWallet(ticket.assignedTo) : "—"}</TableCell>
                  <TableCell label="Customer">{ticket.email}</TableCell>
                  <TableCell label="Updated">{dateTime(ticket.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableFrame>
        )}
      </Panel>
      {selected && <TicketDetail key={selected.id} ticket={selected} join={join} wallet={wallet} />}
    </div>
  );
}
