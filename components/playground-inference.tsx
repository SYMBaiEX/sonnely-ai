"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isSpecializedMultipart, realtimeModel, specializedModels, specializedRoute, type SpecializedEndpoint } from "@/lib/specialized-models";
import { markupPercent } from "@/lib/pricing";
import { CopyButton } from "./shared";

const workloads = {
  responses: { label: "Text response", field: "input", example: "Explain what a Solana transaction fee covers." },
  redact: { label: "PII redaction", field: "text", example: "Contact the sample customer at alice@example.com." },
  embeddings: { label: "Text embeddings", field: "input", example: "Solana transaction" },
  rerank: { label: "Rerank documents", field: "JSON", example: '{"query":"Solana network fees","documents":["A guide to transaction fees","How to resize an image"]}' },
  systemone: { label: "System One decisions", field: "JSON", example: '{"state":"The request asks about billing.","questions":{"billing":{"type":"noul","instructions":"Does this request concern billing?"}}}' },
  "images/generations": { label: "Generate an image", field: "prompt", example: "A watercolor painting of a quiet harbor at dawn" },
  "images/edits": { label: "Edit an image", field: "prompt", example: "Change the lighting to sunset", upload: "image", accept: "image/png,image/jpeg,image/webp" },
  "audio/transcriptions": { label: "Transcribe audio", upload: "file", accept: ".wav,.mp3,.mp4,.webm,.ogg,.flac" },
  "audio/translations": { label: "Translate audio to English", upload: "file", accept: ".wav", hint: "Use up to 30 seconds of mono 16 kHz PCM16 WAV." },
  "audio/speech": { label: "Synthesize speech", field: "input", example: "Welcome to Sonnely." },
  "convert/file": { label: "Convert PDF to Markdown", upload: "files", accept: "application/pdf", hint: "Upload one PDF up to 2 MB." },
  realtime: { label: "Realtime transcription", upload: "file", accept: ".wav", hint: "Stream up to 30 seconds of mono 16 kHz PCM16 WAV." },
} satisfies Record<SpecializedEndpoint | "realtime", {
  label: string;
  field?: string;
  example?: string;
  upload?: string;
  accept?: string;
  hint?: string;
}>;

type Workload = keyof typeof workloads;
type Result = { text?: string; audio?: Blob; image?: string; requestId?: string | null };

