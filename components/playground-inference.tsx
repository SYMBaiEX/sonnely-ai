"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowRight, Download, FileUp } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  isSpecializedMultipart,
  realtimeModel,
  specializedModels,
  specializedRoute,
  type SpecializedEndpoint,
} from "@/lib/specialized-models";
import { markupPercent } from "@/lib/pricing";
import type { ProviderId } from "@/lib/provider-catalog";
import type { Session } from "./wallet";
import { CopyButton } from "./shared";

export const workloadOptions = {
  responses: {
    label: "Text response",
    field: "input",
    example: "Explain what a Solana transaction fee covers.",
  },
  redact: {
    label: "PII redaction",
    field: "text",
    example: "Contact the sample customer at alice@example.com.",
  },
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
} satisfies Record<
  SpecializedEndpoint | "realtime",
  {
    label: string;
    field?: string;
    example?: string;
    upload?: string;
    accept?: string;
    hint?: string;
  }
>;

export type Workload = keyof typeof workloadOptions;
type Result = { text?: string; audio?: Blob; image?: string; requestId?: string | null };

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
  url.searchParams.set("model", realtimeModel.id);
  const socket = new WebSocket(url);
  let transcript = "";
  return new Promise<Result>((resolve, reject) => {
    const abort = () => socket.close();
    signal.addEventListener("abort", abort, { once: true });
    socket.onclose = () => {
      signal.removeEventListener("abort", abort);
      reject(
        signal.aborted ? signal.reason : new Error("Realtime disconnected before settlement. Check Usage."),
      );
    };
    socket.onmessage = async ({ data }) => {
      try {
        const event = JSON.parse(data);
        if (event.type === "session.created") {
          for (let offset = 44; offset < bytes.length; offset += 6400) {
            if (socket.readyState !== WebSocket.OPEN) return;
            const audio = btoa(String.fromCharCode(...bytes.subarray(offset, offset + 6400)));
            socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
            await new Promise((done) => setTimeout(done, 75));
          }
          if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        } else if (event.type === "transcription.delta") {
          transcript += event.delta;
          progress(transcript);
        } else if (event.type === "transcription.done") {
          resolve({ text: event.text, requestId: event.sonnely_request_id });
          socket.close();
        } else if (event.type === "error") {
          throw new Error(event.error?.message ?? "Realtime transcription failed.");
        }
      } catch (error) {
        reject(error);
        socket.close();
      }
    };
  });
}

