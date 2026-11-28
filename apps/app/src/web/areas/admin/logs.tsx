import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, Input, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { dateTime, shortWallet, type AdminJoin } from "./data.ts";
import { ChoiceGroup, Empty, Panel, TableFrame } from "./ui.tsx";

type TimeRange = "all" | "24h" | "7d";
const ranges = [
  { value: "all", label: "All time" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
] as const;

function download(rows: AdminJoin["registry"]["audit"]) {
  const lines = rows.map((row) => [new Date(row.at).toISOString(), row.actor, row.act, row.target, row.summary].map((value) => JSON.stringify(value)).join(","));
  const blob = new Blob([["time,actor,action,target,summary", ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sonnely-admin-log.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminLogs({ join }: { join: AdminJoin }) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<TimeRange>("all");
  const rows = useMemo(() => {
    const newest = Math.max(0, ...join.registry.audit.map((row) => row.at));
    const cutoff = range === "24h" ? newest - 24 * 60 * 60 * 1000 : range === "7d" ? newest - 7 * 24 * 60 * 60 * 1000 : 0;
    const needle = query.trim().toLowerCase();
    return [...join.registry.audit]
      .filter((row) => row.at >= cutoff)
      .filter((row) => !needle || [row.actor, row.act, row.target, row.summary].some((value) => value.toLowerCase().includes(needle)))
      .sort((a, b) => b.at - a.at);
  }, [join, query, range]);

  return (
    <Panel>
      <div className="grid gap-3 border-b border-border px-4 py-3 lg:grid-cols-[minmax(12rem,1fr)_auto_auto]">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, action, target, or summary" aria-label="Search audit logs" />
        <ChoiceGroup label="Time range" value={range} choices={ranges} onChange={setRange} />
        <Button type="button" variant="outline" size="sm" onClick={() => download(rows)}><Download size={14} aria-hidden="true" />CSV</Button>
      </div>
      {rows.length === 0 ? <Empty title="No audit entries match" /> : (
        <TableFrame>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Summary</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.slice(0, 160).map((row) => (
              <TableRow key={`${row.at}-${row.actor}-${row.act}-${row.target}`}>
                <TableCell label="Time">{dateTime(row.at)}</TableCell>
                <TableCell className="font-mono text-meta" label="Actor">{shortWallet(row.actor)}</TableCell>
                <TableCell label="Action">{row.act}</TableCell>
                <TableCell className="font-mono text-meta" label="Target">{shortWallet(row.target)}</TableCell>
                <TableCell label="Summary"><span className="block max-w-xl truncate" title={row.summary}>{row.summary}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableFrame>
      )}
    </Panel>
  );
}
