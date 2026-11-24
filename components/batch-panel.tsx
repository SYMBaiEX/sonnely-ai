"use client";

import { ArrowUpRight, Download, Files, Pause, Play, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  batchEndpoint,
  batchExport,
  batchLimits,
  preflightBatch,
  type BatchIssue,
  type BatchJob,
  type BatchRow,
} from "@/lib/batch-inference";
import {
  readBatch,
  resetInFlight,
  sendBatchRow,
  waitForBatchSlot,
  withBatchWallet,
  writeBatch,
} from "@/lib/browser-batch";
import { creditBalance } from "@/lib/credit-amount";
import { providerNames, type ProviderId } from "@/lib/provider-catalog";
import { WorkspaceHeading } from "./workspace-heading";
import styles from "./batch-panel.module.css";

const statusLabels = {
  queued: "Queued",
  sending: "In progress or interrupted",
  succeeded: "Completed",
  failed: "Rejected",
  blocked: "Blocked",
  interrupted: "Interrupted",
  review: "Check request logs",
} satisfies Record<BatchRow["status"], string>;

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

function downloadFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function replaceRow(job: BatchJob, index: number, row: BatchRow) {
  const rows = job.rows.slice();
  rows[index] = row;
  return { ...job, rows };
}

function workMessage(error: unknown) {
  return error instanceof Error ? error.message : "Batch could not continue.";
}

