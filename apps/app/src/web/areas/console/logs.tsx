// spec/app/console/logs.md, "Story: Review request activity": the request history page — the filters send events to
// the logs machine, the table shows `visible` of its state, and a row opens the request detail dialog.
import { useState, type FormEvent } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import type { LogEntry, Logs, LogStatus, Window } from "../../../../gen/app__console__logs.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import { visible } from "../../../../gen/app__console__logs.ts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  cn,
} from "@repo/ui";
import { useRemote } from "../../remote.ts";
import { useWorkspaceSession } from "./frame.tsx";
import { SignInGate } from "./gate.tsx";
import { CopyButton, Detail, creditBalance, shorten } from "./bits.tsx";

const providerNames: Record<string, string> = { "near-ai": "NEAR AI", phala: "Phala", tinfoil: "Tinfoil" };
const providerIds = ["near-ai", "phala", "tinfoil"];

const statusLabels: Record<LogStatus, string> = {
  Pending: "In progress",
  Complete: "Completed",
  Failed: "Failed",
  Unreported: "Under review",
};
const statusTones: Record<LogStatus, string> = {
  Pending: "bg-info/15 text-info",
  Complete: "bg-ok/15 text-ok",
  Failed: "bg-destructive/15 text-destructive",
  Unreported: "bg-warn/15 text-warn",
};

const windows: { id: Window; label: string }[] = [
  { id: "Week", label: "Last 7 days" },
  { id: "Month", label: "Last 30 days" },
  { id: "Quarter", label: "Last 90 days" },
  { id: "AllTime", label: "All time" },
];
const statuses: LogStatus[] = ["Pending", "Complete", "Failed", "Unreported"];

const modelNames = new Map(
  catalog.flatMap((entry) =>
    entry.routes.filter((route) => route.endpoint === "chat/completions").map((route) => [route.modelId, entry.name]),
  ),
);

const amount = (value: number) => value.toLocaleString("en");
const milliseconds = (value: number) => amount(value) + " ms";
const when = (ageDays: number) =>
  ageDays === 0 ? "Today" : ageDays === 1 ? "Yesterday" : `${ageDays} days ago`;

function creditDecimal(micros: number) {
  const whole = Math.floor(micros / 1_000_000);
  const fraction = (micros % 1_000_000).toString().padStart(6, "0").replace(/0+$/, "");
  return whole + (fraction ? "." + fraction : "");
}

function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

