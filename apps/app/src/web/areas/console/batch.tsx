/* eslint-disable better-tailwindcss/no-unknown-classes, no-restricted-syntax -- this area intentionally uses the migrated batch class names and keeps the checkpoint workflow together */
// spec/app/console/batch.md, "Story: Prepare and run a batch"
import { ArrowUpRight, Download, Files, KeyRound, Pause, Play, RefreshCw, Upload } from "lucide-react";
import { Suspense, use, useCallback, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { z } from "zod";
import type { Batch } from "../../../../gen/app__console__batch.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import { useRemote, type Remote } from "../../remote.ts";
import { useWorkspaceSession } from "./frame.tsx";
import { WorkspaceHeading, creditBalance } from "./bits.tsx";
import { providerIds, providerNames } from "./logs-shared.tsx";
import "./logs.css";
import "./batch.css";

const batchLimits = { rows: 200, bytes: 4 * 1024 * 1024, delayMs: 5000 } as const;
const batchEndpoint = "/v1/chat/completions";
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

const requestLimits = { bodyBytes: 36_000, messages: 32, charactersPerMessage: 12_000, defaultOutputTokens: 512, maxOutputTokens: 2_048 } as const;
const toolName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const callId = z.string().min(1).max(200);
const jsonSchema = z.record(z.string(), z.json());
const functionTool = z.strictObject({
  type: z.literal("function"),
  function: z.strictObject({
    name: toolName,
    description: z.string().max(2048).optional(),
    parameters: jsonSchema.optional(),
    strict: z.boolean().nullable().optional(),
  }),
});
const toolChoice = z.union([
  z.enum(["auto", "none", "required"]),
  z.strictObject({ type: z.literal("function"), function: z.strictObject({ name: toolName }) }),
]);
const toolCall = z.object({
  id: callId,
  type: z.literal("function"),
  function: z.object({ name: toolName, arguments: z.string() }),
});
const responseFormat = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text") }),
  z.strictObject({ type: z.literal("json_object") }),
  z.strictObject({
    type: z.literal("json_schema"),
    json_schema: z.strictObject({
      name: toolName,
      description: z.string().max(2048).optional(),
      schema: jsonSchema,
      strict: z.boolean().nullable().optional(),
    }),
  }),
]);
const messageText = z.string().min(1).max(requestLimits.charactersPerMessage);
const completionMessage = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("system"), content: messageText }),
  z.strictObject({ role: z.literal("user"), content: messageText }),
  z.strictObject({
    role: z.literal("assistant"),
    content: messageText.nullable().optional(),
    tool_calls: z.array(toolCall).min(1).max(16).optional(),
  }),
  z.strictObject({ role: z.literal("tool"), content: messageText, tool_call_id: z.string().min(1).max(200) }),
]);
const providerPin = z.strictObject({ only: z.tuple([z.enum(providerIds)]) });
const batchBody = z.strictObject({
  model: z.string().min(1).max(100),
  messages: z.array(completionMessage).min(1).max(requestLimits.messages),
  max_tokens: z.int().min(1).max(requestLimits.maxOutputTokens).optional(),
  max_cost_microusd: z.int().positive().optional(),
  provider: providerPin.optional(),
  stream: z.literal(false).optional(),
  tools: z.array(functionTool).min(1).max(16).optional(),
  tool_choice: toolChoice.optional(),
  response_format: responseFormat.optional(),
});
const batchRequestBody = batchBody.extend({ provider: providerPin, max_cost_microusd: z.int().positive() });
const inputLine = z.strictObject({
  custom_id: z.string().trim().min(1).max(120).regex(/^[^\p{Cc}]+$/u),
  method: z.literal("POST"),
  url: z.enum([batchEndpoint, "/api/sonnely/v1/chat/completions", "/chat/completions"]),
  body: batchBody,
});
const batchStatuses = ["queued", "sending", "succeeded", "failed", "blocked", "interrupted", "review"] as const;
const batchRowSchema = z.object({
  customId: z.string(),
  body: batchRequestBody,
  estimatedMaximum: z.int().nonnegative(),
  status: z.enum(batchStatuses),
  detail: z.string().optional(),
  reference: z.string().optional(),
  httpStatus: z.int().optional(),
  output: z.unknown().optional(),
});
const batchJobSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  filename: z.string(),
  createdAt: z.int(),
  lastSentAt: z.int().optional(),
  rows: z.array(batchRowSchema).min(1).max(batchLimits.rows),
});
type BatchRow = z.infer<typeof batchRowSchema>;
type BatchJob = z.infer<typeof batchJobSchema>;
type BatchIssue = { line: number; detail: string };

