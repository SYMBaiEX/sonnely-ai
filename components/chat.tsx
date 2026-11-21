"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUp, BadgeCheck, History, Plus, Sparkles, Trash2, KeyRound } from "lucide-react";
import Link from "next/link";
import { models } from "@/lib/models";
import { request, type Session } from "./wallet";

type Message = { role: "user" | "assistant"; content: string };
type Thread = { id: string; model: string; messages: Message[] };
type Reply = { choices: { message: { content: string | null } }[] };

const samples = [
  {
    prompt: "What is a trusted execution environment?",
    reply:
      "A trusted execution environment (TEE) is an isolated part of a computer designed to protect data while it’s being processed. An attestation report can help a client check what software and hardware are running inside it. In Fathom Relay’s setup, the model provider’s enclave and the Fathom web gateway are separate trust boundaries.",
  },
  {
    prompt: "Show a simple API key budget example.",
    reply:
      "If a key has a $5 daily limit and a $30 lifetime limit, requests stop when either budget would be exceeded. The gateway reserves an estimate before running each request, then releases the remainder after the provider reports usage.",
  },
  {
    prompt: "How does a wallet sign-in work?",
    reply:
      "Your wallet signs a message tied to this site and a one-time challenge. The server checks the signature against your public Solana address and opens a session. Signing in does not send a transaction or move your funds.",
  },
];

export function Chat({
  initialModel,
  session,
  refresh,
  localHistory,
  plain,
}: {
  initialModel: string;
  session: Session | null;
  refresh: () => Promise<void>;
  localHistory: boolean;
  plain: boolean;
}) {
  const [text, setText] = useState("");
  const [model, setModel] = useState(initialModel);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [sample, setSample] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const storageKey = "fathom.chats." + (session?.profile?.wallet ?? "guest");
  const current = threads.find((thread) => thread.id === active);
  const activeSample = sample === null ? null : samples[sample];
  const ready = Boolean(session?.profile && session?.inferenceEnabled);
  const messages = activeSample
    ? [
        { role: "user", content: activeSample.prompt },
        { role: "assistant", content: activeSample.reply },
      ]
    : (current?.messages ?? []);

  useEffect(() => {
    try {
      const saved = localHistory ? (JSON.parse(localStorage.getItem(storageKey) || "[]") as Thread[]) : [];
      setThreads(Array.isArray(saved) ? saved : []);
      setActive(null);
    } catch {
      setThreads([]);
    }
  }, [localHistory, storageKey]);

  function save(next: Thread[]) {
    setThreads(next);
    if (localHistory) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next.slice(0, 50)));
      } catch {
        setError("Browser storage is full. This conversation remains in this tab.");
      }
    }
  }

  function start() {
    setActive(null);
    setSample(null);
    setText("");
    setError("");
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || !ready || busy) return;
    const prompt = text.trim();
    const thread = activeSample ? undefined : current;
    const id = thread?.id ?? crypto.randomUUID();
    const history: Message[] = [...(thread?.messages ?? []), { role: "user", content: prompt }];
    const previous = threads;
    const rest = threads.filter((item) => item.id !== id);
    const requestMessages = plain
      ? [{ role: "system", content: "Use concise, clear language." }, ...history.slice(-31)]
      : history.slice(-32);
    const input = { model, messages: requestMessages, max_tokens: 1024 };
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 36_000) {
      setError("This conversation is too long for the gateway. Start a new chat or shorten your message.");
      return;
    }
    setBusy(true);
    setError("");
    setSample(null);
    setActive(id);
    setText("");
    setThreads([{ id, model, messages: history }, ...rest]);
    try {
      const result = await request<Reply>("chat", input);
      const content = result.choices[0]?.message.content || "The provider returned no text.";
      save([{ id, model, messages: [...history, { role: "assistant", content }] }, ...rest]);
      await refresh();
    } catch (error) {
      setThreads(previous);
      setActive(thread?.id ?? null);
      setText(prompt);
      setError(error instanceof Error ? error.message : "Could not complete request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"chat-layout" + (showHistory ? " show-sessions" : "")}>
      <aside className="sessions" aria-label="Conversation history">
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
                    setActive(thread.id);
                    setSample(null);
                    setModel(thread.model);
                    setShowHistory(false);
                    setError("");
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
                    save(threads.filter((item) => item.id !== thread.id));
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
            {localHistory ? "History stays on this device." : "History is off."}
          </p>
        )}
        <Link className="text-link" href="/console/keys">
          <KeyRound size={15} /> Set up API access
        </Link>
      </aside>
      <section className="chat-main">
        <div className="chat-tools">
          <button
            className="button quiet small mobile-history"
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            aria-expanded={showHistory}
          >
            <History size={16} /> History
          </button>
          <button className="button quiet small" type="button" onClick={start} disabled={busy}>
            <Plus size={16} /> New chat
          </button>
          {activeSample && <span className="pill">Sample transcript</span>}
        </div>
        {!messages.length && (
          <div className="chat-welcome">
            <span className="welcome-mark">
              <Sparkles size={27} />
            </span>
            <h1>Inference workspace</h1>
            <p>Explore a sample or run a request with your account.</p>
            <div className="prompts">
              {samples.map((item, index) => (
                <button
                  type="button"
                  className="button prompt"
                  key={item.prompt}
                  onClick={() => {
                    setSample(index);
                    setActive(null);
                    setError("");
                  }}
                >
                  {item.prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {!!messages.length && (
          <div className="messages" aria-label="Messages">
            {messages.map((message, index) => (
              <article className={"message " + message.role} key={index}>
                <div className="mono">
                  {message.role === "user"
                    ? "You"
                    : activeSample
                      ? "Fathom sample"
                      : models.find((item) => item.id === model)?.name}
                </div>
                <p>{message.content}</p>
              </article>
            ))}
            {busy && (
              <p role="status" className="caption">
                Waiting for model response…
              </p>
            )}
          </div>
        )}
        <form className="composer glass" onSubmit={send}>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={12000}
            aria-label="Message"
            placeholder="Write a message…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && ready && text.trim()) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="between">
            <label className="model-select">
              <select
                aria-label="Inference model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={busy}
              >
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button accent icon-send"
              type="submit"
              aria-label="Send message"
              disabled={!ready || !text.trim() || busy}
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p className="chat-note">
          <BadgeCheck size={15} />
          {!session?.profile
            ? "Connect a wallet to run live inference."
            : !session.inferenceEnabled
              ? "Live inference is awaiting provider activation."
              : localHistory
                ? "History stays in this browser."
                : "Conversation history is off."}
        </p>
      </section>
    </div>
  );
}
