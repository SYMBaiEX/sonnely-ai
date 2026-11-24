"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  MessageSquare,
  ArrowUpRight,
  BadgeCheck,
  Download,
  Fingerprint,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  KeyRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { models } from "@/lib/models";
import { providerRoute, type ProviderId } from "@/lib/provider-catalog";
import { readSse } from "@/lib/sse";
import { CopyButton } from "./shared";
import { PlaygroundRoute } from "./playground-route";
import { type Session } from "./wallet";

type Message = {
  role: "user" | "assistant";
  content: string;
  model?: string;
  at?: number;
  stopped?: boolean;
};
type Thread = { id: string; model: string; provider?: ProviderId; messages: Message[] };

function transcript(thread: Thread, format: "md" | "txt") {
  const title = thread.messages[0]?.content || "Sonnely conversation";
  const name = (id: string | undefined) =>
    models.find((item) => item.id === (id ?? thread.model))?.name ?? "Model";
  const head = [
    (format === "md" ? "# " : "") + title,
    "",
    "Model: " + name(thread.model) + " (" + thread.model + ")",
    "Exported: " + new Date().toLocaleString(),
    "",
  ];
  const body = thread.messages.flatMap((message) => [
    (format === "md" ? "## " : "") +
      (message.role === "user" ? "You" : name(message.model)) +
      (format === "txt" ? ":" : ""),
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

export function Chat({
  initialModel,
  initialProvider,
  availableProviders,
  session,
  refresh,
  localHistory,
  restoreConversation,
  enableHistory,
  plain,
}: {
  initialModel: string;
  initialProvider: ProviderId;
  availableProviders: ProviderId[];
  session: Session | null;
  refresh: () => Promise<void>;
  localHistory: boolean;
  restoreConversation: boolean;
  enableHistory: () => void;
  plain: boolean;
}) {
  const [text, setText] = useState("");
  const [model, setModel] = useState(initialModel);
  const [provider, setProvider] = useState(initialProvider);
  const modelEntry = models.find((item) => item.id === model);
  const routes = availableProviders.filter((id) => modelEntry && providerRoute(modelEntry, id));
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [sample, setSample] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const owner = session?.profile?.wallet ?? "guest";
  const storageKey = "sonnely.chats." + owner;
  const selectionKey = storageKey + ".active";
  const restored = useRef(false);
  const legacyStorageKey = "fathom.chats." + owner;
  const current = threads.find((thread) => thread.id === active);
  const activeSample = sample === null ? null : samples[sample];
  const ready = Boolean(session?.profile && session?.inferenceEnabled && !session.termsRequired);
  const messages: Message[] = activeSample
    ? [
        { role: "user", content: activeSample.prompt },
        { role: "assistant", content: activeSample.reply },
      ]
    : (current?.messages ?? []);

  useEffect(() => {
    if (!localHistory || restored.current) return;
    restored.current = true;
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey) ?? "[]",
      );
      if (!Array.isArray(saved)) return;
      const history = saved as Thread[];
      setThreads(history);
      if (!restoreConversation) return;
      const previous = localStorage.getItem(selectionKey);
      const thread = previous === null ? history[0] : history.find((thread) => thread.id === previous);
      if (thread) {
        setActive(thread.id);
        setModel(thread.model);
        setProvider(thread.provider ?? "near-ai");
      }
    } catch {
      /* Playground remains usable when browser storage is unavailable. */
    }
  }, [localHistory, restoreConversation, storageKey, legacyStorageKey, selectionKey]);

  function rememberSelection(id: string | null) {
    try {
      localStorage.setItem(selectionKey, id ?? "");
    } catch {
      /* Chat history can still load when the last selection could not be saved. */
    }
  }

  function storeHistory(next: Thread[], id: string | null) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next.slice(0, 50)));
      rememberSelection(id);
      return true;
    } catch {
      setError("Could not save chat history. These chats are still available in this tab.");
      return false;
    }
  }

  function save(next: Thread[], id: string | null) {
    setThreads(next);
    if (localHistory) storeHistory(next, id);
  }

  function start() {
    if (localHistory) rememberSelection(null);
    setActive(null);
    setShowHistory(false);
    setSample(null);
    setText("");
    setError("");
    setEditIndex(null);
  }

  async function run(
    id: string,
    history: Message[],
    runModel: string,
    runProvider: ProviderId,
    restore?: () => void,
  ) {
    const previous = threads;
    const previousActive = active;
    const rest = threads.filter((item) => item.id !== id);
    const payload = history.map(({ role, content }) => ({ role, content }));
    const requestMessages = plain
      ? [{ role: "system", content: "Use concise, clear language." }, ...payload.slice(-31)]
      : payload.slice(-32);
    const entry = models.find((item) => item.id === runModel);
    if (!entry || !availableProviders.some((route) => providerRoute(entry, route) && route === runProvider)) {
      setError("That model is temporarily unavailable. Try another model.");
      return;
    }
    const input = {
      model: runModel,
      messages: requestMessages,
      max_tokens: 1024,
      stream: true,
      ...(runProvider !== "near-ai" ? { provider: { only: [runProvider] } } : {}),
    };
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 36_000) {
      setError("This conversation is too long for the gateway. Start a new chat or shorten your message.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const replyAt = Date.now();
    let content = "";
    const reply = (text: string, stopped = false): Thread[] => [
      {
        id,
        model: runModel,
        provider: runProvider,
        messages: [
          ...history,
          {
            role: "assistant",
            content: text,
            model: runModel,
            at: replyAt,
            ...(stopped ? { stopped: true } : {}),
          },
        ],
      },
      ...rest,
    ];
    setBusy(true);
    setError("");
    setSample(null);
    setActive(id);
    setText("");
    setEditIndex(null);
    setThreads([{ id, model: runModel, provider: runProvider, messages: history }, ...rest]);
    try {
      const response = await fetch("/api/sonnely/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(input),
      });
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get("content-type")?.startsWith("text/event-stream")
      ) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "The request did not return a stream.");
      }
      let complete = false;
      for await (const event of readSse(response.body)) {
        if (event === "[DONE]") {
          complete = true;
          break;
        }
        const chunk = JSON.parse(event);
        if (chunk.error) throw new Error(chunk.error.message);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          content += delta;
          setThreads(reply(content));
        }
      }
      if (!complete)
        throw new Error("The stream ended before billing was finalized. Check Usage before retrying.");
      save(reply(content || "The model returned no text."), id);
      await refresh();
    } catch (error) {
      if (controller.signal.aborted) {
        save(
          content
            ? reply(content, true)
            : [{ id, model: runModel, provider: runProvider, messages: history }, ...rest],
          id,
        );
        await refresh();
      } else {
        setThreads(previous);
        setActive(previousActive);
        restore?.();
        setError(error instanceof Error ? error.message : "Could not complete request.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || !ready || busy) return;
    const prompt = text.trim();
    const thread = activeSample ? undefined : current;
    const id = thread?.id ?? crypto.randomUUID();
    const editing = editIndex;
    const base = editing === null ? (thread?.messages ?? []) : (thread?.messages ?? []).slice(0, editing);
    const history: Message[] = [...base, { role: "user", content: prompt, at: Date.now() }];
    await run(id, history, model, provider, () => {
      setText(prompt);
      setEditIndex(editing);
    });
  }

  function retry() {
    if (busy || !ready || !current || activeSample) return;
    const index = current.messages.map((message) => message.role).lastIndexOf("user");
    if (index < 0) return;
    void run(current.id, current.messages.slice(0, index + 1), current.model, current.provider ?? "near-ai");
  }

  function edit(index: number) {
    const message = current?.messages[index];
    if (busy || !message || message.role !== "user") return;
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

  return (
    <div className={"chat-layout" + (showHistory ? " show-sessions" : "")}>
      <aside id="playground-history" className="sessions" aria-label="Conversation history">
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
          onChange={(e) => setSearch(e.target.value)}
        />
        {threads.length ? (
          threads
            .filter((thread) => thread.messages[0]?.content.toLowerCase().includes(search.toLowerCase()))
            .map((thread) => (
              <div className="thread-item" key={thread.id}>
                <button
                  type="button"
                  className={thread.id === active ? "selected" : ""}
                  disabled={busy}
                  onClick={() => {
                    if (localHistory) rememberSelection(thread.id);
                    setActive(thread.id);
                    setSample(null);
                    setModel(thread.model);
                    setProvider(thread.provider ?? "near-ai");
                    setShowHistory(false);
                    setError("");
                    setEditIndex(null);
                  }}
                >
                  {thread.messages[0]?.content || "Untitled chat"}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={"Delete " + (thread.messages[0]?.content || "chat")}
                  disabled={busy}
                  onClick={() => {
                    save(
                      threads.filter((item) => item.id !== thread.id),
                      active === thread.id ? null : active,
                    );
                    if (active === thread.id) start();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
        ) : (
          <p className="caption">
            Your conversations appear here.{" "}
            {localHistory ? "History stays on this device." : "History saving is off."}
          </p>
        )}
        <Link className="text-link" href="/console/keys">
          <KeyRound size={15} /> Set up API access
        </Link>
      </aside>
      <section className="chat-main">
        <header className="playground-header">
          <div className="playground-title">
            <MessageSquare size={18} aria-hidden="true" />
            <h1>Playground</h1>
          </div>
          <div className="chat-tools">
            {!activeSample && !!current?.messages.length && (
              <>
                <button
                  className="button quiet small"
                  type="button"
                  onClick={downloadTranscript}
                  disabled={busy}
                >
                  <Download size={16} aria-hidden="true" /> Export
                </button>
                <CopyButton value={transcript(current, "txt")} label="Copy transcript" />
              </>
            )}
            <button
              className="button quiet small mobile-history"
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              aria-expanded={showHistory}
              aria-controls="playground-history"
            >
              <History size={16} aria-hidden="true" /> History
            </button>
            <button className="button quiet small" type="button" onClick={start} disabled={busy}>
              <Plus size={16} aria-hidden="true" /> New chat
            </button>
          </div>
        </header>
        {!messages.length && (
          <div className="chat-welcome">
            <h2>Start a conversation</h2>
            <p>Choose a model and send a prompt.</p>
          </div>
        )}
        {!!messages.length && (
          <div className="messages" aria-label="Messages">
            {activeSample && <p className="playground-sample-note">Sample transcript</p>}
            {messages.map((message, index) => (
              <article
                className={"message " + message.role}
                key={index}
                title={message.at ? new Date(message.at).toLocaleString() : undefined}
              >
                <div className="mono">
                  {message.role === "user"
                    ? "You"
                    : activeSample
                      ? "Sonnely sample"
                      : (models.find((item) => item.id === (message.model ?? current?.model))?.name ??
                        "Model")}
                </div>
                <p>{message.content}</p>
                {message.role === "assistant" && <CopyButton value={message.content} label="Copy response" />}
                {!activeSample && (
                  <div className="message-footer">
                    <span className="message-stamp">
                      {message.at
                        ? new Date(message.at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : ""}
                      {message.stopped ? (message.at ? " · " : "") + "Stopped" : ""}
                    </span>
                    <span className="message-actions">
                      {message.role === "user" && (
                        <button
                          type="button"
                          className="button quiet small"
                          disabled={busy}
                          onClick={() => edit(index)}
                        >
                          <Pencil size={13} aria-hidden="true" /> Edit
                        </button>
                      )}
                      {index === messages.length - 1 && ready && (
                        <button type="button" className="button quiet small" disabled={busy} onClick={retry}>
                          <RotateCcw size={13} aria-hidden="true" /> Retry
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </article>
            ))}
            {busy && (
              <p role="status" className="caption">
                Waiting for model response…
              </p>
            )}
          </div>
        )}
        <div className="playground-entry">
          {editIndex !== null && (
            <p className="playground-editing" role="status">
              <span>Editing an earlier message. Sending replaces it and anything after it.</span>
              <button type="button" className="playground-history-save" onClick={() => setEditIndex(null)}>
                Cancel
              </button>
            </p>
          )}
          <form id="playground-message-form" className="composer" onSubmit={send}>
            <textarea
              ref={composerRef}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={12000}
              aria-label="Message"
              enterKeyHint="send"
              placeholder="Write a message…"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  ready &&
                  text.trim() &&
                  !busy &&
                  routes.includes(provider)
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </form>
          <div className="composer-controls">
            <PlaygroundRoute
              model={model}
              provider={provider}
              availableProviders={availableProviders}
              disabled={busy}
              onChange={(model, provider) => {
                setModel(model);
                setProvider(provider);
                setError("");
              }}
            />
            {busy ? (
              <button
                className="button quiet playground-send"
                type="button"
                onClick={() => abortRef.current?.abort()}
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
                disabled={!ready || !text.trim() || !routes.includes(provider)}
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
          {!session?.profile
            ? "Connect a wallet to run live inference."
            : session.termsRequired
              ? "Accept the current terms to run live inference."
              : !session.inferenceEnabled
                ? "Live inference is temporarily unavailable."
                : localHistory
                  ? "History stays in this browser."
                  : "Chat history is off."}
          {session?.profile && !session.termsRequired && session.inferenceEnabled && !localHistory && (
            <button
              className="playground-history-save"
              type="button"
              disabled={busy}
              onClick={() => {
                if (!storeHistory(threads, active)) return;
                restored.current = true;
                enableHistory();
                setError("");
              }}
            >
              Save chats on this device
            </button>
          )}
        </p>
        {!messages.length && (
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
                    setActive(null);
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