function BatchWorkspace({
  wallet,
  inferenceEnabled,
  providers,
  agentFeatures,
}: {
  wallet: string;
  inferenceEnabled: boolean;
  providers: readonly ProviderId[];
  agentFeatures: boolean;
}) {
  const [saved, setSaved] = useState<BatchJob>();
  const [ready, setReady] = useState(false);
  const [activity, setActivity] = useState<"importing" | "running" | "clearing" | "idle">("idle");
  const [pausing, setPausing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<{ count: number; lines: BatchIssue[] }>();
  const [scope, setScope] = useState<"all" | "remaining" | "attention" | "completed">("all");
  const mounted = useRef(false);
  const task = useRef<AbortController | undefined>(undefined);
  const uploader = useRef<HTMLInputElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);

  async function reload() {
    try {
      const job = await readBatch(wallet);
      if (mounted.current && !task.current) {
        setSaved(job);
        setReady(true);
        setError("");
      }
    } catch (failure) {
      if (mounted.current && !task.current) setError(workMessage(failure));
    }
  }

  useEffect(() => {
    mounted.current = true;
    void reload();
    function onVisible() {
      if (document.visibilityState === "visible" && !task.current) void reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      task.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [wallet]);

  async function operate(
    activity: "importing" | "running" | "clearing",
    perform: (signal: AbortSignal) => Promise<void>,
  ) {
    if (task.current) return;
    const controller = new AbortController();
    task.current = controller;
    setActivity(activity);
    setError("");
    setMessage("");
    try {
      await withBatchWallet(wallet, () => perform(controller.signal));
    } catch (failure) {
      if (mounted.current) setError(workMessage(failure));
    } finally {
      task.current = undefined;
      if (mounted.current) {
        setActivity("idle");
        setPausing(false);
      }
    }
  }

  async function importBatch(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIssues(undefined);
    await operate("importing", async (signal) => {
      if (file.size > batchLimits.bytes) throw new Error("Choose a JSONL file up to 4 MiB.");
      if (await readBatch(wallet)) throw new Error("Clear the saved batch before importing a new file.");
      const result = preflightBatch(await file.text(), providers, agentFeatures);
      if (signal.aborted) return;
      if (result.issueCount) {
        setIssues({ count: result.issueCount, lines: result.issues });
        return;
      }
      const next: BatchJob = {
        version: 1,
        id: crypto.randomUUID(),
        filename: file.name,
        createdAt: Date.now(),
        rows: result.rows,
      };
      await writeBatch(wallet, next);
      if (mounted.current) {
        setSaved(next);
        setScope("all");
        setMessage(`${next.rows.length} ${next.rows.length === 1 ? "request" : "requests"} ready to run.`);
        requestAnimationFrame(() => summaryHeading.current?.focus());
      }
    });
  }

  async function run(jobId: string, retryIndex?: number) {
    if (!inferenceEnabled) return;
    await operate("running", async (signal) => {
      const loaded = await readBatch(wallet);
      if (!loaded || loaded.id !== jobId)
        throw new Error("This batch changed in another tab. Refresh the saved batch.");
      let job = resetInFlight(loaded);
      if (job !== loaded) await writeBatch(wallet, job);
      if (mounted.current) setSaved(job);

      const selected = job.rows.flatMap((row, index) =>
        (
          retryIndex === undefined
            ? row.status === "queued" || row.status === "blocked"
            : index === retryIndex && row.status === "interrupted"
        )
          ? [index]
          : [],
      );
      for (const index of selected) {
        if (signal.aborted) break;
        await waitForBatchSlot(job.lastSentAt, signal);
        if (signal.aborted) break;
        const previous = job.rows[index];
        const row: BatchRow = {
          customId: previous.customId,
          body: previous.body,
          estimatedMaximum: previous.estimatedMaximum,
          status: "sending",
        };
        const started = { ...replaceRow(job, index, row), lastSentAt: Date.now() };
        await writeBatch(wallet, started);
        if (signal.aborted) {
          await writeBatch(wallet, job);
          break;
        }
        if (mounted.current) setSaved(started);
        const result = await sendBatchRow(wallet, job.id, index, row);
        job = replaceRow(started, index, result);
        await writeBatch(wallet, job);
        if (mounted.current) setSaved(job);
        if (result.status === "blocked" || result.status === "interrupted") break;
      }
      if (!mounted.current) return;
      if (signal.aborted) setMessage("Batch paused. Your progress is saved on this device.");
      else if (job.rows.some((row) => row.status === "blocked"))
        setMessage("Batch paused on a blocked request.");
      else if (job.rows.some((row) => row.status === "interrupted"))
        setMessage("Batch needs attention. Review interrupted rows.");
      else if (job.rows.some((row) => row.status === "queued"))
        setMessage("Checkpoint saved. You can resume remaining requests.");
      else setMessage("Batch finished. Review the results and any requests that need attention.");
    });
  }

  async function clearBatch(jobId: string) {
    await operate("clearing", async (signal) => {
      const job = await readBatch(wallet);
      if (!job || job.id !== jobId)
        throw new Error("This batch changed in another tab. Refresh the saved batch.");
      if (signal.aborted) return;
      await writeBatch(wallet);
      if (mounted.current) {
        setSaved(undefined);
        setConfirmClear(false);
        setMessage("Batch files and checkpoints were cleared from this device.");
        requestAnimationFrame(() => uploader.current?.focus());
      }
    });
  }

  const busy = activity !== "idle";
  const rows = saved?.rows ?? [];
  const completed = rows.filter((row) => row.status === "succeeded").length;
  const processed = rows.filter(
    (row) => row.status === "succeeded" || row.status === "failed" || row.status === "review",
  ).length;
  const remaining = rows.filter((row) => row.status === "queued" || row.status === "blocked").length;
  const attention = rows.filter(
    (row) =>
      row.status !== "queued" &&
      row.status !== "succeeded" &&
      (row.status !== "sending" || activity !== "running"),
  ).length;
  const estimate = rows.reduce((sum, row) => sum + row.estimatedMaximum, 0);
  const filtered = rows.flatMap((row, index) => {
    if (scope === "remaining" && row.status !== "queued" && row.status !== "blocked") return [];
    if (scope === "attention" && (row.status === "queued" || row.status === "succeeded")) return [];
    if (scope === "completed" && row.status !== "succeeded") return [];
    return [{ row, index }];
  });

  return (
    <>
      {!inferenceEnabled && (
        <p className={styles.notice} role="status">
          Inference is unavailable for this workspace. You can still open and download saved results.
        </p>
      )}
      <p aria-live="polite" className={styles.message}>
        {message}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!saved ? (
        <section className={styles.panel} aria-labelledby="batch-input-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="batch-input-title">Prepare a batch</h2>
              <p className="caption">
                Upload up to 200 nonstreaming Chat Completions requests in one JSONL file, up to 4 MiB.
              </p>
            </div>
            <button
              className="button quiet"
              type="button"
              onClick={() => downloadFile("sonnely-batch-example.jsonl", JSON.stringify(example) + "\n")}
            >
              <Download size={16} aria-hidden="true" /> Download example
            </button>
          </div>
          <label className={styles.upload}>
            <Upload size={18} aria-hidden="true" />
            <span>
              <strong>Choose JSONL file</strong>
              <span className="caption">Each line needs a custom ID, endpoint, and request body.</span>
            </span>
            <input
              ref={uploader}
              type="file"
              accept=".jsonl,.ndjson,application/x-ndjson"
              aria-label="Choose JSONL file"
              disabled={busy || !ready}
              onChange={(event) => void importBatch(event)}
            />
          </label>
          {issues && (
            <div role="alert" className={styles.error}>
              <strong>
                Found {issues.count} {issues.count === 1 ? "issue" : "issues"} in this file.
              </strong>
              <ul>
                {issues.lines.map((issue) => (
                  <li key={issue.line}>
                    {issue.line ? "Line " + issue.line + " · " : ""}
                    {issue.detail}
                  </li>
                ))}
              </ul>
              {issues.count > issues.lines.length && <p>Showing the first {issues.lines.length} issues.</p>}
            </div>
          )}
          {!ready && !error && (
            <p role="status" className="caption">
              Opening this device’s batch storage…
            </p>
          )}
          {!ready && error && (
            <button className="button quiet" type="button" onClick={() => void reload()}>
              Retry local storage
            </button>
          )}
        </section>
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="batch-summary-title">
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="batch-summary-title" ref={summaryHeading} tabIndex={-1}>
                  {saved.filename}
                </h2>
                <p className="caption">
                  This batch and its checkpoints are stored in this browser for your wallet.
                </p>
              </div>
              <div className={styles.actions}>
                {activity === "running" ? (
                  <button
                    className="button quiet"
                    type="button"
                    disabled={pausing}
                    onClick={() => {
                      task.current?.abort();
                      setPausing(true);
                    }}
                  >
                    <Pause size={16} aria-hidden="true" /> {pausing ? "Pausing…" : "Pause batch"}
                  </button>
                ) : (
                  <button
                    className="button accent"
                    type="button"
                    disabled={busy || !remaining || !inferenceEnabled || confirmClear}
                    onClick={() => void run(saved.id)}
                  >
                    <Play size={16} aria-hidden="true" />{" "}
                    {rows.every((row) => row.status === "queued") ? "Run batch" : "Resume batch"}
                  </button>
                )}
                <button className="button quiet" type="button" disabled={busy} onClick={() => void reload()}>
                  <RefreshCw size={16} aria-hidden="true" /> Refresh saved batch
                </button>
              </div>
            </div>
            <dl className={styles.stats}>
              <div>
                <dt>Requests</dt>
                <dd>{rows.length}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{completed}</dd>
              </div>
              <div>
                <dt>Needs attention</dt>
                <dd>{attention}</dd>
              </div>
              <div>
                <dt>Estimated max reservation</dt>
                <dd>{creditBalance(estimate)}</dd>
              </div>
            </dl>
            <progress
              aria-label="Batch rows processed"
              max={rows.length}
              value={processed}
              className={styles.progress}
            />
            <p className="caption">
              Requests run one at a time at standard inference rates. Pausing lets the current request finish.
              Resume dispatches queued and blocked rows. Retry an interrupted row individually to keep its
              original checkpoint key.
            </p>
          </section>
          <section className={styles.panel} aria-labelledby="batch-rows-title">
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="batch-rows-title">Requests</h2>
                <p className="caption">Filter by status or export the saved results and checkpoints.</p>
              </div>
              <label className={styles.filter}>
                Show
                <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
                  <option value="all">All requests</option>
                  <option value="remaining">Queued and blocked</option>
                  <option value="attention">Needs attention</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
            <div className={styles.rows}>
              {filtered.map(({ row, index }) => (
                <article className={styles.row} key={row.customId}>
                  <div className={styles.requestName}>
                    <strong>{row.customId}</strong>
                    <span className="caption">
                      {row.body.model} · {providerNames[row.body.provider.only[0]]}
                    </span>
                  </div>
                  <div>
                    <span className={styles.badge} data-status={row.status}>
                      {row.status === "sending" && activity === "running"
                        ? "In progress"
                        : statusLabels[row.status]}
                    </span>
                    {row.detail && <p className="caption">{row.detail}</p>}
                  </div>
                  <div className={styles.actions}>
                    {row.reference && (
                      <Link
                        className="text-link"
                        href={"/console/logs?request=" + encodeURIComponent(row.reference)}
                      >
                        Request details <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                    {(row.status === "interrupted" || row.status === "sending") && activity !== "running" && (
                      <button
                        className="button quiet small"
                        type="button"
                        disabled={busy || !inferenceEnabled || confirmClear}
                        onClick={() => void run(saved.id, index)}
                      >
                        Retry interrupted request<span className="visually-hidden"> {row.customId}</span>
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!filtered.length && <p className="caption">No requests match this status.</p>}
            </div>
            <div className={styles.actions}>
              <button
                className="button quiet"
                type="button"
                disabled={!completed}
                onClick={() => downloadFile("sonnely-batch-results.jsonl", batchExport(saved, "results"))}
              >
                <Download size={16} aria-hidden="true" /> Download results
              </button>
              <button
                className="button quiet"
                type="button"
                disabled={completed === rows.length}
                onClick={() =>
                  downloadFile("sonnely-batch-checkpoints.jsonl", batchExport(saved, "needs-attention"))
                }
              >
                <Download size={16} aria-hidden="true" /> Download errors and status
              </button>
              {!confirmClear && (
                <button
                  className="button quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmClear(true)}
                >
                  Clear saved batch
                </button>
              )}
            </div>
            {confirmClear && (
              <div className={styles.notice}>
                <p>
                  Clearing removes this device’s results and checkpoints. Export any files you want to keep
                  first.
                </p>
                <div className={styles.actions}>
                  <button
                    className="button quiet"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmClear(false)}
                  >
                    Keep batch
                  </button>
                  <button
                    className="button accent"
                    type="button"
                    disabled={busy}
                    onClick={() => void clearBatch(saved.id)}
                  >
                    Clear this batch
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function BatchPanel({
  wallet,
  inferenceEnabled,
  providers,
  agentFeatures,
}: {
  wallet?: string;
  inferenceEnabled: boolean;
  providers: readonly ProviderId[];
  agentFeatures: boolean;
}) {
  return (
    <>
      <WorkspaceHeading
        icon={Files}
        title="Batch"
        description="Run a JSONL file through private inference and save the results on this device."
      >
        <Link className="button quiet" href="/docs/batch">
          Batch guide <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </WorkspaceHeading>
      {wallet ? (
        <BatchWorkspace
          key={wallet}
          wallet={wallet}
          inferenceEnabled={inferenceEnabled}
          providers={providers}
          agentFeatures={agentFeatures}
        />
      ) : (
        <section className={styles.panel}>
          <p>Sign in with a Solana wallet to open Batch.</p>
        </section>
      )}
    </>
  );
}
