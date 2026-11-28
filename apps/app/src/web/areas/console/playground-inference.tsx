/* eslint-disable max-lines-per-function, @eslint-react/naming-convention-ref-name, @eslint-react/naming-convention-id-name -- the workload runner keeps its endpoint matrix and established ref names together */
import { createPortal } from "react-dom";
import { ArrowRight, FileUp, History } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Alert, Button, Input, Textarea } from "@repo/ui";
import { providerIds, providerNames, specializedRoutes } from "./playground-data.ts";
import { PlaygroundCopyButton } from "./playground-copy.tsx";
import { PlaygroundResultContent } from "./playground-result-content.tsx";

export const workloadOptions = {
  responses: { label: "Text response", field: "input", example: "Explain what a Solana transaction fee covers." },
  redact: { label: "PII redaction", field: "text", example: "Contact the sample customer at alice@example.com." },
  embeddings: { label: "Text embeddings", field: "input", example: "Solana transaction" },
  rerank: { label: "Rerank documents", field: "query", example: "Solana network fees" },
  systemone: { label: "System One decisions", field: "state", example: "The request asks about billing." },
  "images/generations": {
    label: "Generate an image",
    field: "prompt",
    example: "A watercolor painting of a quiet harbor at dawn",
  },
  "images/edits": {
    label: "Edit an image",
    field: "prompt",
    example: "Change the lighting to sunset",
    upload: "image",
    accept: "image/png,image/jpeg,image/webp",
  },
  "audio/transcriptions": {
    label: "Transcribe audio",
    upload: "file",
    accept: ".wav,.mp3,.mp4,.webm,.ogg,.flac",
  },
  "audio/translations": {
    label: "Translate audio to English",
    upload: "file",
    accept: ".wav",
    hint: "Use up to 30 seconds of mono 16 kHz PCM16 WAV.",
  },
  "audio/speech": { label: "Synthesize speech", field: "input", example: "Welcome to Sonnely." },
  "convert/file": {
    label: "Convert PDF to Markdown",
    upload: "files",
    accept: "application/pdf",
    hint: "Upload one PDF up to 2 MB.",
  },
  realtime: {
    label: "Realtime transcription",
    upload: "file",
    accept: ".wav",
    hint: "Stream up to 30 seconds of mono 16 kHz PCM16 WAV.",
  },
} as const;

export type Workload = keyof typeof workloadOptions;

type Result = {
  text?: string;
  audioUrl?: string;
  image?: string;
  requestId?: string | null;
  data?: unknown;
  documents?: string[];
};
type Run = { id: string; model: string; provider: string; at: number; title: string; result: Result };

