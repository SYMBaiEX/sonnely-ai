import { AlertTriangle, ArrowRight, CircleDollarSign, Clock3, LifeBuoy, UserCheck } from "lucide-react";
import { Button, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { customersFrom, dateTime, money, shortWallet, type AdminJoin } from "./data.ts";
import { Empty, Panel, Stat, StatusMark, TableFrame, stateTone } from "./ui.tsx";

const dayMs = 24 * 60 * 60 * 1000;

function percent(part: number, whole: number) {
  return whole === 0 ? "0%" : Math.round((part / whole) * 100) + "%";
}

export function AdminOverview({ join, wallet }: { join: AdminJoin; wallet: string }) {
  const customers = customersFrom(join);
  const tasks = join.crm?.tasks ?? [];
  const tickets = join.support?.tickets ?? [];
  const usage = join.usage?.rows ?? [];
  const now = Math.max(0, ...tasks.map((row) => row.createdAt), ...usage.map((row) => row.time), ...customers.map((row) => row.joined));
  const overdue = tasks.filter((row) => row.doneAt === 0 && row.dueAt !== 0 && row.dueAt < now);
  const mineDue = tasks.filter((row) => row.doneAt === 0 && row.assignee === wallet && row.dueAt !== 0 && row.dueAt < now + dayMs);
  const unassigned = tickets.filter((row) => row.state !== "Resolved" && !row.assignedTo);
  const failed = usage.filter((row) => row.status === "Failed" && row.time > now - dayMs);
  const negative = customers.filter((row) => row.balance < 0);
  const weekUsage = usage.filter((row) => row.time > now - 7 * dayMs);
  const complete = weekUsage.filter((row) => row.status === "Complete");
  const spend = complete.reduce((sum, row) => sum + row.cost, 0);
  const signups = customers.filter((row) => row.joined > now - 7 * dayMs);
  const deposits = (join.deposits?.intents ?? []).filter((row) => row.status.tag === "Finalized");
  const depositTotal = deposits.reduce((sum, row) => sum + row.atomic, 0);
  const modelRows = [...Map.groupBy(weekUsage, (row) => row.model)].map(([model, rows]) => ({ model, rows })).sort((a, b) => b.rows.length - a.rows.length).slice(0, 6);
  const attention = [
    ...overdue.slice(0, 3).map((row) => ({ id: row.id, tone: "warn" as const, title: row.title, detail: `Follow-up due ${dateTime(row.dueAt)}`, href: "/console/admin/customers" })),
    ...unassigned.slice(0, 3).map((row) => ({ id: row.id, tone: "info" as const, title: row.topic, detail: "Unassigned support request", href: "/console/admin/support" })),
    ...negative.slice(0, 2).map((row) => ({ id: row.id, tone: "error" as const, title: shortWallet(row.id), detail: `${money(row.balance)} balance needs recovery`, href: "/console/admin/customers" })),
  ];

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Requests · 7d" value={weekUsage.length.toLocaleString()} hint={`${complete.length} completed`} />
        <Stat label="Inference spend · 7d" value={money(spend)} hint={`${usage.length.toLocaleString()} lifetime requests`} />
        <Stat label="New customers · 7d" value={signups.length.toLocaleString()} hint={`${percent(signups.filter((row) => row.funded).length, signups.length)} funded`} />
        <Stat label="Finalized deposits" value={money(depositTotal)} hint={`${deposits.length.toLocaleString()} deposits`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Needs action" aside={<span className="text-meta text-muted-foreground">{attention.length} open</span>}>
          {attention.length === 0 ? <Empty title="Nothing needs immediate action" /> : (
            <div className="divide-y divide-border">
              {attention.map((item) => (
                <a key={item.id} href={item.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                  {item.tone === "error" ? <CircleDollarSign size={17} className="text-destructive" aria-hidden="true" /> : item.tone === "info" ? <LifeBuoy size={17} className="text-info" aria-hidden="true" /> : <AlertTriangle size={17} className="text-warn" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-medium text-foreground">{item.title}</span>
                    <span className="block truncate text-meta text-muted-foreground">{item.detail}</span>
                  </span>
                  <ArrowRight size={15} className="text-muted-foreground" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="My follow-ups">
          {mineDue.length === 0 ? <Empty title="No follow-ups due" /> : (
            <div className="divide-y divide-border">
              {mineDue.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                  <Clock3 size={16} className="mt-0.5 text-warn" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-ui font-medium text-foreground">{task.title}</p>
                    <p className="text-meta text-muted-foreground">{shortWallet(task.account)} · due {dateTime(task.dueAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Customer activation">
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-3">
            {[
              { label: "signed up", value: signups.length, icon: UserCheck },
              { label: "funded", value: signups.filter((row) => row.funded).length, icon: CircleDollarSign },
              { label: "activated", value: signups.filter((row) => row.active).length, icon: UserCheck },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-md border border-border bg-muted px-3 py-3">
                <Icon size={16} className="text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 text-heading font-medium tracking-heading">{value}</p>
                <p className="text-meta text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent failures" aside={<Button asChild variant="outline" size="sm"><a href="/console/admin/traces">Open traces</a></Button>}>
          {failed.length === 0 ? <Empty title="No failed requests in the last day" /> : (
            <TableFrame>
              <TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Customer</TableHead><TableHead>Model</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
              <TableBody>
                {failed.slice(0, 6).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-meta" label="Request">{row.id.slice(0, 10)}</TableCell>
                    <TableCell className="font-mono text-meta" label="Customer">{shortWallet(row.wallet)}</TableCell>
                    <TableCell label="Model">{row.model}</TableCell>
                    <TableCell label="Status"><StatusMark tone={stateTone(row.status)}>{row.status}</StatusMark></TableCell>
                    <TableCell label="Time">{dateTime(row.time)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableFrame>
          )}
        </Panel>
      </div>

      <Panel title="Inference by model · 7d">
        {modelRows.length === 0 ? <Empty title="No inference activity yet" /> : (
          <TableFrame>
            <TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Requests</TableHead><TableHead>Completed</TableHead><TableHead>Spend</TableHead><TableHead>Median latency</TableHead></TableRow></TableHeader>
            <TableBody>
              {modelRows.map(({ model, rows }) => {
                const done = rows.filter((row) => row.status === "Complete");
                const latencies = done.map((row) => row.providerMs).sort((a, b) => a - b);
                return (
                  <TableRow key={model}>
                    <TableCell label="Model">{model}</TableCell>
                    <TableCell label="Requests">{rows.length.toLocaleString()}</TableCell>
                    <TableCell label="Completed">{done.length.toLocaleString()}</TableCell>
                    <TableCell label="Spend">{money(done.reduce((sum, row) => sum + row.cost, 0))}</TableCell>
                    <TableCell label="Median latency">{latencies.length ? `${latencies[Math.floor(latencies.length / 2)].toLocaleString()} ms` : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </TableFrame>
        )}
      </Panel>
    </div>
  );
}