async function realtime(file: File, signal: AbortSignal, progress: (text: string) => void): Promise<Result> {
  if (file.size <= 44 || file.size > 960_044) throw new Error("Use a WAV file under 30 seconds.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " ||
      view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 ||
      view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 ||
      view.getUint16(34, true) !== 16 || tag(36) !== "data" ||
      view.getUint32(40, true) !== bytes.length - 44 || bytes.length % 2)
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
      reject(signal.aborted ? signal.reason : new Error("Realtime disconnected before settlement. Check Usage."));
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
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
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

export function PlaygroundInference({ signedIn }: { signedIn: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [endpoint, setEndpoint] = useState<Workload>("responses");
  const [selectedModel, setSelectedModel] = useState("");
  const [result, setResult] = useState<Result>();
  const [audioUrl, setAudioUrl] = useState<string>();
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const workload = workloads[endpoint];
  const modelIds = endpoint === "realtime" ? [realtimeModel.id] : Object.keys(specializedModels[endpoint]);

  const model = modelIds.includes(selectedModel) ? selectedModel : modelIds[0];
  const route = endpoint === "realtime" ? { ...realtimeModel, unit: "request" }
    : specializedRoute(endpoint, model);
  const requestPrice = route?.unit === "request" ? route.rate * (1 + markupPercent / 100) : null;
  const provider = route?.provider === "near-ai" ? "NEAR AI" : "Tinfoil";

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
    if (!signedIn || pending.current) return;
    const fields = new FormData(event.currentTarget);
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setPartial("");
    setResult(undefined);
    try {
      const signal = controller.signal;
      if (endpoint === "realtime") {
        setResult(await realtime(fields.get("file") as File, signal, setPartial));
        return;
      }
      const field = "field" in workload ? workload.field : undefined;
      const value = field ? String(fields.get(field) ?? "") : "";
      const multipart = isSpecializedMultipart(endpoint);
      const body = field === "JSON" ? JSON.parse(value) : field ? { [field]: value } : {};
      if (field === "JSON" && (!body || typeof body !== "object" || Array.isArray(body)))
        throw new Error("Enter a JSON object.");
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
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "The request failed.");
      const image = endpoint.startsWith("images/") ? data.data?.[0]?.b64_json : undefined;
      const outputText = endpoint === "responses"
        ? data.output?.filter((item: { type: string }) => item.type === "message")
            .flatMap((item: { content?: { type: string; text: string }[] }) => item.content ?? [])
            .filter((part: { type: string }) => part.type === "output_text")
            .map((part: { text: string }) => part.text).join("\n")
        : undefined;
      setResult({ image, requestId, text: image ? undefined :
        outputText || data.redacted_text || data.document?.md_content || data.text || JSON.stringify(data, null, 2) });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof SyntaxError ? "Enter valid JSON." :
          cause instanceof Error ? cause.message : "The request failed.");
    } finally {
      pending.current = null;
      setBusy(false);
      setPartial("");
    }
  }

  return (
    <>
      <button type="button" className="button quiet small" aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}>
        More endpoints
      </button>
      <dialog ref={dialog} className="panel playground-inference-dialog" aria-labelledby="playground-inference-title"
        onClose={() => pending.current?.abort()}>
        <header>
          <h2 id="playground-inference-title">Try an endpoint</h2>
          <button type="button" className="button quiet small" onClick={() => dialog.current?.close()}>Close</button>
        </header>
        <label>
          Endpoint
          <select value={endpoint} disabled={busy} onChange={(event) => {
            setEndpoint(event.currentTarget.value as Workload);
            setSelectedModel("");
            setResult(undefined);
            setError("");
          }}>
            {Object.entries(workloads).map(([id, entry]) => <option value={id} key={id}>{entry.label}</option>)}
          </select>
        </label>
        <form key={endpoint} onSubmit={run}>
          <label>
            Model
            <select name="model" value={model} onChange={(event) => setSelectedModel(event.currentTarget.value)} disabled={busy}>{modelIds.map((id) => <option key={id}>{id}</option>)}</select>
          </label>
          {"field" in workload && (
            <label>
              {workload.field === "JSON" ? "Request JSON" : "Input text"}
              <textarea name={workload.field} rows={4} required disabled={busy} defaultValue={workload.example} />
            </label>
          )}
          {"upload" in workload && (
            <label>
              File
              <input type="file" name={workload.upload} accept={workload.accept} required disabled={busy}
                aria-describedby={"hint" in workload ? "playground-inference-hint" : undefined} />
            </label>
          )}
          {"hint" in workload && <p id="playground-inference-hint">{workload.hint}</p>}
          <p>{provider} · {requestPrice === null ? "See model rates for usage charges" :
            new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 })
              .format(requestPrice) + " per completed request"}</p>
          {!signedIn && <p>Sign in with your Solana wallet to run inference.</p>}
          <button className="button accent" type="submit" disabled={!signedIn || busy}>Run endpoint</button>
        </form>
        <p role="status">{busy ? "Running request…" : result ? "Request completed." : ""}</p>
        {error && <p role="alert">{error}</p>}
        {partial && <pre aria-label="Partial transcript">{partial}</pre>}
        {result && (
          <section aria-label="Endpoint result">
            {result.text && <><pre>{result.text}</pre><CopyButton value={result.text} label="Copy result" /></>}
            {result.image && <img src={`data:image/png;base64,${result.image}`} alt="Image returned by the model" />}
            {result.audio && audioUrl && <audio controls src={audioUrl} aria-label="Synthesized speech" />}
            {result.requestId && <p>Usage reference <code>{result.requestId}</code></p>}
          </section>
        )}
      </dialog>
    </>
  );
}
