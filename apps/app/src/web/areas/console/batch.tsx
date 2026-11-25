/* eslint-disable better-tailwindcss/no-unknown-classes, no-restricted-syntax -- this area intentionally uses the migrated batch class names and keeps the checkpoint workflow together */
// spec/app/console/batch.md, "Story: Prepare and run a batch"
import { ArrowUpRight, Download, Files, Pause, Play, RefreshCw, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import type { Batch } from "../../../../gen/app__console__batch.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import { useRemote, type Remote } from "../../remote.ts";
import { useWorkspaceSession } from "./frame.tsx";
import { SignInGate } from "./gate.tsx";
import { WorkspaceHeading, creditBalance, providerNames } from "./logs-shared.tsx";
import "./logs.css";
import "./batch.css";

const batchLimits = { rows: 200, bytes: 4 * 1024 * 1024, delayMs: 5000 } as const;
const batchEndpoint = "/v1/chat/completions";
const endpoints = new Set([batchEndpoint, "/api/sonnely/v1/chat/completions", "/chat/completions"]);
const utf8 = new TextEncoder();
const statusLabels = {
  queued: "Queued",
  sending: "In progress or interrupted",
  succeeded: "Completed",
  failed: "Rejected",
  blocked: "Blocked",
  interrupted: "Interrupted",
  review: "Check request logs",
} as const;
const machineRowStatus = {
  Queued: "queued",
  Sending: "sending",
  Succeeded: "succeeded",
  Failed: "failed",
  Blocked: "blocked",
  Interrupted: "interrupted",
  Review: "review",
} as const;

const example = {
  custom_id: "summary-001",
  method: "POST",
  url: batchEndpoint,
  body: {
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    messages: [{ role: "user", content: "Summarize this note in one sentence." }],
    max_tokens: 128,
  },
};

type BatchBody = {
  model: string;
  messages: { role: string; content?: unknown; tool_calls?: unknown }[];
  max_tokens?: number;
  max_cost_microusd?: number;
  provider?: { only: [string] };
  stream?: false;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: { type?: string };
};
type BatchRow = {
  customId: string;
  body: BatchBody & { provider: { only: [string] }; max_cost_microusd: number };
  estimatedMaximum: number;
  status: keyof typeof statusLabels;
  detail?: string;
  reference?: string;
  httpStatus?: number;
  output?: unknown;
};
type BatchJob = { version: 1; id: string; filename: string; createdAt: number; lastSentAt?: number; rows: BatchRow[] };
type BatchIssue = { line: number; detail: string };

const chatRoutes = catalog.flatMap((model) =>
  model.routes
    .filter((route) => route.endpoint === "chat/completions")
    .map((route) => ({ provider: model.provider, modelId: route.modelId, input: route.input, output: route.output })),
);

function downloadFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function storageKey(wallet: string) {
  return "sonnely.batch:" + wallet;
}

function readBatch(wallet: string): BatchJob | undefined {
  const text = localStorage.getItem(storageKey(wallet));
  if (!text) return undefined;
  const job = JSON.parse(text) as BatchJob;
  if (job.version !== 1 || !Array.isArray(job.rows)) throw new Error("This device’s saved batch cannot be opened.");
  return job;
}

function writeBatch(wallet: string, job?: BatchJob) {
  if (job) localStorage.setItem(storageKey(wallet), JSON.stringify(job));
  else localStorage.removeItem(storageKey(wallet));
}

function replaceRow(job: BatchJob, index: number, row: BatchRow) {
  const rows = job.rows.slice();
  rows[index] = row;
  return { ...job, rows };
}

function resetInFlight(job: BatchJob) {
  let changed = false;
  const rows = job.rows.map((row) => {
    if (row.status !== "sending") return row;
    changed = true;
    return { ...row, status: "interrupted" as const, detail: "The tab closed while this request was in flight." };
  });
  return changed ? { ...job, rows } : job;
}

async function withBatchWallet<T>(wallet: string, work: () => Promise<T>) {
  if (!navigator.locks) throw new Error("Open Batch in a browser that supports local workspace locking.");
  return navigator.locks.request("sonnely-batch:" + wallet, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("This wallet’s batch is open in another tab. Pause it there before continuing.");
    return work();
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validBody(value: unknown): value is BatchBody {
  if (!record(value)) return false;
  if (typeof value.model !== "string" || !value.model || value.model.length > 100) return false;
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 32) return false;
  if (value.stream !== undefined && value.stream !== false) return false;
  if (value.max_tokens !== undefined && (!Number.isInteger(value.max_tokens) || Number(value.max_tokens) < 1)) return false;
  if (value.max_cost_microusd !== undefined && (!Number.isInteger(value.max_cost_microusd) || Number(value.max_cost_microusd) < 1)) return false;
  if (value.provider !== undefined && (!record(value.provider) || !Array.isArray(value.provider.only) || value.provider.only.length !== 1 || typeof value.provider.only[0] !== "string")) return false;
  return value.messages.every((message) => record(message) && typeof message.role === "string");
}

function prepareLine(value: unknown): { row: BatchRow } | { issue: string } {
  if (!record(value)) return { issue: "Expected a JSONL chat request." };
  const customId = typeof value.custom_id === "string" ? value.custom_id.trim() : "";
  if (!customId || customId.length > 120 || /\p{Cc}/u.test(customId)) return { issue: "Check custom_id for a nonstreaming chat request." };
  if (value.method !== "POST" || typeof value.url !== "string" || !endpoints.has(value.url)) return { issue: "Check url for a nonstreaming chat request." };
  if (!validBody(value.body)) return { issue: "Check body for a nonstreaming chat request." };
  const body = value.body;
  const route = chatRoutes.find((candidate) => candidate.modelId === body.model && (!body.provider || candidate.provider === body.provider.only[0]));
  if (!route) return { issue: body.provider ? "No available route matches this model and provider." : "The model is not in the Sonnely chat catalog." };
  if (body.tool_choice && !body.tools) return { issue: "tool_choice requires tools." };
  if (body.messages.some((message) => message.role === "assistant" && !message.content && !message.tool_calls)) return { issue: "Assistant messages require content or tool calls." };
  const bytes = utf8.encode(JSON.stringify(body.messages)).length + (body.tools || body.tool_choice || body.response_format ? utf8.encode(JSON.stringify({ tools: body.tools, tool_choice: body.tool_choice, response_format: body.response_format })).length : 0);
  const maxTokens = body.max_tokens ?? 4096;
  const estimatedMaximum = Math.max(1, Math.ceil((route.input * (bytes + 256)) / 1_000_000 + (route.output * maxTokens) / 1_000_000));
  if (body.max_cost_microusd !== undefined && estimatedMaximum > body.max_cost_microusd) return { issue: "The reservation estimate exceeds max_cost_microusd." };
  const request: BatchRow["body"] = { ...body, provider: { only: [route.provider] }, max_cost_microusd: body.max_cost_microusd ?? estimatedMaximum };
  if (utf8.encode(JSON.stringify(request)).length > 512 * 1024) return { issue: "The request exceeds Sonnely’s per-request body limit." };
  return { row: { customId, body: request, estimatedMaximum, status: "queued" } };
}

function preflightBatch(text: string) {
  const rows: BatchRow[] = [];
  const issues: BatchIssue[] = [];
  const ids = new Set<string>();
  let issueCount = 0;
  const reject = (line: number, detail: string) => {
    issueCount++;
    if (issues.length < 12) issues.push({ line, detail });
  };
  if (utf8.encode(text).length > batchLimits.bytes) {
    reject(0, "Choose a file up to 4 MiB.");
    return { rows, issues, issueCount };
  }
  let inputCount = 0;
  for (const [index, raw] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const line = index + 1;
    if (++inputCount > batchLimits.rows) {
      reject(line, "Split this file into batches of at most 200 requests.");
      break;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      reject(line, "Expected one complete JSON object on this line.");
      continue;
    }
    const result = prepareLine(data);
    if ("issue" in result) reject(line, result.issue);
    else if (ids.has(result.row.customId)) reject(line, "Each custom_id must be unique.");
    else {
      ids.add(result.row.customId);
      rows.push(result.row);
    }
  }
  if (!inputCount) reject(0, "The file contains no requests.");
  return { rows, issues, issueCount };
}

function batchExport(job: BatchJob, kind: "results" | "needs-attention") {
  const lines = job.rows.flatMap((row) => {
    const succeeded = row.status === "succeeded";
    if ((kind === "results") !== succeeded) return [];
    return [JSON.stringify({
      custom_id: row.customId,
      status: row.status === "sending" ? "interrupted" : row.status,
      request_id: row.reference ?? null,
      response: succeeded ? { status_code: row.httpStatus, body: row.output } : null,
      error: succeeded ? null : { status_code: row.httpStatus ?? null, message: row.detail ?? null },
    })];
  });
  return lines.length ? lines.join("\n") + "\n" : "";
}

async function sendBatchRow(wallet: string, jobId: string, index: number, row: BatchRow, signal: AbortSignal): Promise<BatchRow> {
  try {
    const response = await fetch("/api/sonnely/batch/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `batch:${jobId}:${index}`,
        "x-sonnely-batch-wallet": wallet,
      },
      body: JSON.stringify(row.body),
      signal,
    });
    const reference = response.headers.get("x-sonnely-request-id") ?? undefined;
    const validReference = reference && /^[a-z0-9]{20,80}$/.test(reference) ? reference : undefined;
    let output: unknown;
    let detail = "";
    try {
      output = await response.json();
      if (record(output) && typeof output.error === "string") detail = output.error.slice(0, 240);
      else if (record(output) && record(output.error) && typeof output.error.message === "string") detail = output.error.message.slice(0, 240);
    } catch {
      output = undefined;
    }
    if (response.ok && validReference && record(output) && Array.isArray(output.choices)) return { ...row, status: "succeeded", reference: validReference, httpStatus: response.status, output, detail: undefined };
    if (response.status === 409 && validReference) return { ...row, status: "review", reference: validReference, httpStatus: response.status, detail: detail || "This request may already have been accepted. Check settlement in Request logs." };
    if ([401, 402, 403, 429].includes(response.status) && !validReference) return { ...row, status: "blocked", httpStatus: response.status, detail: detail || "The workspace cannot send more batch requests right now." };
    if ([400, 404, 413, 415, 422].includes(response.status) && !validReference) return { ...row, status: "failed", httpStatus: response.status, detail: detail || "The batch request was rejected before inference." };
    return validReference
      ? { ...row, status: "review", reference: validReference, httpStatus: response.status, detail: detail || "Check settlement in Request logs." }
      : { ...row, status: "interrupted", httpStatus: response.status, detail: detail || "The request outcome is unknown." };
  } catch (failure) {
    if (signal.aborted) return { ...row, status: "sending" };
    return { ...row, status: "interrupted", detail: failure instanceof Error ? failure.message.slice(0, 240) : "The request outcome is unknown." };
  }
}

