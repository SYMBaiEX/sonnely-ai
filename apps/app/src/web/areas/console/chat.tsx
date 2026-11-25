/* eslint-disable better-tailwindcss/no-unknown-classes, no-restricted-syntax, max-lines-per-function, react-hooks/refs, @eslint-react/no-use-context, @eslint-react/naming-convention-ref-name, @eslint-react/no-array-index-key -- playground migration preserves the original form markup, class names and screen structure */
import { createPortal } from "react-dom";
import { useContext, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  Download,
  FileText,
  Fingerprint,
  History,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  Wallet,
} from "lucide-react";
import { Streamdown } from "streamdown";
import type { Chat, Thread } from "../../../../gen/app__console__chat.ts";
import { useRemote } from "../../remote.ts";
import { useWorkspaceSession } from "./frame.tsx";
import { readReceiptEnvelope, type ReceiptEnvelope } from "../site/receipt.ts";
import { Playground, PlaygroundControls } from "./playground.tsx";
import { PlaygroundCopyButton } from "./playground-copy.tsx";
import { models, providerIds, providerNames, providerRoute, type ProviderId } from "./playground-data.ts";
import { PlaygroundRoute } from "./playground-route.tsx";
import { readPlaygroundReply } from "./playground-stream.ts";
import "./playground.css";

const nameOf = (model: string) => models.find((entry) => entry.id === model)?.name ?? model;

function transcript(thread: Thread, format: "md" | "txt") {
  const head = ["Sonnely chat", "Model: " + nameOf(thread.model), "Exported: " + new Date().toLocaleString(), ""];
  const body = thread.messages.flatMap((message) => [
    (format === "md" ? "## " : "") + (message.role === "User" ? "You" : nameOf(message.model)) + (format === "txt" ? ":" : ""),
    "",
    message.content,
    "",
  ]);
  return [...head, ...body].join("\n");
}

const samples = [
  {
    icon: Fingerprint,
    title: "Private inference",
    prompt: "What is a trusted execution environment?",
    reply:
      "A trusted execution environment (TEE) is an isolated part of a computer designed to protect data while it’s being processed. An attestation report can help a client check what software and hardware are running inside it. In Sonnely’s setup, the confidential enclave that runs the model and the Sonnely gateway are separate trust boundaries.",
  },
  {
    icon: KeyRound,
    title: "Key budgets",
    prompt: "Show a simple API key budget example.",
    reply:
      "If a key has a $5 daily limit and a $30 lifetime limit, requests stop when either budget would be exceeded. The gateway reserves an estimate before running each request, then releases the remainder after usage settles.",
  },
  {
    icon: Wallet,
    title: "Wallet sign-in",
    prompt: "How does a wallet sign-in work?",
    reply:
      "Your wallet signs a message tied to this site and a one-time challenge. The server checks the signature against your public Solana address and opens a session. Signing in does not send a transaction or move your funds.",
  },
];

async function streamReply({
  id,
  model,
  signal,
  includeReceipt,
  onText,
}: {
  id: string;
  model: string;
  signal: AbortSignal;
  includeReceipt: boolean;
  onText: (text: string) => void;
}) {
  const response = await fetch("/api/console/chat/stream", {
    method: "POST",
    headers: { "content-type": "application/json", ...(includeReceipt ? { "X-Sonnely-Receipt": "v1" } : {}) },
    body: JSON.stringify({ id, model }),
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "The request did not return a stream.");
  }
  let envelope: ReceiptEnvelope | undefined;
  let content = "";
  const captureReceipt = includeReceipt
    ? (receipt: unknown) => {
        envelope = readReceiptEnvelope({
          sonnely_receipt: receipt,
          sonnely_request_id: response.headers.get("X-Sonnely-Request-Id"),
        });
      }
    : undefined;
  for await (const text of readPlaygroundReply(response.body, captureReceipt)) {
    content = text;
    onText(text);
  }
  return { content, envelope };
}

type Selection = { provider: ProviderId; fallbacks: ProviderId[]; receipt: boolean };

