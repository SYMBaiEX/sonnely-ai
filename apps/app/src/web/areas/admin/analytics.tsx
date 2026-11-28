import { useMemo, useState } from "react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { customersFrom, dayKey, money, type AdminJoin } from "./data.ts";
import { ChoiceGroup, Empty, Panel, Stat, TableFrame } from "./ui.tsx";

type Range = "7" | "30" | "90";
const ranges = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

function BarSeries({ rows, value }: { rows: { day: string; requests: number; spend: number; signups: number; deposits: number }[]; value: "requests" | "spend" | "signups" | "deposits" }) {
  const max = Math.max(1, ...rows.map((row) => row[value]));
  return (
    <div className="flex h-36 items-end gap-1 px-4 py-4" role="img" aria-label={`${value} by day`}>
      {rows.map((row) => (
        <div key={row.day} className="group relative flex h-full min-w-1 flex-1 items-end">
          <div className="w-full rounded-t-sm bg-primary transition-colors group-hover:bg-accent" style={{ height: `${Math.max(3, (row[value] / max) * 100)}%` }} />
          <span className="sr-only">{row.day}: {value === "spend" || value === "deposits" ? money(row[value]) : row[value]}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminAnalytics({ join }: { join: AdminJoin }) {
  const [range, setRange] = useState<Range>("30");
  const days = Number(range);
  const rows = useMemo(() => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - days + 1);
    return Array.from({ length: days }, (_, index) => {
      const at = new Date(start);
      at.setUTCDate(start.getUTCDate() + index);
      const key = dayKey(at.getTime());
      const usage = (join.usage?.rows ?? []).filter((row) => dayKey(row.time) === key);
      const signups = customersFrom(join).filter((row) => row.joined && dayKey(row.joined) === key).length;
      const deposits = (join.deposits?.intents ?? []).filter((row) => row.status.tag === "Finalized" && dayKey(row.createdAt) === key);
      return { day: key, requests: usage.length, spend: usage.filter((row) => row.status === "Complete").reduce((sum, row) => sum + row.cost, 0), signups, deposits: deposits.reduce((sum, row) => sum + row.atomic, 0) };
    });
  }, [join, days]);
  const totals = rows.reduce((sum, row) => ({ requests: sum.requests + row.requests, spend: sum.spend + row.spend, signups: sum.signups + row.signups, deposits: sum.deposits + row.deposits }), { requests: 0, spend: 0, signups: 0, deposits: 0 });
  const topModels = [...Map.groupBy(join.usage?.rows ?? [], (row) => row.model)].map(([model, rows]) => ({ model, count: rows.length, spend: rows.reduce((sum, row) => sum + row.cost, 0) })).sort((a, b) => b.count - a.count).slice(0, 8);
  const providerRows = [...Map.groupBy(join.usage?.rows ?? [], (row) => row.provider)].map(([provider, rows]) => ({ provider, count: rows.length, spend: rows.reduce((sum, row) => sum + row.cost, 0) })).sort((a, b) => b.count - a.count);
  const customers = customersFrom(join).sort((a, b) => b.spend - a.spend).slice(0, 8);

  return (
    <div className="grid gap-5">
      <div className="flex justify-end"><ChoiceGroup label="Range" value={range} choices={ranges} onChange={setRange} /></div>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Requests" value={totals.requests.toLocaleString()} />
        <Stat label="Inference spend" value={money(totals.spend)} />
        <Stat label="Signups" value={totals.signups.toLocaleString()} />
        <Stat label="Deposits" value={money(totals.deposits)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Requests by UTC day">{rows.some((row) => row.requests) ? <BarSeries rows={rows} value="requests" /> : <Empty title="No requests in range" />}</Panel>
        <Panel title="Spend by UTC day">{rows.some((row) => row.spend) ? <BarSeries rows={rows} value="spend" /> : <Empty title="No spend in range" />}</Panel>
        <Panel title="Signups by UTC day">{rows.some((row) => row.signups) ? <BarSeries rows={rows} value="signups" /> : <Empty title="No signups in range" />}</Panel>
        <Panel title="Deposits by UTC day">{rows.some((row) => row.deposits) ? <BarSeries rows={rows} value="deposits" /> : <Empty title="No deposits in range" />}</Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Top models"><TableFrame><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Requests</TableHead><TableHead>Spend</TableHead></TableRow></TableHeader><TableBody>{topModels.map((row) => <TableRow key={row.model}><TableCell label="Model">{row.model}</TableCell><TableCell label="Requests">{row.count}</TableCell><TableCell label="Spend">{money(row.spend)}</TableCell></TableRow>)}</TableBody></TableFrame></Panel>
        <Panel title="Provider split"><TableFrame><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Requests</TableHead><TableHead>Spend</TableHead></TableRow></TableHeader><TableBody>{providerRows.map((row) => <TableRow key={row.provider}><TableCell label="Provider">{row.provider}</TableCell><TableCell label="Requests">{row.count}</TableCell><TableCell label="Spend">{money(row.spend)}</TableCell></TableRow>)}</TableBody></TableFrame></Panel>
        <Panel title="Top customers"><TableFrame><TableHeader><TableRow><TableHead>Wallet</TableHead><TableHead>Requests</TableHead><TableHead>Spend</TableHead></TableRow></TableHeader><TableBody>{customers.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-meta" label="Wallet">{row.id.slice(0, 4)}…{row.id.slice(-4)}</TableCell><TableCell label="Requests">{row.requests}</TableCell><TableCell label="Spend">{money(row.spend)}</TableCell></TableRow>)}</TableBody></TableFrame></Panel>
      </div>
    </div>
  );
}