function workMessage(error: unknown) {
  return error instanceof Error ? error.message : "Batch could not continue.";
}

function focusHeading(node: HTMLHeadingElement | null) {
  node?.focus();
}

export function BatchSection() {
  const session = useWorkspaceSession();
  const machine = useRemote<Batch>("console__batch");
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  if (!wallet) return <SignInGate message="Sign in with a Solana wallet to open Batch." />;
  return <BatchWorkspace key={wallet} wallet={wallet} machine={machine} />;
}

function BatchWorkspace({ wallet, machine }: { wallet: string; machine: Remote<Batch> }) {
  const [boot] = useState(() => {
    try {
      const job = readBatch(wallet);
      return { job: job ? resetInFlight(job) : undefined, error: "" };
    } catch (failure) {
      return { job: undefined, error: workMessage(failure) };
    }
  });
  const [saved, setSaved] = useState<BatchJob | undefined>(boot.job);
  const [ready, setReady] = useState(!boot.error);
  const [activity, setActivity] = useState<"importing" | "running" | "clearing" | "idle">("idle");
  const [pausing, setPausing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(boot.error);
  const [issues, setIssues] = useState<{ count: number; lines: BatchIssue[] }>();
  const [scope, setScope] = useState<"all" | "remaining" | "attention" | "completed">("all");
  const taskRef = useRef<AbortController | undefined>(undefined);
  const uploaderRef = useRef<HTMLInputElement>(null);

  function reload() {
    if (taskRef.current) return;
    try {
      const job = readBatch(wallet);
      setSaved(job ? resetInFlight(job) : undefined);
      setReady(true);
      setError("");
    } catch (failure) {
      setError(workMessage(failure));
    }
  }

  async function operate(kind: "importing" | "running" | "clearing", perform: (signal: AbortSignal) => Promise<void>) {
    if (taskRef.current) return;
    const controller = new AbortController();
    taskRef.current = controller;
    setActivity(kind);
    setError("");
    setMessage("");
    try {
      await withBatchWallet(wallet, () => perform(controller.signal));
    } catch (failure) {
      setError(workMessage(failure));
    } finally {
      taskRef.current = undefined;
      setActivity("idle");
      setPausing(false);
    }
  }

  async function importBatch(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !wallet) return;
    setIssues(undefined);
    await operate("importing", async (signal) => {
      if (file.size > batchLimits.bytes) throw new Error("Choose a JSONL file up to 4 MiB.");
      if (readBatch(wallet)) throw new Error("Clear the saved batch before importing a new file.");
      const result = preflightBatch(await file.text());
      if (signal.aborted) return;
      if (result.issueCount) {
        setIssues({ count: result.issueCount, lines: result.issues });
        return;
      }
      const next: BatchJob = { version: 1, id: crypto.randomUUID(), filename: file.name, createdAt: Date.now(), rows: result.rows };
      writeBatch(wallet, next);
      if (machine.state?.tag !== "Idle") await machine.send({ type: "clear" });
      await machine.send({ type: "submit", id: next.id, filename: next.filename, requests: next.rows.map((row) => ({ customId: row.customId, model: row.body.model })) });
      setSaved(next);
      setScope("all");
      setMessage(`${next.rows.length} ${next.rows.length === 1 ? "request" : "requests"} ready to run.`);
    });
  }

  async function sendMachine(index: number, row: BatchRow) {
    if (row.status === "succeeded") await machine.send({ type: "succeed", index });
    else if (row.status === "failed") await machine.send({ type: "failed", index, detail: row.detail ?? "" });
    else if (row.status === "blocked") await machine.send({ type: "block", index, detail: row.detail ?? "" });
    else if (row.status === "interrupted") await machine.send({ type: "interrupt", index, detail: row.detail ?? "" });
    else if (row.status === "review") await machine.send({ type: "review", index, detail: row.detail ?? "" });
  }

  async function run(jobId: string, retryIndex?: number) {
    if (!wallet) return;
    await operate("running", async (signal) => {
      const loaded = readBatch(wallet);
      if (!loaded || loaded.id !== jobId) throw new Error("This batch changed in another tab. Refresh the saved batch.");
      let job = resetInFlight(loaded);
      if (job !== loaded) writeBatch(wallet, job);
      setSaved(job);
      const selected = job.rows.flatMap((row, index) => (retryIndex === undefined ? row.status === "queued" || row.status === "blocked" : index === retryIndex && row.status === "interrupted") ? [index] : []);
      for (const index of selected) {
        if (signal.aborted) break;
        if (signal.aborted) break;
        const previous = job.rows[index];
        if (retryIndex === index) await machine.send({ type: "retry", index });
        await machine.send({ type: "start", index });
        const row: BatchRow = { customId: previous.customId, body: previous.body, estimatedMaximum: previous.estimatedMaximum, status: "sending" };
        const started = { ...replaceRow(job, index, row), lastSentAt: Date.now() };
        writeBatch(wallet, started);
        if (signal.aborted) {
          writeBatch(wallet, job);
          break;
        }
        setSaved(started);
        const result = await sendBatchRow(wallet, job.id, index, row, signal);
        job = replaceRow(started, index, result);
        writeBatch(wallet, job);
        await sendMachine(index, result);
        setSaved(job);
        if (result.status === "blocked" || result.status === "interrupted") break;
      }
      if (signal.aborted) setMessage("Batch paused. Your progress is saved on this device.");
      else if (job.rows.some((row) => row.status === "blocked")) setMessage("Batch paused on a blocked request.");
      else if (job.rows.some((row) => row.status === "interrupted")) setMessage("Batch needs attention. Review interrupted rows.");
      else if (job.rows.some((row) => row.status === "queued")) setMessage("Checkpoint saved. You can resume remaining requests.");
      else setMessage("Batch finished. Review the results and any requests that need attention.");
    });
  }

  async function clearBatch(jobId: string) {
    if (!wallet) return;
    await operate("clearing", async (signal) => {
      const job = readBatch(wallet);
      if (!job || job.id !== jobId) throw new Error("This batch changed in another tab. Refresh the saved batch.");
      if (signal.aborted) return;
      writeBatch(wallet);
      await machine.send({ type: "clear" });
      setSaved(undefined);
      setConfirmClear(false);
      setMessage("Batch files and checkpoints were cleared from this device.");
      uploaderRef.current?.focus();
    });
  }

  const busy = activity !== "idle";
  const savedRows = saved?.rows ?? [];
  const mirrored = machine.state?.tag === "Working" && saved && machine.state.id === saved.id ? machine.state.rows : [];
  const rows = savedRows.map((row, index) => {
    const mirror = mirrored[index];
    return mirror?.customId === row.customId ? { ...row, status: machineRowStatus[mirror.status], detail: mirror.detail || row.detail } : row;
  });
  const completed = rows.filter((row) => row.status === "succeeded").length;
  const processed = rows.filter((row) => row.status === "succeeded" || row.status === "failed" || row.status === "review").length;
  const remaining = rows.filter((row) => row.status === "queued" || row.status === "blocked").length;
  const attention = rows.filter((row) => row.status !== "queued" && row.status !== "succeeded" && (row.status !== "sending" || activity !== "running")).length;
  const estimate = rows.reduce((sum, row) => sum + row.estimatedMaximum, 0);
  const filtered = rows.flatMap((row, index) => {
    if (scope === "remaining" && row.status !== "queued" && row.status !== "blocked") return [];
    if (scope === "attention" && (row.status === "queued" || row.status === "succeeded")) return [];
    if (scope === "completed" && row.status !== "succeeded") return [];
    return [{ row, index }];
  });

  return (
    <div className="telemetry-legacy console batch-legacy">
      <WorkspaceHeading icon={Files} title="Batch" description="Run a JSONL file through private inference and save the results on this device.">
        <a className="button quiet" href="/docs/batch">Batch guide <ArrowUpRight size={15} aria-hidden="true" /></a>
      </WorkspaceHeading>
      <p aria-live="polite" className="batch-message">{message}</p>
      {error && <p role="alert" className="error">{error}</p>}
      {!saved ? (
        <section className="panel batch-panel-section" aria-labelledby="batch-input-title">
          <div className="batch-section-heading">
            <div><h2 id="batch-input-title">Prepare a batch</h2><p className="caption">Upload up to 200 nonstreaming Chat Completions requests in one JSONL file, up to 4 MiB.</p></div>
            <button className="button quiet" type="button" onClick={() => downloadFile("sonnely-batch-example.jsonl", JSON.stringify(example) + "\n")}><Download size={16} aria-hidden="true" /> Download example</button>
          </div>
          <label className="batch-upload">
            <Upload size={18} aria-hidden="true" />
            <span><strong>Choose JSONL file</strong><span className="caption">Each line needs a custom ID, endpoint, and request body.</span></span>
            <input ref={uploaderRef} type="file" accept=".jsonl,.ndjson,application/x-ndjson" aria-label="Choose JSONL file" disabled={busy || !ready} onChange={(event) => void importBatch(event)} />
          </label>
          {issues && <div role="alert" className="error batch-issues"><strong>Found {issues.count} {issues.count === 1 ? "issue" : "issues"} in this file.</strong><ul>{issues.lines.map((issue) => <li key={issue.line}>{issue.line ? "Line " + issue.line + " · " : ""}{issue.detail}</li>)}</ul>{issues.count > issues.lines.length && <p>Showing the first {issues.lines.length} issues.</p>}</div>}
          {!ready && !error && <p role="status" className="caption">Opening this device’s batch storage…</p>}
          {!ready && error && <button className="button quiet" type="button" onClick={reload}>Retry local storage</button>}
        </section>
      ) : (
        <>
          <section className="panel batch-panel-section" aria-labelledby="batch-summary-title">
            <div className="batch-section-heading">
              <div><h2 id="batch-summary-title" ref={focusHeading} tabIndex={-1}>{saved.filename}</h2><p className="caption">This batch and its checkpoints are stored in this browser for your wallet.</p></div>
              <div className="batch-actions">
                {activity === "running" ? <button className="button quiet" type="button" disabled={pausing} onClick={() => { taskRef.current?.abort(); setPausing(true); }}><Pause size={16} aria-hidden="true" /> {pausing ? "Pausing…" : "Pause batch"}</button> : <button className="button accent" type="button" disabled={busy || !remaining || confirmClear} onClick={() => void run(saved.id)}><Play size={16} aria-hidden="true" /> {rows.every((row) => row.status === "queued") ? "Run batch" : "Resume batch"}</button>}
                <button className="button quiet" type="button" disabled={busy} onClick={reload}><RefreshCw size={16} aria-hidden="true" /> Refresh saved batch</button>
              </div>
            </div>
            <dl className="batch-stats"><div><dt>Requests</dt><dd>{rows.length}</dd></div><div><dt>Completed</dt><dd>{completed}</dd></div><div><dt>Needs attention</dt><dd>{attention}</dd></div><div><dt>Estimated max reservation</dt><dd>{creditBalance(estimate)}</dd></div></dl>
            <progress aria-label="Batch rows processed" max={rows.length} value={processed} className="batch-progress" />
            <p className="caption">Requests run one at a time at standard inference rates. Pausing lets the current request finish. Resume dispatches queued and blocked rows. Retry an interrupted row individually to keep its original checkpoint key.</p>
          </section>
          <section className="panel batch-panel-section" aria-labelledby="batch-rows-title">
            <div className="batch-section-heading"><div><h2 id="batch-rows-title">Requests</h2><p className="caption">Filter by status or export the saved results and checkpoints.</p></div><label className="batch-filter">Show<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="all">All requests</option><option value="remaining">Queued and blocked</option><option value="attention">Needs attention</option><option value="completed">Completed</option></select></label></div>
            <div className="batch-rows">
              {filtered.map(({ row, index }) => (
                <article className="batch-row" key={row.customId}>
                  <div className="batch-request-name"><strong>{row.customId}</strong><span className="caption">{row.body.model} · {providerNames[row.body.provider.only[0]] ?? row.body.provider.only[0]}</span></div>
                  <div><span className="batch-badge" data-status={row.status}>{row.status === "sending" && activity === "running" ? "In progress" : statusLabels[row.status]}</span>{row.detail && <p className="caption">{row.detail}</p>}</div>
                  <div className="batch-actions">
                    {row.reference && <a className="text-link" href={"/console/logs?request=" + encodeURIComponent(row.reference)}>Request details <ArrowUpRight size={14} aria-hidden="true" /></a>}
                    {(row.status === "interrupted" || row.status === "sending") && activity !== "running" && <button className="button quiet small" type="button" disabled={busy || confirmClear} onClick={() => void run(saved.id, index)}>Retry interrupted request<span className="visually-hidden"> {row.customId}</span></button>}
                  </div>
                </article>
              ))}
              {!filtered.length && <p className="caption">No requests match this status.</p>}
            </div>
            <div className="batch-actions">
              <button className="button quiet" type="button" disabled={!completed} onClick={() => downloadFile("sonnely-batch-results.jsonl", batchExport(saved, "results"))}><Download size={16} aria-hidden="true" /> Download results</button>
              <button className="button quiet" type="button" disabled={completed === rows.length} onClick={() => downloadFile("sonnely-batch-checkpoints.jsonl", batchExport(saved, "needs-attention"))}><Download size={16} aria-hidden="true" /> Download errors and status</button>
              {!confirmClear && <button className="button quiet" type="button" disabled={busy} onClick={() => setConfirmClear(true)}>Clear saved batch</button>}
            </div>
            {confirmClear && <div className="batch-notice"><p>Clearing removes this device’s results and checkpoints. Export any files you want to keep first.</p><div className="batch-actions"><button className="button quiet" type="button" disabled={busy} onClick={() => setConfirmClear(false)}>Keep batch</button><button className="button accent" type="button" disabled={busy} onClick={() => void clearBatch(saved.id)}>Clear this batch</button></div></div>}
          </section>
        </>
      )}
    </div>
  );
}
