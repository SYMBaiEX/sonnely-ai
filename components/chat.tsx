"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  BadgeCheck,
  Fingerprint,
  History,
  Plus,
  Sparkles,
  Trash2,
  KeyRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { models } from "@/lib/models";
import { providerNames, providerRoute, type ProviderId } from "@/lib/provider-catalog";
import { readSse } from "@/lib/sse";
import { CopyButton } from "./shared";
import { type Session } from "./wallet";

type Message = { role: "user" | "assistant"; content: string; model?: string };
type Thread = { id: string; model: string; provider?: ProviderId; messages: Message[] };

const samples = [
  {
    icon: Fingerprint,
    title: "Private inference",
    prompt: "What is a trusted execution environment?",
    reply:
      "A trusted execution environment (TEE) is an isolated part of a computer designed to protect data while it’s being processed. An attestation report can help a client check what software and hardware are running inside it. In Sonnely’s setup, the model provider’s enclave and the Sonnely gateway are separate trust boundaries.",
  },
  {
    icon: KeyRound,
    title: "Key budgets",
    prompt: "Show a simple API key budget example.",
    reply:
      "If a key has a $5 daily limit and a $30 lifetime limit, requests stop when either budget would be exceeded. The gateway reserves an estimate before running each request, then releases the remainder after the provider reports usage.",
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
  plain,
}: {
  initialModel: string;
  initialProvider: ProviderId;
  availableProviders: ProviderId[];
  session: Session | null;
  refresh: () => Promise<void>;
  localHistory: boolean;
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
  const owner = session?.profile?.wallet ?? "guest";
  const storageKey = "sonnely.chats." + owner;
  const legacyStorageKey = "fathom.chats." + owner;
  const current = threads.find((thread) => thread.id === active);
  const activeSample = sample === null ? null : samples[sample];
  const ready = Boolean(session?.profile && session?.inferenceEnabled);
  const messages: Message[] = activeSample
    ? [
        { role: "user", content: activeSample.prompt },
        { role: "assistant", content: activeSample.reply },
      ]
    : (current?.messages ?? []);

  useEffect(() => {
    try {
      const saved = localHistory
        ? (JSON.parse(
            localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey) ?? "[]",
          ) as Thread[])
        : [];
      setThreads(Array.isArray(saved) ? saved : []);
      setActive(null);
    } catch {
      setThreads([]);
    }
  }, [localHistory, storageKey, legacyStorageKey]);

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
    setShowHistory(false);
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
    const payload = history.map(({ role, content }) => ({ role, content }));
    const requestMessages = plain
      ? [{ role: "system", content: "Use concise, clear language." }, ...payload.slice(-31)]
      : payload.slice(-32);
    if (!routes.includes(provider)) {
      setError(providerNames[provider] + " is unavailable for this model. Choose an available provider.");
      return;
    }
    const selectedProvider = provider;
    const input = {
      model,
      messages: requestMessages,
      max_tokens: 1024,
      stream: true,
      ...(selectedProvider !== "near-ai" ? { provider: { only: [selectedProvider] } } : {}),
    };
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 36_000) {
      setError("This conversation is too long for the gateway. Start a new chat or shorten your message.");
      return;
    }
    setBusy(true);
    setError("");
    setSample(null);
    setActive(id);
    setText("");
    setThreads([{ id, model, provider: selectedProvider, messages: history }, ...rest]);
    try {
      const response = await fetch("/api/sonnely/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
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
      let content = "";
      let complete = false;
      const reply = (text: string): Thread[] => [
        {
          id,
          model,
          provider: selectedProvider,
          messages: [...history, { role: "assistant", content: text, model }],
        },
        ...rest,
      ];
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
      save(reply(content || "The provider returned no text."));
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
                    setActive(thread.id);
                    setSample(null);
                    setModel(thread.model);
                    setProvider(thread.provider ?? "near-ai");
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
            {localHistory ? "History stays on this device." : "History saving is off."}
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
            aria-controls="playground-history"
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
              {samples.map(({ prompt, title, icon: Icon }, index) => (
                <button
                  type="button"
                  className="button prompt"
                  key={prompt}
                  aria-label={prompt}
                  onClick={() => {
                    setSample(index);
                    setActive(null);
                    setError("");
                  }}
                >
                  <Icon size={19} className="prompt-icon" aria-hidden />
                  <span>
                    <strong>{title}</strong>
                    <span>{prompt}</span>
                  </span>
                  <ArrowUpRight size={15} aria-hidden />
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
                      ? "Sonnely sample"
                      : (models.find((item) => item.id === (message.model ?? current?.model))?.name ??
                        "Model")}
                </div>
                <p>{message.content}</p>
                {message.role === "assistant" && <CopyButton value={message.content} label="Copy response" />}
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
            enterKeyHint="send"
            placeholder="Write a message…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && ready && text.trim()) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="between composer-controls">
            <label className="model-select">
              <select
                aria-label="Inference model"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setProvider("near-ai");
                }}
                disabled={busy}
              >
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {(routes.length > 1 || !routes.includes(provider)) && (
              <label className="model-select">
                <select
                  aria-label="Inference provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderId)}
                  disabled={busy}
                >
                  {routes.map((id) => (
                    <option key={id} value={id}>
                      {providerNames[id]}
                    </option>
                  ))}
                  {!routes.includes(provider) && (
                    <option value={provider} disabled>
                      {providerNames[provider]} unavailable
                    </option>
                  )}
                </select>
              </label>
            )}
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
            : session.termsRequired
              ? "Accept the current terms to run live inference."
              : !session.inferenceEnabled
                ? "Live inference is temporarily unavailable."
                : localHistory
                  ? "History stays in this browser."
                  : "Chats aren’t saved when you leave Playground."}
        </p>
      </section>
    </div>
  );
}