type ProviderId = (typeof providerIds)[number];

const chatRoutes = catalog.flatMap((model) =>
  model.routes
    .filter((route) => route.endpoint === "chat/completions")
    .map((route) => ({ provider: model.provider as ProviderId, modelId: route.modelId, input: route.input, output: route.output })),
);

function downloadFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type BatchBoot = { job: BatchJob | undefined; error: string };

const storeName = "wallets";

function openBatchDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open("sonnely-batch-inference", 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(storeName);
    opening.onerror = () => reject(new Error("Batch storage is unavailable on this device."));
    opening.onsuccess = () => resolve(opening.result);
  });
}

function savedBatchJob(value: unknown): BatchJob | undefined {
  const parsed = batchJobSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

async function readBatch(wallet: string) {
  const database = await openBatchDatabase();
  try {
    return await new Promise<BatchJob | undefined>((resolve, reject) => {
      const reading = database.transaction(storeName).objectStore(storeName).get(wallet);
      reading.onsuccess = () => {
        if (reading.result === undefined) {
          resolve(undefined);
          return;
        }
        const job = savedBatchJob(reading.result);
        if (!job) reject(new Error("This device’s saved batch cannot be opened."));
        else resolve(job);
      };
      reading.onerror = () => reject(new Error("Could not read this device’s saved batch."));
    });
  } finally {
    database.close();
  }
}

function rememberBatch(wallet: string, job: BatchJob | undefined, error = "") {
  const reading = batchReads.get(wallet);
  if (reading) {
    reading.boot.job = job ? resetInFlight(job) : undefined;
    reading.boot.error = error;
  }
}

async function writeBatch(wallet: string, job?: BatchJob) {
  const database = await openBatchDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const writing = database.transaction(storeName, "readwrite");
      if (job) writing.objectStore(storeName).put(job, wallet);
      else writing.objectStore(storeName).delete(wallet);
      writing.oncomplete = () => {
        rememberBatch(wallet, job);
        resolve();
      };
      writing.onerror = () => reject(new Error("Could not save this device’s batch checkpoint."));
    });
  } finally {
    database.close();
  }
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