function readSelection(): Selection {
  try {
    const parsed = JSON.parse(localStorage.getItem("sonnely.playground.selection") ?? "") as Partial<Selection>;
    return {
      provider: providerIds.includes(parsed.provider as ProviderId) ? (parsed.provider as ProviderId) : "near-ai",
      fallbacks: Array.isArray(parsed.fallbacks) ? parsed.fallbacks.filter((id): id is ProviderId => providerIds.includes(id)) : [],
      receipt: parsed.receipt === true,
    };
  } catch {
    return { provider: "near-ai", fallbacks: [], receipt: false };
  }
}

function ChatPlayground() {
  const session = useWorkspaceSession();
  const chat = useRemote<Chat>("console__chat");
  const controls = useContext(PlaygroundControls);
  const signedIn = session.state?.tag === "SignedIn";
  const state = chat.state;
  const initialSelection = useRef<Selection | null>(null);
  initialSelection.current ??= readSelection();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sample, setSample] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [provider, setProvider] = useState<ProviderId>(initialSelection.current.provider);
  const [fallbacks, setFallbacks] = useState<ProviderId[]>(initialSelection.current.fallbacks);
  const [includeReceipt, setIncludeReceipt] = useState(initialSelection.current.receipt);
  const [announcement, setAnnouncement] = useState("");
  const [live, setLive] = useState<{ id: string; model: string; text: string } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{ thread: string; envelope: ReceiptEnvelope } | null>(null);
  const [stoppedThread, setStoppedThread] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeSample = sample === null ? null : samples[sample];
  const current = state?.threads.find((thread) => thread.id === state.active);
  const storedMessages = current?.messages ?? [];
  const liveMessages =
    !activeSample && live && live.id === current?.id && storedMessages.at(-1)?.role === "User"
      ? [{ role: "Assistant" as const, content: live.text, model: live.model }]
      : [];
  const messages = activeSample
    ? [
        { role: "User" as const, content: activeSample.prompt, model: "" },
        { role: "Assistant" as const, content: activeSample.reply, model: "" },
      ]
      : [...storedMessages, ...liveMessages];
  const ready = signedIn && state !== undefined;
  const model = state?.model ?? models[0].id;
  const entry = models.find((item) => item.id === model) ?? models[0];
  const routeReady = Boolean(providerRoute(entry, provider));
  const threads = state?.threads ?? [];

  function rememberSelection(nextProvider = provider, nextFallbacks = fallbacks, receipt = includeReceipt) {
    localStorage.setItem("sonnely.playground.selection", JSON.stringify({ provider: nextProvider, fallbacks: nextFallbacks, receipt }));
  }

  function start() {
    void chat.send({ type: "newChat" });
    setShowHistory(false);
    setSample(null);
    setText("");
    setError("");
    setEditIndex(null);
  }

  function conversationTooLong(prompt: string) {
    const history = [...(current?.messages ?? []), { role: "User" as const, content: prompt, model }]
      .map((message) => ({ role: message.role.toLowerCase(), content: message.content }));
    const input = {
      model,
      messages: [{ role: "system", content: "Use concise, clear language." }, ...history.slice(-31)],
      max_tokens: 1024,
      stream: true,
      provider: { only: [provider, ...fallbacks], ...(fallbacks.length ? { allow_fallbacks: true } : {}) },
    };
    return new TextEncoder().encode(JSON.stringify(input)).byteLength > 36_000;
  }

  async function finishStream(id: string, runModel: string, controller: AbortController) {
    let streamed = "";
    try {
      const result = await streamReply({
        id,
        model: runModel,
        signal: controller.signal,
        includeReceipt,
        onText: (next) => {
          streamed = next;
          setLive({ id, model: runModel, text: next });
        },
      });
      streamed = result.content;
      await chat.send({ type: "reply", id, model: runModel, text: result.content || "The model returned no text." });
      if (result.envelope) setLastReceipt({ thread: id, envelope: result.envelope });
      return { streamed, stopped: false };
    } catch (failure) {
      if (controller.signal.aborted) {
        if (streamed) await chat.send({ type: "reply", id, model: runModel, text: streamed });
        return { streamed, stopped: true };
      }
      throw failure;
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = text.trim();
    if (!prompt || !ready || busy || !state || !routeReady) return;
    if (conversationTooLong(prompt)) {
      setError("This conversation is too long for the gateway. Start a new chat or shorten your message.");
      return;
    }
    const id = current?.id ?? crypto.randomUUID();
    const editing = editIndex;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setAnnouncement("Waiting for model response.");
    setError("");
    setSample(null);
    try {
      const sent =
        editing !== null && current
          ? await chat.send({ type: "edit", id, index: editing, text: prompt })
          : await chat.send({ type: "send", id, model, text: prompt });
      if (!sent) {
        setError("The rules refused that message. Finish the current answer first.");
        return;
      }
      setText("");
      setEditIndex(null);
      composerRef.current?.focus();
      setLastReceipt(null);
      const finished = await finishStream(id, model, controller);
      setStoppedThread(finished.stopped ? id : "");
      setAnnouncement(finished.stopped ? "Response stopped." : "Model response ready in Messages.");
    } catch (failure) {
      if (controller.signal.aborted) setAnnouncement("Response stopped.");
      else {
        setAnnouncement("");
        setText(prompt);
        setEditIndex(editing);
        setError(failure instanceof Error ? failure.message : "Could not complete request.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function retry() {
    if (busy || !ready || !current || activeSample || !state) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setAnnouncement("Waiting for model response.");
    try {
      const index = current.messages.map((message) => message.role).lastIndexOf("User");
      const prompt = index >= 0 ? current.messages[index]?.content : "";
      if (index < 0 || !prompt) throw new Error("There is no user message to retry.");
      const sent = await chat.send({ type: "edit", id: current.id, index, text: prompt });
      if (!sent) throw new Error("The rules refused that retry.");
      setLastReceipt(null);
      const finished = await finishStream(current.id, state.model, controller);
      setStoppedThread(finished.stopped ? current.id : "");
      setAnnouncement(finished.stopped ? "Response stopped." : "Model response ready in Messages.");
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not complete request.");
      setAnnouncement(controller.signal.aborted ? "Response stopped." : "");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function edit(index: number) {
    const message = current?.messages[index];
    if (busy || !message || message.role !== "User") return;
    setEditIndex(index);
    setText(message.content);
    setError("");
    composerRef.current?.focus();
  }

  function downloadTranscript() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([transcript(current, "md")], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sonnely-chat-" + current.id.slice(0, 8) + ".md";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadReceipt(envelope: ReceiptEnvelope) {
    const data = {
      sonnely_receipt: envelope.receipt,
      ...(envelope.requestId ? { sonnely_request_id: envelope.requestId } : {}),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sonnely-receipt.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={"chat-layout" + (showHistory ? " show-sessions" : "")}>
      <aside
        id="playground-history"
        className="sessions"
        aria-label="Conversation history"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setShowHistory(false);
            historyButton.current?.focus();
          }
        }}
      >
        <div className="between">
          <strong>Conversations</strong>
          <button type="button" className="icon-button" aria-label="New chat" onClick={start} disabled={busy}>
            <Plus size={18} />
          </button>
        </div>
        <input
          type="search"
          aria-label="Search conversations"
          placeholder="Search conversations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {threads.length ? (
          threads
            .filter((thread) => thread.messages[0]?.content.toLowerCase().includes(search.toLowerCase()))
            .map((thread) => {
              const title = thread.messages[0]?.content || "Untitled chat";
              return (
                <div className="thread-item" key={thread.id}>
                  <button
                    type="button"
                    className={thread.id === state?.active ? "selected" : ""}
                    disabled={busy}
                    aria-label={title}
                    aria-current={thread.id === state?.active ? "true" : undefined}
                    onClick={() => {
                      void chat.send({ type: "open", id: thread.id });
                      setSample(null);
                      setShowHistory(false);
                      composerRef.current?.focus();
                      setError("");
                      setEditIndex(null);
                    }}
                  >
                    <span>{title}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={"Delete " + title}
                    disabled={busy}
                    onClick={() => void chat.send({ type: "remove", id: thread.id })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
        ) : (
          <p className="caption">Your conversations appear here. History stays in this workspace.</p>
        )}
        {!activeSample && !!current?.messages.length && (
          <div className="playground-history-actions">
            <button className="button quiet small" type="button" onClick={downloadTranscript} disabled={busy}>
              <Download size={16} aria-hidden="true" /> Export
            </button>
            <PlaygroundCopyButton value={transcript(current, "txt")} label="Copy transcript" />
          </div>
        )}
        <a className="text-link" href="/console/keys">
          <KeyRound size={15} /> Set up API access
        </a>
      </aside>
      <section className="chat-main">
        {controls.chat &&
          controls.mount &&
          createPortal(
            <div className="playground-chat-controls">
              <PlaygroundRoute
                model={model}
                provider={provider}
                fallbacks={fallbacks}
                availableProviders={[...providerIds]}
                disabled={busy}
                onChange={(nextModel, nextProvider, nextFallbacks) => {
                  void chat.send({ type: "pickModel", model: nextModel });
                  setProvider(nextProvider);
                  setFallbacks(nextFallbacks);
                  rememberSelection(nextProvider, nextFallbacks);
                  setError("");
                }}
              />
              <div className="chat-tools">
                <button
                  className="button quiet small"
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  ref={historyButton}
                  aria-label="History"
                  aria-expanded={showHistory}
                  aria-controls="playground-history"
                >
                  <History size={16} aria-hidden="true" /> <span>History</span>
                </button>
                <button className="button quiet small" type="button" aria-label="New chat" onClick={start} disabled={busy}>
                  <Plus size={16} aria-hidden="true" /> <span>New chat</span>
                </button>
              </div>
            </div>,
            controls.mount,
          )}
        {!messages.length && (
          <div className="playground-editor-title">
            <h2>What are you working on?</h2>
          </div>
        )}
        {!!messages.length && (
          <section className="messages" aria-label="Messages">
            {activeSample && <p className="playground-sample-note">Sample transcript</p>}
            {messages.map((message, index) => (
              <article className={"message " + message.role.toLowerCase()} key={index}>
                <div className="mono">
                  {message.role === "User" ? "You" : activeSample ? "Sonnely sample" : nameOf(message.model || current?.model || model)}
                </div>
                {message.role === "Assistant" ? (
                  <div className="playground-markdown">
                    <Streamdown mode="static" disallowedElements={["img", "video", "audio", "source", "iframe"]} controls={false}>
                      {message.content}
                    </Streamdown>
                  </div>
                ) : (
                  <p>{message.content}</p>
                )}
                {activeSample && message.role === "Assistant" && <PlaygroundCopyButton value={message.content} label="Copy response" />}
                {!activeSample && (
                  <div className="message-footer">
                    <span className="message-stamp">
                      {stoppedThread === current?.id && index === messages.length - 1 ? "Stopped · " : ""}
                      {providerNames[provider]}
                    </span>
                    <span className="message-actions">
                      {message.role === "Assistant" && !(busy && index === messages.length - 1) && (
                        <PlaygroundCopyButton value={message.content} label="Copy response" />
                      )}
                      {message.role === "Assistant" && lastReceipt && lastReceipt.thread === current?.id && index === messages.length - 1 && (
                        <>
                          <button className="button quiet small" type="button" onClick={() => downloadReceipt(lastReceipt.envelope)}>
                            <Download size={14} aria-hidden="true" /> Download receipt
                          </button>
                          <a className="button quiet small" href="/verify">
                            Inspect receipt <ArrowUpRight size={13} aria-hidden="true" />
                          </a>
                        </>
                      )}
                      {message.role === "User" && (
                        <button type="button" className="button quiet small" disabled={busy} onClick={() => edit(index)}>
                          <Pencil size={13} aria-hidden="true" /> Edit
                        </button>
                      )}
                      {index === messages.length - 1 && ready && (
                        <button type="button" className="button quiet small" disabled={busy} onClick={() => void retry()}>
                          <RotateCcw size={13} aria-hidden="true" /> Retry
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </article>
            ))}
            {busy && (
              <p className="playground-stream-state" aria-hidden="true">
                <span /> {messages.at(-1)?.role === "Assistant" ? "Streaming response…" : "Waiting for model…"}
              </p>
            )}
          </section>
        )}
        <div role="status" className="visually-hidden">
          {announcement}
        </div>
        <div className="playground-entry">
          {editIndex !== null && (
            <p className="playground-editing" role="status">
              <span>Editing an earlier message. Sending replaces it and anything after it.</span>
              <button type="button" className="playground-history-save" onClick={() => setEditIndex(null)}>
                Cancel
              </button>
            </p>
          )}
          <form id="playground-message-form" className="composer" onSubmit={(event) => void sendMessage(event)}>
            <textarea
              ref={composerRef}
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={12000}
              aria-label="Message"
              enterKeyHint="send"
              placeholder="Ask a question or describe a task…"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  ready &&
                  text.trim() &&
                  !busy &&
                  routeReady
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </form>
          <div className="composer-controls">
            {busy ? (
              <button
                className="button quiet playground-send"
                type="button"
                onClick={() => {
                  composerRef.current?.focus();
                  abortRef.current?.abort();
                }}
                aria-label="Stop response"
              >
                <span>Stop</span>
                <Square size={13} aria-hidden="true" />
              </button>
            ) : (
              <button
                className="button accent playground-send"
                type="submit"
                form="playground-message-form"
                aria-label="Send message"
                disabled={!ready || !text.trim() || !routeReady}
              >
                <span>Send</span>
                <ArrowUp size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p className="chat-note">
          <BadgeCheck size={15} />
          {!signedIn ? "Connect a wallet to run live inference." : "History stays in this workspace."}
        </p>
        {ready && (
          <label className="playground-receipt-opt-in">
            <input
              type="checkbox"
              checked={includeReceipt}
              disabled={busy}
              onChange={(event) => {
                setIncludeReceipt(event.target.checked);
                rememberSelection(provider, fallbacks, event.target.checked);
              }}
            />
            Include verification receipt
          </label>
        )}
        {!messages.length && ready && (
          <div className="playground-workload-shortcuts" aria-label="Other inference tasks" role="group">
            <button type="button" className="button quiet" onClick={() => controls.select("audio/transcriptions")}>
              <AudioLines size={17} aria-hidden="true" /> Transcribe audio
            </button>
            <button type="button" className="button quiet" onClick={() => controls.select("convert/file")}>
              <FileText size={17} aria-hidden="true" /> Convert a PDF
            </button>
            <button type="button" className="button quiet" onClick={() => controls.select("redact")}>
              <ShieldCheck size={17} aria-hidden="true" /> Redact text
            </button>
          </div>
        )}
        {!messages.length && !ready && (
          <section className="playground-starters" aria-labelledby="playground-starters-title">
            <h2 id="playground-starters-title">Try a sample</h2>
            <div className="prompts">
              {samples.map(({ prompt, title, icon: Icon }, index) => (
                <button
                  type="button"
                  className="button prompt"
                  key={prompt}
                  aria-description={prompt}
                  onClick={() => {
                    setSample(index);
                    setError("");
                    setEditIndex(null);
                  }}
                >
                  <Icon size={17} className="prompt-icon" aria-hidden="true" />
                  <strong>{title}</strong>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}

export function ChatSection() {
  const session = useWorkspaceSession();
  return (
    <div className="console-playground">
      <Playground signedIn={session.state?.tag === "SignedIn"}>
        <ChatPlayground />
      </Playground>
    </div>
  );
}
