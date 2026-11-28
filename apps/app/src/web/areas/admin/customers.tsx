import { useMemo, useState, type FormEvent } from "react";
import { Download, Plus } from "lucide-react";
import { Button, Checkbox, cn, Field, Input, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@repo/ui";
import { customersFrom, dateTime, money, postAdjustment, postMachine, shortWallet, type AdminJoin, type CustomerRow } from "./data.ts";
import { ChoiceGroup, Empty, FormError, Panel, Stat, StatusMark, TableFrame, stateTone } from "./ui.tsx";

type Funding = "all" | "funded" | "unfunded";
type CustomerStatus = "all" | "active" | "suspended";

const fundingChoices = [
  { value: "all", label: "All" },
  { value: "funded", label: "Funded" },
  { value: "unfunded", label: "Unfunded" },
] as const;
const statusChoices = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const;
const flagChoices = ["vip", "risk", "watch", "comped"];

function csv(rows: CustomerRow[]) {
  const body = rows.map((row) => [row.id, row.name, row.username, row.joined ? new Date(row.joined).toISOString() : "", row.balance, row.requests, row.spend, row.status].map((value) => JSON.stringify(String(value))).join(","));
  return ["wallet,name,username,joined,balance_micros,requests,spend_micros,status", ...body].join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function matches(row: CustomerRow, query: string) {
  const needle = query.trim().toLowerCase();
  return !needle || [row.id, row.name, row.username].some((value) => value.toLowerCase().includes(needle));
}

function CustomerAvatar({ row }: { row: CustomerRow }) {
  const letters = (row.name || row.username || row.id).slice(0, 2).toUpperCase();
  return <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-micro font-medium text-secondary-foreground" aria-hidden="true">{letters}</span>;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1 border-b border-border px-4 py-3 last:border-0 sm:grid-cols-[9rem_1fr]"><dt className="text-meta text-muted-foreground">{label}</dt><dd className="min-w-0 text-ui text-foreground">{children}</dd></div>;
}

function CustomerDetail({ row, join, wallet, close }: { row: CustomerRow; join: AdminJoin; wallet: string; close: () => void }) {
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const crm = join.crm;
  const activities = (crm?.activities ?? []).filter((item) => item.account === row.id).sort((a, b) => b.time - a.time);
  const tasks = (crm?.tasks ?? []).filter((item) => item.account === row.id).sort((a, b) => (a.doneAt - b.doneAt) || (a.dueAt - b.dueAt));
  const flags = (crm?.flags ?? []).filter((item) => item.account === row.id);
  const usage = (join.usage?.rows ?? []).filter((item) => item.wallet === row.id).sort((a, b) => b.time - a.time).slice(0, 8);
  const tickets = (join.support?.tickets ?? []).filter((item) => item.wallet === row.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const entries = (join.billing?.entries ?? []).filter((item) => item.wallet === row.id).slice(-8).reverse();

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "action failed");
    } finally {
      setBusy(false);
    }
  }

  function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    void run(async () => {
      await postMachine("admin-crm", { type: "addNote", id: crypto.randomUUID(), account: row.id, actor: wallet, note: note.trim(), now: Date.now() });
      setNote("");
    });
  }

  function submitTask(event: FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    void run(async () => {
      const dueAt = taskDue ? new Date(taskDue).getTime() : 0;
      await postMachine("admin-crm", { type: "createTask", id: crypto.randomUUID(), activityId: crypto.randomUUID(), account: row.id, assignee: wallet, creator: wallet, title: taskTitle.trim(), dueAt, summary: `Follow-up created for ${shortWallet(row.id)}`, now: Date.now() });
      setTaskTitle("");
      setTaskDue("");
    });
  }

  function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars === 0 || !reason.trim()) return;
    void run(async () => {
      await postAdjustment({ account: row.id, delta: Math.round(dollars * 1_000_000), reason: reason.trim() });
      setAmount("");
      setReason("");
    });
  }

  function toggleFlag(flag: string) {
    void run(async () => {
      const existing = flags.some((item) => item.flag === flag);
      await postMachine("admin-crm", existing
        ? { type: "removeFlag", activityId: crypto.randomUUID(), account: row.id, flag, admin: wallet, summary: `Removed ${flag}`, now: Date.now() }
        : { type: "setFlag", activityId: crypto.randomUUID(), account: row.id, flag, note: "", admin: wallet, summary: `Flagged ${flag}`, now: Date.now() });
    });
  }

  return (
    <Panel
      title={row.name || row.username || shortWallet(row.id)}
      aside={<Button type="button" variant="ghost" size="sm" onClick={close}>Close</Button>}
      className="xl:sticky xl:top-4"
    >
      <dl>
        <DetailRow label="Wallet"><span className="break-all font-mono text-meta">{row.id}</span></DetailRow>
        <DetailRow label="Status"><StatusMark tone={stateTone(row.status)}>{row.status}</StatusMark></DetailRow>
        <DetailRow label="Balance">{money(row.balance)}</DetailRow>
        <DetailRow label="Joined">{dateTime(row.joined)}</DetailRow>
        <DetailRow label="Flags">
          <span className="flex flex-wrap gap-2">
            {flagChoices.map((flag) => (
              <Button key={flag} type="button" size="sm" variant={flags.some((item) => item.flag === flag) ? "secondary" : "outline"} disabled={busy} onClick={() => toggleFlag(flag)}>{flag}</Button>
            ))}
          </span>
        </DetailRow>
      </dl>

      <div className="border-t border-border px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={row.status === "Suspended" ? "secondary" : "destructive"} disabled={busy} onClick={() => void run(async () => postMachine("admin", { type: row.status === "Suspended" ? "reinstate" : "suspend", id: row.id, at: Date.now() }))}>
            {row.status === "Suspended" ? "Reinstate" : "Suspend"}
          </Button>
        </div>
        <FormError message={error} />
      </div>

      <div className="grid gap-4 border-t border-border px-4 py-4">
        <form onSubmit={submitNote} className="grid gap-2">
          <Field label="Internal note" control={(props) => <Textarea {...props} value={note} onChange={(event) => setNote(event.target.value)} rows={3} />} />
          <Button type="submit" size="sm" disabled={busy || !note.trim()} className="justify-self-start">Add note</Button>
        </form>
        <form onSubmit={submitTask} className="grid gap-2">
          <Field label="Follow-up" control={(props) => <Input {...props} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="What needs follow-up?" />} />
          <Field label="Due" control={(props) => <Input {...props} type="datetime-local" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} />} />
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !taskTitle.trim()} className="justify-self-start"><Plus size={14} aria-hidden="true" />Create follow-up</Button>
        </form>
        <form onSubmit={submitAdjustment} className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Adjustment dollars" control={(props) => <Input {...props} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25 or -10" />} />
            <Field label="Reason" control={(props) => <Input {...props} value={reason} onChange={(event) => setReason(event.target.value)} />} />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !amount || !reason.trim()} className="justify-self-start">Post adjustment</Button>
        </form>
      </div>

      <div className="border-t border-border">
        <h3 className="px-4 pt-4 text-ui font-medium">Follow-ups</h3>
        {tasks.length === 0 ? <Empty title="No follow-ups" /> : tasks.slice(0, 5).map((task) => (
          <div key={task.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
            <Checkbox checked={task.doneAt !== 0} disabled={busy} aria-label={task.doneAt ? `Reopen ${task.title}` : `Complete ${task.title}`} onCheckedChange={() => void run(async () => postMachine("admin-crm", task.doneAt ? { type: "reopenTask", id: task.id } : { type: "completeTask", id: task.id, now: Date.now() }))} />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-ui", task.doneAt ? "text-muted-foreground line-through" : "text-foreground")}>{task.title}</p>
              <p className="text-meta text-muted-foreground">due {dateTime(task.dueAt)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-0 border-t border-border lg:grid-cols-2">
        <div>
          <h3 className="px-4 pt-4 text-ui font-medium">Activity</h3>
          {activities.length === 0 ? <Empty title="No CRM activity" /> : activities.slice(0, 6).map((item) => <p key={item.id} className="border-b border-border px-4 py-2 text-meta text-muted-foreground last:border-0">{item.note} · {dateTime(item.time)}</p>)}
        </div>
        <div>
          <h3 className="px-4 pt-4 text-ui font-medium">Recent requests</h3>
          {usage.length === 0 ? <Empty title="No requests" /> : usage.map((item) => <p key={item.id} className="border-b border-border px-4 py-2 text-meta text-muted-foreground last:border-0">{item.model} · {item.status} · {money(item.cost)}</p>)}
        </div>
        <div>
          <h3 className="px-4 pt-4 text-ui font-medium">Support history</h3>
          {tickets.length === 0 ? <Empty title="No support tickets" /> : tickets.slice(0, 5).map((item) => <p key={item.id} className="border-b border-border px-4 py-2 text-meta text-muted-foreground last:border-0">{item.topic} · {item.state}</p>)}
        </div>
        <div>
          <h3 className="px-4 pt-4 text-ui font-medium">Ledger</h3>
          {entries.length === 0 ? <Empty title="No ledger entries" /> : entries.map((item) => <p key={`${item.detail}-${item.kind}-${item.amount}`} className="border-b border-border px-4 py-2 text-meta text-muted-foreground last:border-0">{item.kind} · {money(item.amount)} · {item.detail}</p>)}
        </div>
      </div>
    </Panel>
  );
}

export function AdminCustomers({ join, wallet }: { join: AdminJoin; wallet: string }) {
  const [query, setQuery] = useState("");
  const [funding, setFunding] = useState<Funding>("all");
  const [status, setStatus] = useState<CustomerStatus>("all");
  const [selected, setSelected] = useState<CustomerRow | undefined>();
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState("");
  const rows = useMemo(() => customersFrom(join).filter((row) => matches(row, query)
    && (funding === "all" || (funding === "funded") === row.funded)
    && (status === "all" || (status === "active") === (row.status === "Active"))), [join, query, funding, status]);
  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);

  function toggleChecked(id: string, value: boolean) {
    const next = new Set(checked);
    if (value) next.add(id); else next.delete(id);
    setChecked(next);
  }

  async function bulkFlag(flag: string, now: number) {
    setError("");
    try {
      for (const account of checked) {
        await postMachine("admin-crm", { type: "setFlag", activityId: crypto.randomUUID(), account, flag, note: "", admin: wallet, summary: `Flagged ${flag}`, now });
      }
      setChecked(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "bulk flag failed");
    }
  }

  return (
    <div className={cn("grid gap-5", selected && "xl:grid-cols-[minmax(0,1fr)_24rem]")}>
      <div className="grid min-w-0 gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Customers" value={rows.length.toLocaleString()} hint={`${rows.filter((row) => row.active).length} activated`} />
          <Stat label="Visible balance" value={money(totalBalance)} hint={`${rows.filter((row) => row.funded).length} funded`} />
          <Stat label="Visible inference spend" value={money(totalSpend)} hint={`${rows.reduce((sum, row) => sum + row.requests, 0).toLocaleString()} requests`} />
        </div>

        <Panel>
          <div className="grid gap-3 border-b border-border px-4 py-3 xl:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallet, name, or username" aria-label="Search customers" />
            <ChoiceGroup label="Funding" value={funding} choices={fundingChoices} onChange={setFunding} />
            <ChoiceGroup label="Status" value={status} choices={statusChoices} onChange={setStatus} />
            <Button type="button" variant="outline" size="sm" onClick={() => download("sonnely-customers.csv", csv(rows))}><Download size={14} aria-hidden="true" />CSV</Button>
          </div>
          {checked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2">
              <span className="text-meta text-muted-foreground">{checked.size} selected</span>
              {flagChoices.map((flag) => <Button key={flag} type="button" size="sm" variant="outline" onClick={() => void bulkFlag(flag, Date.now())}>Flag {flag}</Button>)}
            </div>
          )}
          <FormError message={error} />
          {rows.length === 0 ? <Empty title="No customers match" /> : (
            <TableFrame>
              <TableHeader><TableRow><TableHead><span className="sr-only">Select</span></TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead>Balance</TableHead><TableHead>Requests</TableHead><TableHead>Spend</TableHead><TableHead>Flags</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 80).map((row) => (
                  <TableRow key={row.id} className={cn("cursor-pointer", selected?.id === row.id && "bg-secondary")} onClick={() => setSelected(row)}>
                    <TableCell onClick={(event) => event.stopPropagation()}><Checkbox checked={checked.has(row.id)} onCheckedChange={(value) => toggleChecked(row.id, value === true)} aria-label={`Select ${row.name || row.id}`} /></TableCell>
                    <TableCell label="Customer">
                      <span className="flex min-w-0 items-center gap-3">
                        <CustomerAvatar row={row} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{row.name || row.username || shortWallet(row.id)}</span>
                          <span className="block truncate font-mono text-meta text-muted-foreground">{shortWallet(row.id)}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell label="Status"><StatusMark tone={stateTone(row.status)}>{row.status}</StatusMark></TableCell>
                    <TableCell label="Balance">{money(row.balance)}</TableCell>
                    <TableCell label="Requests">{row.requests.toLocaleString()}</TableCell>
                    <TableCell label="Spend">{money(row.spend)}</TableCell>
                    <TableCell label="Flags"><span className="flex flex-wrap gap-1">{row.flags.slice(0, 3).map((flag) => <span key={flag} className="rounded-sm bg-secondary px-1.5 py-0.5 text-micro text-secondary-foreground">{flag}</span>)}</span></TableCell>
                    <TableCell label="Joined">{dateTime(row.joined)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableFrame>
          )}
        </Panel>
      </div>
      {selected && <CustomerDetail row={selected} join={join} wallet={wallet} close={() => setSelected(undefined)} />}
    </div>
  );
}