export function PlaygroundInference({
  endpoint,
  session,
  providers,
  refresh,
  onRunningChange,
  controls,
}: {
  endpoint: Workload;
  session: Session | null;
  providers: ProviderId[];
  refresh: () => Promise<void>;
  onRunningChange: (value: boolean) => void;
  controls: HTMLDivElement | null;
}) {
  const uid = useId();
  const formId = uid + "-request";
  const fileHintId = uid + "-file-hint";
  const pending = useRef<AbortController | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [result, setResult] = useState<Result>();
  const [audioUrl, setAudioUrl] = useState<string>();
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileName, setFileName] = useState("");
  const workload = workloadOptions[endpoint];
  const modelIds = endpoint === "realtime" ? [realtimeModel.id] : Object.keys(specializedModels[endpoint]);

  const model = modelIds.includes(selectedModel) ? selectedModel : modelIds[0];
  const route =
    endpoint === "realtime" ? { ...realtimeModel, unit: "request" } : specializedRoute(endpoint, model);
  const requestPrice = route?.unit === "request" ? route.rate * (1 + markupPercent / 100) : null;
  const provider = route?.provider === "near-ai" ? "NEAR AI" : "Tinfoil";
  const available = Boolean(route && providers.includes(route.provider));
  const blocked = !session?.profile
    ? "Sign in with your Solana wallet to run this request."
    : session.termsRequired
      ? "Accept the workspace terms to run inference."
      : !session.inferenceEnabled || !available
        ? "This route is currently unavailable."
        : "";
  const imageUrl = result?.image ? `data:image/png;base64,${result.image}` : undefined;

  useEffect(() => {
    if (!result?.audio) {
      setAudioUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(result.audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result?.audio]);

  useEffect(() => () => pending.current?.abort(), []);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending.current) return;
    const fields = new FormData(event.currentTarget);
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    onRunningChange(true);
    setNotice("");
    setError("");
    setPartial("");
    setResult(undefined);
    try {
      const signal = controller.signal;
      if (endpoint === "realtime") {
        setResult(await realtime(fields.get("file") as File, signal, setPartial));
        void refresh().catch(() => {});
        return;
      }
      const field = "field" in workload ? workload.field : undefined;
      const value = field ? String(fields.get(field) ?? "") : "";
      const multipart = isSpecializedMultipart(endpoint);
      const body: Record<string, unknown> = field ? { [field]: value } : {};
      if (endpoint === "rerank") {
        const documents = String(fields.get("documents") ?? "")
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (!documents.length || documents.length > 16)
          throw new Error("Enter 1 to 16 documents, one per line.");
        body.documents = documents;
      }
      if (endpoint === "systemone") {
        body.questions = { decision: { type: "noul", instructions: fields.get("question") } };
      }
      if ("upload" in workload) {
        const file = fields.get(workload.upload);
        if (file instanceof File && file.size > 2_000_000) throw new Error("Upload a file under 2 MB.");
      }
      const response = await fetch("/api/sonnely/playground/" + endpoint, {
        method: "POST",
        headers: multipart ? undefined : { "Content-Type": "application/json" },
        body: multipart ? fields : JSON.stringify({ ...body, model: fields.get("model") }),
        signal,
      });
      const requestId = response.headers.get("X-Sonnely-Request-Id");
      if (response.ok && endpoint === "audio/speech") {
        setResult({ audio: await response.blob(), requestId });
        void refresh().catch(() => {});
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "The request failed.");
      const image = endpoint.startsWith("images/") ? data.data?.[0]?.b64_json : undefined;
      const outputText =
        endpoint === "responses"
          ? data.output
              ?.filter((item: { type: string }) => item.type === "message")
              .flatMap((item: { content?: { type: string; text: string }[] }) => item.content ?? [])
              .filter((part: { type: string }) => part.type === "output_text")
              .map((part: { text: string }) => part.text)
              .join("\n")
          : undefined;
      setResult({
        image,
        requestId,
        text: image
          ? undefined
          : outputText ||
            data.redacted_text ||
            data.document?.md_content ||
            data.text ||
            JSON.stringify(data, null, 2),
      });
      void refresh().catch(() => {});
    } catch (cause) {
      if (controller.signal.aborted) setNotice("Stopped waiting. Check Usage for settlement.");
      else
        setError(
          cause instanceof SyntaxError
            ? "The gateway returned an unreadable response."
            : cause instanceof Error
              ? cause.message
              : "The request failed.",
        );
    } finally {
      pending.current = null;
      setBusy(false);
      onRunningChange(false);
      setPartial("");
    }
  }

  return (
    <div className="playground-editor">
      <div className="playground-editor-title">
        <h2>{workload.label}</h2>
      </div>
      <section className="playground-pane" aria-label="Request">
        {controls &&
          createPortal(
            <div className="playground-model-select">
              <label>
                <span className="visually-hidden">Model</span>
                <select
                  name="model"
                  form={formId}
                  value={model}
                  disabled={busy}
                  onChange={(event) => setSelectedModel(event.currentTarget.value)}
                >
                  {modelIds.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
              </label>
            </div>,
            controls,
          )}
        <form id={formId} className="playground-request playground-entry" onSubmit={run}>
          {"field" in workload && (
            <label>
              {workload.field === "query"
                ? "Search query"
                : workload.field === "state"
                  ? "State"
                  : workload.field === "prompt"
                    ? "Image prompt"
                    : "Input text"}
              <textarea
                name={workload.field}
                rows={endpoint === "rerank" || endpoint === "systemone" ? 2 : 6}
                required
                disabled={busy}
                defaultValue={workload.example}
              />
            </label>
          )}
          {endpoint === "rerank" && (
            <label>
              Documents, one per line
              <textarea
                name="documents"
                rows={4}
                required
                disabled={busy}
                defaultValue={"A guide to transaction fees\nHow to resize an image"}
              />
            </label>
          )}
          {endpoint === "systemone" && (
            <label>
              Decision question
              <textarea
                name="question"
                rows={3}
                required
                disabled={busy}
                defaultValue="Does this request concern billing?"
              />
            </label>
          )}
          {"upload" in workload && (
            <div className="playground-file">
              <label>
                <span>
                  <FileUp size={18} aria-hidden="true" /> Upload file
                </span>
                <input
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
              {fileName && <p className="playground-file-name">{fileName}</p>}
            </div>
          )}
          <div className="playground-run-actions">
            <div className="playground-route-summary">
              <strong>{provider}</strong>
              <span>
                {requestPrice === null ? (
                  <Link href="/docs/providers">Usage-based pricing</Link>
                ) : (
                  new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 6,
                  }).format(requestPrice) + " per completed request"
                )}
              </span>
            </div>

            <button className="button accent" type="submit" disabled={Boolean(blocked)} aria-disabled={busy}>
              {busy ? "Running…" : "Run request"} <ArrowRight size={17} aria-hidden="true" />
            </button>
            {busy && (
              <button type="button" className="button quiet" onClick={() => pending.current?.abort()}>
                Stop waiting
              </button>
            )}
            {blocked && <p>{blocked}</p>}
          </div>
        </form>
      </section>
      <section
        className="playground-output"
        aria-label="Result"
        data-idle={(!busy && !result && !error && !notice) || undefined}
      >
        {(busy || result || error || notice) && (
          <header className="playground-pane-header">
            <h2>Result</h2>
            {result?.text && <CopyButton value={result.text} label="Copy result" />}
          </header>
        )}
        <div className="playground-result">
          <p className="playground-result-status" role="status">
            {busy ? "Running request…" : result ? "Request completed." : notice}
          </p>
          {error && (
            <p className="playground-request-error" role="alert">
              {error}
            </p>
          )}
          {partial && (
            <pre tabIndex={0} aria-label="Partial transcript">
              {partial}
            </pre>
          )}
          {result?.text && (
            <pre tabIndex={0} aria-label="Response output">
              {result.text}
            </pre>
          )}
          {imageUrl && (
            <>
              <img src={imageUrl} alt="Image returned by the model" />
              <a className="button quiet small" download="sonnely-image.png" href={imageUrl}>
                <Download size={16} aria-hidden="true" /> Download image
              </a>
            </>
          )}
          {result?.audio && audioUrl && (
            <>
              <audio controls src={audioUrl} aria-label="Synthesized speech" />
              <a className="button quiet small" download="sonnely-speech.wav" href={audioUrl}>
                <Download size={16} aria-hidden="true" /> Download WAV
              </a>
            </>
          )}
        </div>
        {result?.requestId && (
          <footer className="playground-result-footer">
            <div>
              <span>Request reference</span>
              <code>{result.requestId}</code>
            </div>
            <Link href="/console/usage">View usage</Link>
          </footer>
        )}
      </section>
    </div>
  );
}