/** The CSV export of the loaded rows, ported from the legacy console. */
function requestLogCsv(rows: readonly LogEntry[]) {
  const header = [
    "request_id",
    "model",
    "provider",
    "endpoint",
    "key_name",
    "status",
    "input_tokens",
    "output_tokens",
    "duration_ms",
    "charged_usd",
    "reserved_usd",
    "age_days",
  ];
  return (
    [
      header.join(","),
      ...rows.map((row) =>
        [
          row.id,
          row.model,
          row.provider,
          row.endpoint,
          row.keyName,
          row.status.toLowerCase(),
          row.input,
          row.output,
          row.durationMs,
          row.status === "Complete" ? creditDecimal(row.cost) : "",
          row.status === "Pending" || row.status === "Unreported" ? creditDecimal(row.cost) : "",
          row.ageDays,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}

function billing(row: LogEntry) {
  if (row.status === "Failed") return "Released";
  return (row.status === "Complete" ? "Charged " : "Reserved ") + creditBalance(row.cost);
}

function RequestDetail({ row, onClose }: { row: LogEntry | undefined; onClose: () => void }) {
  return (
    <Dialog open={row !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-labelledby="request-detail-heading" className="max-w-lg">
        <DialogTitle>
          <h2 id="request-detail-heading" className="text-base font-semibold">
            Request details
          </h2>
        </DialogTitle>
        {row && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-mono text-xs break-all">{row.id}</p>
              <p className="text-xs text-muted-foreground">
                {statusLabels[row.status]} · {when(row.ageDays)}
              </p>
              <div className="mt-2 flex gap-1">
                <CopyButton text={row.id} label="Copy request reference" />
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Route and status</h3>
              <dl className="grid grid-cols-2 gap-3">
                <Detail label="Model">{modelNames.get(row.model) ?? row.model}</Detail>
                <Detail label="Model ID" mono>{row.model}</Detail>
                <Detail label="Provider">{providerNames[row.provider] ?? row.provider}</Detail>
                <Detail label="Endpoint" mono>/{row.endpoint}</Detail>
                <Detail label="Key">{row.keyName}</Detail>
                <Detail label="Status">{statusLabels[row.status]}</Detail>
              </dl>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Usage and billing</h3>
              <dl className="grid grid-cols-2 gap-3">
                <Detail label="Input tokens">{amount(row.input)}</Detail>
                <Detail label="Output tokens">{amount(row.output)}</Detail>
                <Detail label="Billing">{billing(row)}</Detail>
              </dl>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Timing</h3>
              <dl className="grid grid-cols-2 gap-3">
                <Detail label="Total duration">{milliseconds(row.durationMs)}</Detail>
                <Detail label="Recorded">{when(row.ageDays)}</Detail>
              </dl>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LogsSection() {
  const session = useWorkspaceSession();
  const logs = useRemote<Logs>("console__logs");
  const [lookup, setLookup] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const state = logs.state;

  if (session.state?.tag !== "SignedIn") {
    return <SignInGate message="Connect a wallet to see request activity." />;
  }

  const rows = state ? visible(state) : [];
  const shown = rows.slice(0, limit);
  const detailRow = detail ? rows.find((row) => row.id === detail) : undefined;
  const window_ = state?.window ?? "Week";
  const showing = state?.showing.tag === "One" ? state.showing.status : "";

  function applyWindow(id: Window) {
    void logs.send({ type: "setWindow", window: id });
  }

  function exportRows() {
    if (!rows.length) return;
    const blob = new Blob([requestLogCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sonnely-request-logs-" + new Date().toISOString().slice(0, 10) + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function findRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = lookup.trim();
    if (rows.some((row) => row.id === id)) setDetail(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Request log controls" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={findRequest}>
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Find a request by reference
            <Input
              type="search"
              placeholder="Paste a request reference"
              spellCheck={false}
              autoComplete="off"
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
              className="font-mono text-xs"
            />
          </label>
          <Button type="submit" variant="outline" size="sm" disabled={!lookup.trim()}>
            <Search size={15} aria-hidden /> Find request
          </Button>
        </form>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Date range
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={window_}
              onChange={(event) => applyWindow(event.target.value as Window)}
            >
              {windows.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Provider
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={state?.provider ?? ""}
              onChange={(event) => void logs.send({ type: "setProvider", provider: event.target.value })}
            >
              <option value="">All providers</option>
              {providerIds.map((id) => (
                <option key={id} value={id}>
                  {providerNames[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Status
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={showing}
              onChange={(event) =>
                void logs.send({
                  type: "setShowing",
                  showing: event.target.value
                    ? { tag: "One", status: event.target.value as LogStatus }
                    : { tag: "AnyStatus" },
                })
              }
            >
              <option value="">All statuses</option>
              {statuses.map((id) => (
                <option key={id} value={id}>
                  {statusLabels[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Model ID
            <Input
              value={state?.model ?? ""}
              maxLength={100}
              placeholder="Any model"
              onChange={(event) => void logs.send({ type: "setModel", model: event.target.value })}
              className="h-9 w-44 font-mono text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Key name
            <Input
              value={state?.keyName ?? ""}
              maxLength={60}
              placeholder="Any key"
              onChange={(event) => void logs.send({ type: "setKeyName", keyName: event.target.value })}
              className="h-9 w-36 font-mono text-xs"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void logs.send({ type: "resetFilters" })}>
              Reset
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="request-log-table-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="request-log-table-heading" className="text-base font-semibold">
            Request history
          </h2>
          <Button variant="ghost" size="sm" disabled={!rows.length} onClick={exportRows}>
            <Download size={15} aria-hidden /> Export loaded CSV
          </Button>
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {!state
            ? "Loading request history…"
            : rows.length
              ? `${rows.length} ${rows.length === 1 ? "request" : "requests"} loaded`
              : "No matching requests."}
        </p>
        {!!shown.length && (
          <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-labelledby="request-log-table-heading" tabIndex={0}>
            <table aria-label="Request logs" className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="p-3 font-medium">Request</th>
                  <th scope="col" className="p-3 font-medium">Provider</th>
                  <th scope="col" className="p-3 font-medium">Status</th>
                  <th scope="col" className="p-3 font-medium">Duration</th>
                  <th scope="col" className="p-3 font-medium">Tokens</th>
                  <th scope="col" className="p-3 font-medium">Billing</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <th scope="row" className="p-3 text-left align-top font-normal">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        aria-label={`View ${modelNames.get(row.model) ?? row.model} request ${row.id}`}
                        onClick={() => setDetail(row.id)}
                      >
                        <span className="block text-sm font-medium">{modelNames.get(row.model) ?? row.model}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{shorten(row.id)}</span>
                        <span className="block text-xs text-muted-foreground">{when(row.ageDays)}</span>
                        <code className="block text-xs text-muted-foreground">/{row.endpoint}</code>
                      </button>
                    </th>
                    <td className="p-3 align-top">{providerNames[row.provider] ?? row.provider}</td>
                    <td className="p-3 align-top">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusTones[row.status])}>
                        {statusLabels[row.status]}
                      </span>
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">{milliseconds(row.durationMs)}</td>
                    <td className="p-3 align-top">{amount(row.input + row.output)}</td>
                    <td className="p-3 align-top whitespace-nowrap">{billing(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown.length && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setLimit((n) => n + 50)}>
            Load older requests
          </Button>
        )}
      </section>
      <RequestDetail row={detailRow} onClose={() => setDetail(null)} />
    </div>
  );
}