const responseSchema = z.looseObject({
  error: z.looseObject({ message: z.string().optional() }).optional(),
  output: z
    .array(
      z.looseObject({
        type: z.string(),
        content: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  data: z.array(z.looseObject({ b64_json: z.string().optional(), embedding: z.array(z.number()).optional(), index: z.number().optional() })).optional(),
  results: z.array(z.looseObject({ index: z.number(), relevance_score: z.number() })).optional(),
  answers: z.record(z.string(), z.looseObject({ noul: z.number() })).optional(),
  redacted_text: z.string().optional(),
  document: z.looseObject({ md_content: z.string().optional() }).optional(),
  text: z.string().optional(),
});

function isMultipart(endpoint: Workload) {
  return endpoint === "audio/transcriptions" || endpoint === "audio/translations" || endpoint === "images/edits" || endpoint === "convert/file";
}

async function realtime(file: File, signal: AbortSignal, progress: (text: string) => void): Promise<Result> {
  if (file.size <= 44 || file.size > 960_044) throw new Error("Use a WAV file under 30 seconds.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (
    tag(0) !== "RIFF" ||
    tag(8) !== "WAVE" ||
    tag(12) !== "fmt " ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== 16000 ||
    view.getUint16(34, true) !== 16 ||
    tag(36) !== "data" ||
    view.getUint32(40, true) !== bytes.length - 44 ||
    bytes.length % 2
  )
    throw new Error("Use mono 16 kHz PCM16 WAV with a standard 44-byte header.");

  signal.throwIfAborted();
  const url = new URL("/api/sonnely/v1/realtime", window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("model", "voxtral-mini-4b-realtime");
  const socket = new WebSocket(url);
  let transcript = "";
  return new Promise<Result>((resolve, reject) => {
    const abort = () => socket.close();
    signal.addEventListener("abort", abort, { once: true });
    socket.onclose = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.aborted && signal.reason instanceof Error ? signal.reason : new Error("Realtime disconnected before settlement. Check Usage."));
    };
    socket.onmessage = ({ data }) => {
      try {
        const event = JSON.parse(String(data)) as {
          type?: string;
          delta?: string;
          text?: string;
          sonnely_request_id?: string;
          error?: { message?: string };
        };
        if (event.type === "session.created") {
          for (let offset = 44; offset < bytes.length; offset += 6400) {
            if (socket.readyState !== WebSocket.OPEN) return;
            const audio = btoa(String.fromCharCode(...bytes.subarray(offset, offset + 6400)));
            socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
          }
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        } else if (event.type === "transcription.delta") {
          transcript += event.delta ?? "";
          progress(transcript);
        } else if (event.type === "transcription.done") {
          resolve({ text: event.text, requestId: event.sonnely_request_id });
          socket.close();
        } else if (event.type === "error") {
          throw new Error(event.error?.message ?? "Realtime transcription failed.");
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Realtime transcription failed."));
        socket.close();
      }
    };
  });
}

function formText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error instanceof Error ? reader.error : new Error("Could not read audio."));
    reader.readAsDataURL(blob);
  });
}