function waitForBatchSlot(lastSentAt: number | undefined, signal: AbortSignal) {
  const delay = Math.max(0, (lastSentAt ?? 0) + batchLimits.delayMs - Date.now());
  if (!delay || signal.aborted) return;
  return new Promise<void>((resolve) => {
    const slot = AbortSignal.timeout(delay);
    const done = () => {
      slot.removeEventListener("abort", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    slot.addEventListener("abort", done, { once: true });
    signal.addEventListener("abort", done, { once: true });
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function routeCapabilities(modelId: string, provider: string) {
  const deepseek = modelId === "deepseek-ai/DeepSeek-V4.1-Flash-1017";
  return {
    tools: deepseek && (provider === "phala" || provider === "tinfoil") && agentFeatures,
    structured_outputs: deepseek && provider === "tinfoil" && agentFeatures,
  };
}

const agentFeatures = false;
const knownModels = new Set(chatRoutes.map((route) => route.modelId));

function prepareLine(value: unknown): { row: BatchRow } | { issue: string } {
  const parsed = inputLine.safeParse(value);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".");
    return { issue: path ? "Check " + path + " for a nonstreaming chat request." : "Expected a JSONL chat request." };
  }
  const { custom_id: customId, body } = parsed.data;
  if (!knownModels.has(body.model)) return { issue: "The model is not in the Sonnely chat catalog." };
  const requested = body.provider?.only[0];
  const route = chatRoutes.find((candidate) => candidate.modelId === body.model && (requested ? candidate.provider === requested : candidate.provider === "near-ai"))
    ?? chatRoutes.find((candidate) => candidate.modelId === body.model && (!requested || candidate.provider === requested));
  if (!route) return { issue: "No available route matches this model and provider." };
  const capabilities = routeCapabilities(body.model, route.provider);
  const usesTools = body.tools || body.tool_choice !== undefined || body.messages.some((item) => item.role === "tool" || (item.role === "assistant" && item.tool_calls));
  if (usesTools && !capabilities.tools) return { issue: "Tool calls are unavailable on this route." };
  if (body.response_format && body.response_format.type !== "text" && !capabilities.structured_outputs) return { issue: "Structured output is unavailable on this route." };
  if (body.tool_choice && !body.tools) return { issue: "tool_choice requires tools." };
  if (body.messages.some((item) => item.role === "assistant" && !item.content && !item.tool_calls)) return { issue: "Assistant messages require content or tool calls." };
  const shape = { tools: body.tools, tool_choice: body.tool_choice, response_format: body.response_format };
  const bytes = utf8.encode(JSON.stringify(body.messages)).length + (body.tools || body.tool_choice || body.response_format ? utf8.encode(JSON.stringify(shape)).length : 0);
  const estimatedMaximum = Math.max(1, Math.ceil((route.input * (bytes + 256)) / 1_000_000 + (route.output * (body.max_tokens ?? requestLimits.defaultOutputTokens)) / 1_000_000));
  if (body.max_cost_microusd !== undefined && estimatedMaximum > body.max_cost_microusd) return { issue: "The reservation estimate exceeds max_cost_microusd." };
  const request: BatchRow["body"] = { ...body, provider: { only: [route.provider] }, max_cost_microusd: body.max_cost_microusd ?? estimatedMaximum };
  if (utf8.encode(JSON.stringify(request)).length > requestLimits.bodyBytes) return { issue: "The request exceeds Sonnely’s per-request body limit." };
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

const keyShape = /^sonnely_live_[A-Za-z0-9_-]{20,80}$/;

function batchKeyError(httpStatus: number | undefined) {
  return httpStatus === 401;
}

async function sendBatchRow(wallet: string, key: string, jobId: string, index: number, row: BatchRow): Promise<BatchRow> {
  try {
    const response = await fetch("/api/sonnely/batch/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "idempotency-key": `batch:${jobId}:${index}`,
        "x-sonnely-batch-wallet": wallet,
      },
      body: JSON.stringify(row.body),
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
    if (response.status === 401 && !validReference) return { ...row, status: "blocked", httpStatus: response.status, detail: detail || "The inference key was refused. Paste a valid key and run the batch again." };
    if ([402, 403, 429].includes(response.status) && !validReference) return { ...row, status: "blocked", httpStatus: response.status, detail: detail || "The workspace cannot send more batch requests right now." };
    if ([400, 404, 413, 415, 422].includes(response.status) && !validReference) return { ...row, status: "failed", httpStatus: response.status, detail: detail || "The batch request was rejected before inference." };
    return validReference
      ? { ...row, status: "review", reference: validReference, httpStatus: response.status, detail: detail || "Check settlement in Request logs." }
      : { ...row, status: "interrupted", httpStatus: response.status, detail: detail || "The request outcome is unknown." };
  } catch (failure) {
    return { ...row, status: "interrupted", detail: failure instanceof Error ? failure.message.slice(0, 240) : "The request outcome is unknown." };
  }
}

function workMessage(error: unknown) {
  return error instanceof Error ? error.message : "Batch could not continue.";
}

export function BatchSection() {
  const session = useWorkspaceSession();
  const machine = useRemote<Batch>("console__batch");
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  if (!wallet) {
    return (
      <div className="telemetry-legacy batch-legacy">
        <WorkspaceHeading icon={Files} title="Batch" description="Run a JSONL file through private inference and save the results on this device.">
          <a className="button quiet" href="/docs/batch">Batch guide <ArrowUpRight size={15} aria-hidden="true" /></a>
        </WorkspaceHeading>
        <section className="panel batch-panel-section"><p>Sign in with a Solana wallet to open Batch.</p></section>
      </div>
    );
  }
  return (
    <Suspense fallback={null}>
      <BatchWorkspace key={wallet} wallet={wallet} machine={machine} />
    </Suspense>
  );
}

const batchReads = new Map<string, { promise: Promise<BatchBoot>; boot: BatchBoot }>();

function readBoot(wallet: string) {
  let reading = batchReads.get(wallet);
  if (!reading) {
    const boot: BatchBoot = { job: undefined, error: "" };
    const promise = readBatch(wallet)
      .then((job) => {
        boot.job = job ? resetInFlight(job) : undefined;
        return boot;
      })
      .catch((failure) => {
        boot.error = workMessage(failure);
        return boot;
      });
    reading = { promise, boot };
    batchReads.set(wallet, reading);
  }
  return reading.promise;
}

function BatchWorkspace({ wallet, machine }: { wallet: string; machine: Remote<Batch> }) {
  return <BatchWorkspaceLoaded boot={use(readBoot(wallet))} wallet={wallet} machine={machine} />;
}

function BatchWorkspaceLoaded({ boot, wallet, machine }: { boot: BatchBoot; wallet: string; machine: Remote<Batch> }) {
  const [saved, setSaved] = useState<BatchJob | undefined>(boot.job);
  const [ready, setReady] = useState(!boot.error);
  const [activity, setActivity] = useState<"importing" | "running" | "clearing" | "idle">("idle");
  const [pausing, setPausing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(boot.error);
  const [issues, setIssues] = useState<{ count: number; lines: BatchIssue[] }>();
  const [scope, setScope] = useState<"all" | "remaining" | "attention" | "completed">("all");
  const [inferenceKey, setInferenceKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyError, setKeyError] = useState("");
  const taskRef = useRef<AbortController | undefined>(undefined);
  const focusUploaderRef = useRef(false);
  const focusSummaryRef = useRef(false);
  const noteUploader = useCallback((node: HTMLInputElement | null) => {
    if (node && focusUploaderRef.current) {
      focusUploaderRef.current = false;
      node.focus();
    }
  }, []);
  const noteSummary = useCallback((node: HTMLHeadingElement | null) => {
    if (node && focusSummaryRef.current) {
      focusSummaryRef.current = false;
      node.focus();
    }
  }, []);

  async function reload() {
    if (taskRef.current) return;
    try {
      const job = await readBatch(wallet);
      rememberBatch(wallet, job);
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
      if (await readBatch(wallet)) throw new Error("Clear the saved batch before importing a new file.");
      const result = preflightBatch(await file.text());
      if (signal.aborted) return;
      if (result.issueCount) {
        setIssues({ count: result.issueCount, lines: result.issues });
        return;
      }
      const next: BatchJob = { version: 1, id: crypto.randomUUID(), filename: file.name, createdAt: Date.now(), rows: result.rows };
      await writeBatch(wallet, next);
      if (machine.state?.tag !== "Idle") await machine.send({ type: "clear" });
      if (!(await machine.send({ type: "submit", id: next.id, filename: next.filename, requests: next.rows.map((row) => ({ customId: row.customId, model: row.body.model })) }))) {
        setError("The batch machine refused this batch, so the progress display may be out of sync. Refresh the saved batch.");
      }
      focusSummaryRef.current = true;
      setSaved(next);
      setScope("all");
      setMessage(`${next.rows.length} ${next.rows.length === 1 ? "request" : "requests"} ready to run.`);
    });
  }

  async function sendMachine(index: number, row: BatchRow) {
    if (row.status === "succeeded") return machine.send({ type: "succeed", index });
    if (row.status === "failed") return machine.send({ type: "failed", index, detail: row.detail ?? "" });
    if (row.status === "blocked") return machine.send({ type: "block", index, detail: row.detail ?? "" });
    if (row.status === "interrupted") return machine.send({ type: "interrupt", index, detail: row.detail ?? "" });
    if (row.status === "review") return machine.send({ type: "review", index, detail: row.detail ?? "" });
    return true;
  }

  function useKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = keyDraft.trim();
    if (!keyShape.test(key)) {
      setKeyError("Paste a workspace inference key beginning with sonnely_live_. Create one under API keys with the inference scope.");
      return;
    }
    setInferenceKey(key);
    setKeyDraft("");
    setKeyError("");
    setError("");
  }

  function forgetKey() {
    setInferenceKey("");
    setKeyDraft("");
    setKeyError("");
  }

  async function run(jobId: string, retryIndex?: number) {
    if (!wallet) return;
    const key = inferenceKey;
    if (!keyShape.test(key)) {
      setError("Batch requests authenticate with a workspace inference key. Paste one below before running.");
      return;
    }
    await operate("running", async (signal) => {
      const loaded = await readBatch(wallet);
      if (!loaded || loaded.id !== jobId) throw new Error("This batch changed in another tab. Refresh the saved batch.");
      let job = resetInFlight(loaded);
      if (job !== loaded) await writeBatch(wallet, job);
      setSaved(job);
      const selected = job.rows.flatMap((row, index) => (retryIndex === undefined ? row.status === "queued" || row.status === "blocked" : index === retryIndex && row.status === "interrupted") ? [index] : []);
      for (const index of selected) {
        if (signal.aborted) break;
        await waitForBatchSlot(job.lastSentAt, signal);
        if (signal.aborted) break;
        const previous = job.rows[index];
        const row: BatchRow = { customId: previous.customId, body: previous.body, estimatedMaximum: previous.estimatedMaximum, status: "sending" };
        const started = { ...replaceRow(job, index, row), lastSentAt: Date.now() };
        await writeBatch(wallet, started);
        if (signal.aborted) {
          await writeBatch(wallet, job);
          break;
        }
        if (retryIndex === index && !(await machine.send({ type: "retry", index }))) {
          await writeBatch(wallet, job);
          throw new Error("The batch machine refused to retry this row. Refresh the saved batch before running again.");
        }
        if (!(await machine.send({ type: "start", index }))) {
          await writeBatch(wallet, job);
          throw new Error("The batch machine refused to start this row, so the request was not sent. Refresh the saved batch before running again.");
        }
        setSaved(started);
        const result = await sendBatchRow(wallet, key, job.id, index, row);
        job = replaceRow(started, index, result);
        await writeBatch(wallet, job);
        if (!(await sendMachine(index, result))) {
          setError("The batch machine rejected a row update, so the progress display may be out of sync. Refresh the saved batch.");
        }
        setSaved(job);
        if (batchKeyError(result.httpStatus)) {
          setInferenceKey("");
          setKeyError("The inference key was refused (HTTP 401), so the batch stopped. Check that the key is active, unexpired and scoped for inference on this wallet, then paste it again.");
          break;
        }
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
      const job = await readBatch(wallet);
      if (!job || job.id !== jobId) throw new Error("This batch changed in another tab. Refresh the saved batch.");
      if (signal.aborted) return;
      await writeBatch(wallet);
      if (!(await machine.send({ type: "clear" }))) {
        setError("The batch machine refused to clear, so the progress display may be out of sync.");
      }
      focusUploaderRef.current = true;
      setSaved(undefined);
      setConfirmClear(false);
      setMessage("Batch files and checkpoints were cleared from this device.");
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
    <div className="telemetry-legacy batch-legacy">
      <WorkspaceHeading icon={Files} title="Batch" description="Run a JSONL file through private inference and save the results on this device.">
        <a className="button quiet" href="/docs/batch">Batch guide <ArrowUpRight size={15} aria-hidden="true" /></a>
      </WorkspaceHeading>
      <p aria-live="polite" className="batch-message">{message}</p>
      {error && <p role="alert" className="error">{error}</p>}
      {machine.error && <p role="alert" className="error">The batch machine reported: {machine.error}</p>}
      {!saved ? (
        <section className="panel batch-panel-section" aria-labelledby="batch-input-title">
          <div className="batch-section-heading">
            <div><h2 id="batch-input-title">Prepare a batch</h2><p className="caption">Upload up to 200 nonstreaming Chat Completions requests in one JSONL file, up to 4 MiB.</p></div>
            <button className="button quiet" type="button" onClick={() => downloadFile("sonnely-batch-example.jsonl", JSON.stringify(example) + "\n")}><Download size={16} aria-hidden="true" /> Download example</button>
          </div>
          <label className="batch-upload">
            <Upload size={18} aria-hidden="true" />
            <span><strong>Choose JSONL file</strong><span className="caption">Each line needs a custom ID, endpoint, and request body.</span></span>
            <input ref={noteUploader} type="file" accept=".jsonl,.ndjson,application/x-ndjson" aria-label="Choose JSONL file" disabled={busy || !ready || !machine.state} onChange={(event) => void importBatch(event)} />
          </label>
          {issues && <div role="alert" className="error batch-issues"><strong>Found {issues.count} {issues.count === 1 ? "issue" : "issues"} in this file.</strong><ul>{issues.lines.map((issue) => <li key={issue.line}>{issue.line ? "Line " + issue.line + " · " : ""}{issue.detail}</li>)}</ul>{issues.count > issues.lines.length && <p>Showing the first {issues.lines.length} issues.</p>}</div>}
          {!ready && !error && <p role="status" className="caption">Opening this device’s batch storage…</p>}
          {!ready && error && <button className="button quiet" type="button" onClick={() => void reload()}>Retry local storage</button>}
        </section>
      ) : (
        <>
          <section className="panel batch-panel-section" aria-labelledby="batch-key-title">
            <div className="batch-section-heading">
              <div>
                <h2 id="batch-key-title">Inference key</h2>
                <p className="caption">
                  Batch rows authenticate with one of your workspace inference keys. The key you paste stays in this tab’s memory only: it is never
                  saved to this device or sent anywhere but the batch endpoint.
                </p>
              </div>
            </div>
            {inferenceKey ? (
              <div className="batch-key-ready">
                <p role="status"><KeyRound size={15} aria-hidden="true" /> Key ready for this tab.</p>
                <button className="button quiet small" type="button" disabled={busy} onClick={forgetKey}>Use a different key</button>
              </div>
            ) : (
              <form className="batch-key-form" onSubmit={useKey}>
                <label>
                  Workspace inference key
                  <input
                    type="password"
                    name="inference-key"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="sonnely_live_…"
                    minLength={32}
                    maxLength={100}
                    required
                    value={keyDraft}
                    onChange={(event) => setKeyDraft(event.target.value)}
                  />
                </label>
                <div className="batch-actions">
                  <button className="button accent" type="submit">Use this key</button>
                  <a className="button quiet" href="/console/keys">Create a key <ArrowUpRight size={14} aria-hidden="true" /></a>
                </div>
                {keyError && <p role="alert" className="error">{keyError}</p>}
              </form>
            )}
          </section>
          <section className="panel batch-panel-section" aria-labelledby="batch-summary-title">
            <div className="batch-section-heading">
              <div><h2 id="batch-summary-title" ref={noteSummary} tabIndex={-1}>{saved.filename}</h2><p className="caption">This batch and its checkpoints are stored in this browser for your wallet.</p></div>
              <div className="batch-actions">
                {activity === "running" ? <button className="button quiet" type="button" disabled={pausing} onClick={() => { taskRef.current?.abort(); setPausing(true); }}><Pause size={16} aria-hidden="true" /> {pausing ? "Pausing…" : "Pause batch"}</button> : <button className="button accent" type="button" disabled={busy || !remaining || confirmClear || !inferenceKey} title={inferenceKey ? undefined : "Paste an inference key first"} onClick={() => void run(saved.id)}><Play size={16} aria-hidden="true" /> {rows.every((row) => row.status === "queued") ? "Run batch" : "Resume batch"}</button>}
                <button className="button quiet" type="button" disabled={busy} onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" /> Refresh saved batch</button>
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
                    {(row.status === "interrupted" || row.status === "sending") && activity !== "running" && <button className="button quiet small" type="button" disabled={busy || confirmClear || !inferenceKey} title={inferenceKey ? undefined : "Paste an inference key first"} onClick={() => void run(saved.id, index)}>Retry interrupted request<span className="visually-hidden"> {row.customId}</span></button>}
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
