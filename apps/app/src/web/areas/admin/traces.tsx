import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Button, cn, Input, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { dateTime, money, shortWallet, type AdminJoin, type UsageRow } from "./data.ts";
import { ChoiceGroup, Empty, Panel, StatusMark, TableFrame, stateTone } from "./ui.tsx";

type StatusFilter = "all" | UsageRow["status"];
type ProviderFilter = "all" | UsageRow["provider"];

const statusChoices = [
  { value: "all", label: "All" },
  { value: "Complete", label: "Complete" },
  { value: "Pending", label: "Pending" },
  { value: "Failed", label: "Failed" },
  { value: "Unreported", label: "Unreported" },
] as const;
const providerChoices = [
  { value: "all", label: "All" },
  { value: "NearAI", label: "NearAI" },
  { value: "Phala", label: "Phala" },
  { value: "Tinfoil", label: "Tinfoil" },
] as const;

function download(rows: UsageRow[]) {
  const lines = rows.map((row) => [row.id, row.wallet, row.model, row.provider, row.status, row.input, row.output, row.cached, row.cost, row.providerMs, new Date(row.time).toISOString()].map((value) => JSON.stringify(String(value))).join(","));
  const blob = new Blob([["id,wallet,model,provider,status,input,output,cached,cost_micros,provider_ms,time", ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sonnely-traces.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function TraceFacts({ row }: { row: UsageRow }) {
  const facts = [
    ["Wallet", row.wallet],
    ["Key", row.keyName || row.keyId || "—"],
    ["Project", row.project || "—"],
    ["Input tokens", row.input.toLocaleString()],
    ["Output tokens", row.output.toLocaleString()],
    ["Cached tokens", row.cached.toLocaleString()],
    ["Cost", money(row.cost)],
    ["Provider latency", `${row.providerMs.toLocaleString()} ms`],
  ];
  return (
    <TableRow className="bg-muted">
      <TableCell colSpan={8}>
        <dl className="grid gap-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
          {facts.map(([label, value]) => <div key={label}><dt className="text-micro uppercase tracking-micro text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-mono text-meta text-foreground">{value}</dd></div>)}
        </dl>
      </TableCell>
    </TableRow>
  );
}

export function AdminTraces({ join }: { join: AdminJoin }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [openId, setOpenId] = useState("");
  const rows = useMemo(() => (join.usage?.rows ?? [])
    .filter((row) => (status === "all" || row.status === status) && (provider === "all" || row.provider === provider))
    .filter((row) => !query.trim() || [row.id, row.wallet, row.model].some((value) => value.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => b.time - a.time), [join, query, status, provider]);

  return (
    <Panel>
      <div className="grid gap-3 border-b border-border px-4 py-3 xl:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search request, wallet, or model" aria-label="Search traces" />
        <ChoiceGroup label="Trace status" value={status} choices={statusChoices} onChange={setStatus} />
        <ChoiceGroup label="Provider" value={provider} choices={providerChoices} onChange={setProvider} />
        <Button type="button" variant="outline" size="sm" onClick={() => download(rows)}><Download size={14} aria-hidden="true" />CSV</Button>
      </div>
      {rows.length === 0 ? <Empty title="No traces match" /> : (
        <TableFrame>
          <TableHeader><TableRow><TableHead><span className="sr-only">Expand</span></TableHead><TableHead>Request</TableHead><TableHead>Customer</TableHead><TableHead>Model</TableHead><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Cost</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.slice(0, 120).map((row) => (
              <Fragment key={row.id}>
                <TableRow className={cn("cursor-pointer", openId === row.id && "bg-secondary")} onClick={() => setOpenId(openId === row.id ? "" : row.id)}>
                  <TableCell label="Expand"><ChevronDown size={14} className={cn("transition-transform", openId === row.id && "rotate-180")} aria-hidden="true" /></TableCell>
                  <TableCell className="font-mono text-meta" label="Request">{row.id.slice(0, 14)}</TableCell>
                  <TableCell className="font-mono text-meta" label="Customer">{shortWallet(row.wallet)}</TableCell>
                  <TableCell label="Model">{row.model}</TableCell>
                  <TableCell label="Provider">{row.provider}</TableCell>
                  <TableCell label="Status"><StatusMark tone={stateTone(row.status)}>{row.status}</StatusMark></TableCell>
                  <TableCell label="Cost">{money(row.cost)}</TableCell>
                  <TableCell label="Time">{dateTime(row.time)}</TableCell>
                </TableRow>
                {openId === row.id && <TraceFacts row={row} />}
              </Fragment>
            ))}
          </TableBody>
        </TableFrame>
      )}
    </Panel>
  );
}
