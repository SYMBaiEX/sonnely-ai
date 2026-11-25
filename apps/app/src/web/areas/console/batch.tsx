// spec/app/console/batch.md, "Story: Prepare and run a batch": upload a JSONL file of chat requests, run it one row
// at a time through the run endpoint, and export results or checkpoints.
import { useRef, useState } from "react";
import { Download, Pause, Play, RefreshCw, Upload } from "lucide-react";
import type { Batch, BatchRequest, RowStatus } from "../../../../gen/app__console__batch.ts";
import { Button, Card, Progress, cn } from "@repo/ui";
import { useRemote } from "../../remote.ts";
import { useWorkspaceSession } from "./frame.tsx";
import { SignInGate } from "./gate.tsx";

const statusLabels: Record<RowStatus, string> = {
  Queued: "Queued",
  Sending: "In progress",
  Succeeded: "Completed",
  Failed: "Rejected",
  Blocked: "Blocked",
  Interrupted: "Interrupted",
  Review: "Check request logs",
};
const statusTones: Record<RowStatus, string> = {
  Queued: "bg-muted text-muted-foreground",
  Sending: "bg-info/15 text-info",
  Succeeded: "bg-ok/15 text-ok",
  Failed: "bg-destructive/15 text-destructive",
  Blocked: "bg-warn/15 text-warn",
  Interrupted: "bg-warn/15 text-warn",
  Review: "bg-warn/15 text-warn",
};

const limits = { rows: 200, bytes: 4 * 1024 * 1024 };

const example = {
  custom_id: "summary-001",
  method: "POST",
  url: "/v1/chat/completions",
  body: {
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    messages: [{ role: "user", content: "Summarize this note in one sentence." }],
    max_tokens: 128,
  },
};

function downloadFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a JSONL file into batch requests, reporting issues by line the way the legacy panel did. */
function parseBatch(text: string): { requests: BatchRequest[]; issues: { line: number; detail: string }[] } {
  const issues: { line: number; detail: string }[] = [];
  const requests: BatchRequest[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n");
  lines.forEach((raw, at) => {
    const line = raw.trim();
    if (!line) return;
    if (requests.length >= limits.rows) {
      issues.push({ line: at + 1, detail: `A batch holds up to ${limits.rows} requests.` });
      return;
    }
    try {
      const row = JSON.parse(line) as { custom_id?: unknown; body?: { model?: unknown } };
      const customId = typeof row.custom_id === "string" ? row.custom_id.trim() : "";
      const model = typeof row.body?.model === "string" ? row.body.model : "";
      if (!customId) {
        issues.push({ line: at + 1, detail: "Missing a custom_id." });
        return;
      }
      if (seen.has(customId)) {
        issues.push({ line: at + 1, detail: `custom_id "${customId}" is used more than once.` });
        return;
      }
      if (!model) {
        issues.push({ line: at + 1, detail: "The request body needs a model." });
        return;
      }
      seen.add(customId);
      requests.push({ customId, model });
    } catch {
      issues.push({ line: at + 1, detail: "Not a JSON line." });
    }
  });
  if (!requests.length && !issues.length) issues.push({ line: 0, detail: "The file holds no requests." });
  return { requests, issues };
}

/** The saved batch's rows as downloadable JSONL. */
function batchExport(batch: Extract<Batch, { tag: "Working" }>, kind: "results" | "needs-attention") {
  const rows =
    kind === "results"
      ? batch.rows
      : batch.rows.filter((row) => row.status === "Failed" || row.status === "Blocked" || row.status === "Interrupted" || row.status === "Review");
  return rows
    .map((row) =>
      JSON.stringify({
        custom_id: row.customId,
        model: row.model,
        status: row.status.toLowerCase(),
        ...(row.detail ? { detail: row.detail } : {}),
      }),
    )
    .join("\n") + "\n";
}

async function runOne() {
  const response = await fetch("/api/console/batch/run", { method: "POST" }).catch(() => null);
  if (!response) return null;
  return (await response.json().catch(() => null)) as { done?: boolean } | null;
}

export function BatchSection() {
  const session = useWorkspaceSession();
  const batch = useRemote<Batch>("console__batch");
  const [issues, setIssues] = useState<{ line: number; detail: string }[] | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const stop = useRef(false);
  const uploader = useRef<HTMLInputElement>(null);
  const state = batch.state;
  const signedIn = session.state?.tag === "SignedIn";

  if (!signedIn) {
    return <SignInGate message="Sign in with a Solana wallet to open Batch." />;
  }

  const working = state?.tag === "Working" ? state : undefined;
  const rows = working?.rows ?? [];
  const completed = rows.filter((row) => row.status === "Succeeded" || row.status === "Failed" || row.status === "Review").length;
  const attention = rows.filter(
    (row) => row.status === "Blocked" || row.status === "Interrupted" || row.status === "Review" || row.status === "Failed",
  ).length;
  const remaining = rows.some((row) => row.status === "Queued" || row.status === "Blocked");
  const filtered = rows.filter((row) =>
    filter === "all"
      ? true
      : filter === "remaining"
        ? row.status === "Queued" || row.status === "Blocked"
        : filter === "attention"
          ? row.status === "Blocked" || row.status === "Interrupted" || row.status === "Review"
          : row.status === "Succeeded" || row.status === "Failed",
  );

  async function importBatch(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setIssues(null);
    if (file.size > limits.bytes) {
      setError("Choose a JSONL file up to 4 MiB.");
      return;
    }
    const text = await file.text().catch(() => null);
    if (text === null) {
      setError("The file could not be read.");
      return;
    }
    const { requests, issues: found } = parseBatch(text);
    if (found.length) {
      setIssues(found);
      return;
    }
    const sent = await batch.send({
      type: "submit",
      id: crypto.randomUUID(),
      filename: file.name,
      requests,
    });
    if (!sent) setError("The file was refused: each request needs a unique custom_id.");
  }

  async function run() {
    setRunning(true);
    setPausing(false);
    stop.current = false;
    try {
      for (;;) {
        if (stop.current) break;
        const answer = await runOne();
        if (!answer || answer.done) break;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    } finally {
      setRunning(false);
      setPausing(false);
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {!working ? (
        <Card aria-labelledby="batch-input-title" className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="batch-input-title" className="text-base font-semibold">
                Prepare a batch
              </h2>
              <p className="text-sm text-muted-foreground">
                Upload up to 200 nonstreaming Chat Completions requests in one JSONL file, up to 4 MiB.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadFile("sonnely-batch-example.jsonl", JSON.stringify(example) + "\n")}
            >
              <Download size={15} aria-hidden /> Download example
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input p-5 text-sm hover:bg-accent">
            <Upload size={18} aria-hidden className="text-muted-foreground" />
            <span>
              <strong className="block">Choose JSONL file</strong>
              <span className="text-xs text-muted-foreground">
                Each line needs a custom ID, endpoint, and request body.
              </span>
            </span>
            <input
              ref={uploader}
              type="file"
              accept=".jsonl,.ndjson,application/x-ndjson"
              aria-label="Choose JSONL file"
              className="sr-only"
              onChange={(event) => void importBatch(event)}
            />
          </label>
          {issues && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <strong>
                Found {issues.length} {issues.length === 1 ? "issue" : "issues"} in this file.
              </strong>
              <ul className="mt-1 list-disc pl-5">
                {issues.slice(0, 5).map((issue) => (
                  <li key={issue.line}>
                    {issue.line ? "Line " + issue.line + " · " : ""}
                    {issue.detail}
                  </li>
                ))}
              </ul>
              {issues.length > 5 && <p>Showing the first 5 issues.</p>}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </Card>
      ) : (
        <>
          <Card aria-labelledby="batch-summary-title" className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="batch-summary-title" className="text-base font-semibold">
                  {working.filename}
                </h2>
                <p className="text-sm text-muted-foreground">
                  This batch and its checkpoints are stored with your workspace.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {running ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pausing}
                    onClick={() => {
                      stop.current = true;
                      setPausing(true);
                    }}
                  >
                    <Pause size={15} aria-hidden /> {pausing ? "Pausing…" : "Pause batch"}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!remaining || confirmClear}
                    onClick={() => void run()}
                  >
                    <Play size={15} aria-hidden />{" "}
                    {rows.every((row) => row.status === "Queued") ? "Run batch" : "Resume batch"}
                  </Button>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Requests</dt>
                <dd className="text-lg font-semibold">{rows.length}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Completed</dt>
                <dd className="text-lg font-semibold">{completed}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</dt>
                <dd className="text-lg font-semibold">{attention}</dd>
              </div>
            </dl>
            <Progress
              value={rows.length ? (completed / rows.length) * 100 : 0}
              aria-label="Batch rows processed"
            />
            <p className="text-xs text-muted-foreground">
              Rows run one at a time. On staging, a custom id ending in <code>-fail</code> fails; everything else
              succeeds.
            </p>
          </Card>
          <Card aria-labelledby="batch-rows-title" className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="batch-rows-title" className="text-base font-semibold">
                  Requests
                </h2>
                <p className="text-sm text-muted-foreground">
                  Filter by status or export the saved results and checkpoints.
                </p>
              </div>
              <select
                aria-label="Filter by status"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All requests</option>
                <option value="remaining">Queued and blocked</option>
                <option value="attention">Needs attention</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <ul className="flex flex-col divide-y divide-border" role="list">
              {filtered.map((row) => (
                <li key={row.customId} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <code className="block truncate font-mono text-sm">{row.customId}</code>
                    <span className="text-xs text-muted-foreground">{row.model}</span>
                    {row.detail && <p className="text-xs text-muted-foreground">{row.detail}</p>}
                    {row.status === "Interrupted" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        disabled={running}
                        onClick={() => void batch.send({ type: "retry", index: rows.indexOf(row) })}
                      >
                        <RefreshCw size={13} aria-hidden /> Queue again
                      </Button>
                    )}
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      statusTones[row.status],
                    )}
                  >
                    {statusLabels[row.status]}
                  </span>
                </li>
              ))}
            </ul>
            {!filtered.length && <p className="text-xs text-muted-foreground">No requests match this status.</p>}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={!rows.length}
                onClick={() => downloadFile("sonnely-batch-results.jsonl", batchExport(working, "results"))}
              >
                <Download size={15} aria-hidden /> Download results
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadFile("sonnely-batch-checkpoints.jsonl", batchExport(working, "needs-attention"))}
              >
                <Download size={15} aria-hidden /> Download errors and status
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmClear(true)}
                disabled={running}
              >
                Clear batch
              </Button>
            </div>
            {confirmClear && (
              <div className="rounded-md border border-border bg-muted p-3 text-sm">
                <p>Clearing removes this device’s results and checkpoints. Export any files you want to keep first.</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="ghost" size="sm" disabled={running} onClick={() => setConfirmClear(false)}>
                    Keep batch
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={running}
                    onClick={() => {
                      setConfirmClear(false);
                      void batch.send({ type: "clear" });
                    }}
                  >
                    Clear this batch
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