export function PlaygroundInference({
  endpoint,
  signedIn,
  onRunningChange,
  controls,
}: {
  endpoint: Workload;
  signedIn: boolean;
  onRunningChange: (value: boolean) => void;
  controls: HTMLDivElement | null;
}) {
  const uid = useId();
  const formId = uid + "-request";
  const fileHintId = uid + "-file-hint";
  const pending = useRef<AbortController | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const runButton = useRef<HTMLButtonElement>(null);
  const runHistory = useRef<HTMLDetailsElement>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run>();
  const result = selectedRun?.result;
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileName, setFileName] = useState("");
  const workload = workloadOptions[endpoint];
  const routes = specializedRoutes(endpoint);
  const modelIds = routes.map((route) => route.modelId);
  const model = modelIds.includes(selectedModel) ? selectedModel : (modelIds[0] ?? "");
  const route = routes.find((item) => item.modelId === model);
  const requestPrice = route && route.request >= 0 ? route.request / 1_000_000 : route && route.session >= 0 ? route.session / 1_000_000 : null;
  const provider = route ? providerNames[route.provider] : "";
  const available = Boolean(route && providerIds.includes(route.provider));
  const blocked = !signedIn ? "Sign in with your Solana wallet to run this request." : !available ? "This route is currently unavailable." : "";
  const imageUrl = result?.image ? `data:image/png;base64,${result.image}` : undefined;

  function showResult(value: Result, title: string) {
    const completed = { id: crypto.randomUUID(), model, provider, at: Date.now(), title, result: value };
    setRuns((previous) => [completed, ...previous].slice(0, 5));
    setSelectedRun(completed);
    setPartial("");
  }

  function openRun(run: Run) {
    setSelectedRun(run);
    setPartial("");
    if (runHistory.current) {
      runHistory.current.open = false;
      runHistory.current.querySelector("summary")?.focus({ preventScroll: true });
    }
    setError("");
    setNotice("");
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending.current) return;
    const fields = new FormData(event.currentTarget);
    const input = "field" in workload ? fields.get(workload.field) : null;
    const upload = "upload" in workload ? fields.get(workload.upload) : null;
    const title = (
      typeof input === "string" && input.trim()
        ? input.trim().replace(/\s+/g, " ")
        : upload instanceof File
          ? upload.name
          : workload.label
    ).slice(0, 100);
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    onRunningChange(true);
    setNotice("");
    setError("");
    setPartial("");
    setSelectedRun(undefined);
    try {
      const signal = controller.signal;
      if (endpoint === "realtime") {
        const file = fields.get("file");
        if (!(file instanceof File)) throw new Error("Choose a WAV file.");
        showResult(await realtime(file, signal, setPartial), title);
        return;
      }
      const field = "field" in workload ? workload.field : undefined;
      const value = field ? formText(fields.get(field)) : "";
      const multipart = isMultipart(endpoint);
      const body: Record<string, unknown> = field ? { [field]: value } : {};
      if (endpoint === "rerank") {
        const documents = formText(fields.get("documents"))
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (!documents.length || documents.length > 16) throw new Error("Enter 1 to 16 documents, one per line.");
        body.documents = documents;
      }
      if (endpoint === "systemone") body.questions = { decision: { type: "noul", instructions: fields.get("question") } };
      if ("upload" in workload) {
        const file = fields.get(workload.upload);
        if (file instanceof File && file.size > 2_000_000) throw new Error("Upload a file under 2 MB.");
      }
      const response = await fetch("/api/console/playground/" + endpoint, {
        method: "POST",
        headers: multipart ? undefined : { "Content-Type": "application/json" },
        body: multipart ? fields : JSON.stringify({ ...body, model: fields.get("model") }),
        signal,
      });
      const requestId = response.headers.get("X-Sonnely-Request-Id");
      if (response.ok && endpoint === "audio/speech") {
        showResult({ audioUrl: await blobDataUrl(await response.blob()), requestId }, title);
        return;
      }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) throw new SyntaxError("Unreadable response");
      const data = parsed.data;
      if (!response.ok) throw new Error(data.error?.message ?? "The request failed.");
      const image = endpoint.startsWith("images/") ? data.data?.[0]?.b64_json : undefined;
      const outputText =
        endpoint === "responses"
          ? data.output
              ?.filter((item) => item.type === "message")
              .flatMap((item) => item.content ?? [])
              .filter((part) => part.type === "output_text")
              .map((part) => part.text ?? "")
              .join("\n")
          : undefined;
      showResult(
        {
          image,
          data: endpoint === "rerank" ? data.results : endpoint === "embeddings" ? data.data : endpoint === "systemone" ? data.answers : undefined,
          documents: endpoint === "rerank" ? (body.documents as string[]) : undefined,
          requestId,
          text: image ? undefined : outputText || data.redacted_text || data.document?.md_content || data.text || JSON.stringify(data, null, 2),
        },
        title,
      );
    } catch (cause) {
      if (controller.signal.aborted) setNotice("Stopped waiting. Check Usage for settlement.");
      else setError(cause instanceof SyntaxError ? "The gateway returned an unreadable response." : cause instanceof Error ? cause.message : "The request failed.");
    } finally {
      pending.current = null;
      setBusy(false);
      onRunningChange(false);
      if (document.activeElement === document.body && !controller.signal.aborted) runButton.current?.focus();
    }
  }

  return (
    <div data-playground-editor>
      <div data-playground-editor-title data-playground-run-title>
        <h2>{workload.label}</h2>
        {runs.length > 0 && (
          <details ref={runHistory} data-playground-run-history>
            <summary className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-ui font-medium">
              <History size={16} aria-hidden="true" /> Recent runs
            </summary>
            <div data-playground-run-list>
              <p>Available in this session</p>
              {runs.map((run) => (
                <Button type="button" variant="ghost" key={run.id} disabled={busy} aria-pressed={selectedRun?.id === run.id} onClick={() => openRun(run)} className="h-auto w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left">
                  <strong>{run.title}</strong>
                  <time dateTime={new Date(run.at).toISOString()}>{new Date(run.at).toLocaleTimeString()}</time>
                </Button>
              ))}
            </div>
          </details>
        )}
      </div>
      <section data-playground-pane aria-label="Request">
        {controls &&
          createPortal(
            <div data-playground-model-select>
              <label>
                <span className="sr-only">Model</span>
                <select name="model" form={formId} value={model} disabled={busy} onChange={(event) => setSelectedModel(event.currentTarget.value)}>
                  {modelIds.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
              </label>
            </div>,
            controls,
          )}
        <form id={formId} data-playground-request data-playground-entry onSubmit={(event) => void run(event)}>
          {"field" in workload && (
            <label>
              {workload.field === "query" ? "Search query" : workload.field === "state" ? "State" : workload.field === "prompt" ? "Image prompt" : "Input text"}
              <Textarea name={workload.field} rows={endpoint === "rerank" || endpoint === "systemone" ? 2 : 6} required disabled={busy} defaultValue={workload.example} />
            </label>
          )}
          {endpoint === "rerank" && (
            <label>
              Documents, one per line
              <Textarea name="documents" rows={4} required disabled={busy} defaultValue={"A guide to transaction fees\nHow to resize an image"} />
            </label>
          )}
          {endpoint === "systemone" && (
            <label>
              Decision question
              <Textarea name="question" rows={3} required disabled={busy} defaultValue="Does this request concern billing?" />
            </label>
          )}
          {"upload" in workload && (
            <div data-playground-file>
              <label>
                <span>
                  <FileUp size={18} aria-hidden="true" /> Upload file
                </span>
                <Input
                  className="sr-only"
                  type="file"
                  name={workload.upload}
                  accept={workload.accept}
                  required
                  disabled={busy}
                  aria-describedby={fileHintId}
                  onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")}
                />
              </label>
              <p id={fileHintId}>{"hint" in workload ? workload.hint : "Maximum file size 2 MB."}</p>
              {fileName && <p data-playground-file-name>{fileName}</p>}
            </div>
          )}
          <div data-playground-run-actions>
            <div data-playground-route-summary>
              <strong>{provider}</strong>
              <span>
                {requestPrice === null ? (
                  <a href="/docs/providers">Usage-based pricing</a>
                ) : (
                  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(requestPrice) + " per completed request"
                )}
              </span>
            </div>
            <Button ref={runButton} type="submit" disabled={Boolean(blocked)} aria-disabled={busy}>
              {busy ? "Running…" : "Run request"} <ArrowRight size={17} aria-hidden="true" />
            </Button>
            {busy && (
              <Button type="button" variant="outline" onClick={() => pending.current?.abort()}>
                Stop waiting
              </Button>
            )}
            {blocked && <p>{blocked}</p>}
          </div>
        </form>
      </section>
      <section data-playground-output aria-label="Result" data-idle={(!busy && !result && !error && !notice) || undefined}>
        {(busy || result || error || notice) && (
          <header data-playground-pane-header>
            <div>
              <h2>Result</h2>
              {selectedRun && (
                <p data-playground-result-meta>
                  {selectedRun.provider} · {selectedRun.model}
                </p>
              )}
            </div>
            {result?.text && <PlaygroundCopyButton value={result.text} label="Copy result" />}
          </header>
        )}
        <div data-playground-result>
          <p className={result ? "sr-only" : undefined} data-playground-result-status={result ? undefined : ""} role="status">
            {busy ? "Running request…" : result ? "Request completed." : notice}
          </p>
          {error && (
            <Alert variant="destructive" data-playground-request-error>
              {error}
            </Alert>
          )}
          {partial && (
            <pre tabIndex={0} aria-label="Partial transcript">
              {partial}
            </pre>
          )}
          {result && <PlaygroundResultContent endpoint={endpoint} {...result} imageUrl={imageUrl} audioUrl={result.audioUrl} />}
        </div>
        {result?.requestId && (
          <footer data-playground-result-footer>
            <div>
              <span>Request reference</span>
              <code>{result.requestId}</code>
            </div>
            <a href="/console/usage#recent-request-references">View usage</a>
          </footer>
        )}
      </section>
    </div>
  );
}
