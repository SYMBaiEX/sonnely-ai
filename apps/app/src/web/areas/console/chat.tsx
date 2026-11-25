// spec/app/console/chat.md, "Story: Converse with a model": the playground — threads, a model picker, the composer —
// with the signed-out sample transcripts the legacy page shows, and the reply endpoint the server answers through.
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  BadgeCheck,
  Download,
  Fingerprint,
  KeyRound,
  Pencil,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";
import { Streamdown } from "streamdown";
import type { Chat, Message, Thread } from "../../../../gen/app__console__chat.ts";
import type { Console as ConsoleState } from "../../../../gen/app__console.ts";
import { catalog, chatIds } from "../../../../gen/app__console__catalog.ts";
import { Button, Input, Textarea, cn } from "@repo/ui";
import { useRemote } from "../../remote.ts";
import { useWorkspaceSession } from "./frame.tsx";
import { CopyButton } from "./bits.tsx";

/** The model id's display name in the catalog, or the id itself. */
const nameOf = (model: string) =>
  catalog.find((entry) => entry.routes.some((route) => route.endpoint === "chat/completions" && route.modelId === model))
    ?.name ?? model;

/** The transcript a thread exports, ported from the legacy console verbatim. */
function transcript(thread: Thread, format: "md" | "txt") {
  const head = [
    "Sonnely chat",
    "Model: " + nameOf(thread.model),
    "Exported: " + new Date().toLocaleString(),
    "",
  ];
  const body = thread.messages.flatMap((message) => [
    (format === "md" ? "## " : "") +
      (message.role === "User" ? "You" : nameOf(message.model)) +
      (format === "txt" ? ":" : ""),
    "",
    message.content,
    "",
  ]);
  return [...head, ...body].join("\n");
}

/** The sample conversations a signed-out visitor can open, verbatim from the legacy playground. */
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

/** Ask the server to answer the thread's pending message (or regenerate the last answer). */
async function completeReply(id: string, model: string) {
  const response = await fetch("/api/console/chat/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, model }),
  });
  const answer = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!answer?.ok) throw new Error(answer?.error ?? "Could not complete request.");
}

export function ChatSection() {
  const session = useWorkspaceSession();
  const chat = useRemote<Chat>("console__chat");
  const settings = useRemote<ConsoleState>("console");
  const signedIn = session.state?.tag === "SignedIn";
  const state = chat.state;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sample, setSample] = useState<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeSample = sample === null ? null : samples[sample];
  const current = state?.threads.find((thread) => thread.id === state.active);
  const messages: { role: "User" | "Assistant"; content: string; model: string }[] = activeSample
    ? [
        { role: "User", content: activeSample.prompt, model: "" },
        { role: "Assistant", content: activeSample.reply, model: "" },
      ]
    : (current?.messages ?? []);
  const lastRole = messages.at(-1)?.role;
  const ready = signedIn && state !== undefined;

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = text.trim();
    if (!prompt || !ready || busy || !state) return;
    const id = current?.id ?? crypto.randomUUID();
    const model = state.model;
    setBusy(true);
    setError("");
    setSample(null);
    try {
      const sent =
        editIndex !== null && current
          ? await chat.send({ type: "edit", id, index: editIndex, text: prompt })
          : await chat.send({ type: "send", id, model, text: prompt });
      if (!sent) {
        setError("The rules refused that message. Finish the current answer first.");
        return;
      }
      setText("");
      setEditIndex(null);
      composerRef.current?.focus();
      await completeReply(id, model);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not complete request.");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (busy || !ready || !current || activeSample || !state) return;
    setBusy(true);
    setError("");
    try {
      await completeReply(current.id, state.model);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not complete request.");
    } finally {
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

  function newChat() {
    setSample(null);
    setText("");
    setError("");
    setEditIndex(null);
    void chat.send({ type: "newChat" });
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

  const threads = state?.threads ?? [];
  const shown = threads.filter((thread) =>
    (thread.messages[0]?.content ?? "").toLowerCase().includes(search.toLowerCase()),
  );
  const model = state?.model ?? chatIds[0] ?? "";

  return (
    <div className="flex gap-6">
      <aside className="hidden w-56 shrink-0 flex-col gap-3 lg:flex" aria-label="Conversation history">
        <div className="flex items-center justify-between">
          <strong className="text-sm">Conversations</strong>
          <Button variant="ghost" size="icon" aria-label="New chat" onClick={newChat} disabled={busy} className="size-8">
            +
          </Button>
        </div>
        <Input
          type="search"
          aria-label="Search conversations"
          placeholder="Search conversations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-8 text-xs"
        />
        {shown.length ? (
          <div className="flex flex-col gap-1">
            {shown.map((thread) => {
              const title = thread.messages[0]?.content || "Untitled chat";
              return (
                <div key={thread.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={title}
                    aria-current={thread.id === state?.active ? "true" : undefined}
                    disabled={busy}
                    onClick={() => {
                      setSample(null);
                      setEditIndex(null);
                      setError("");
                      void chat.send({ type: "open", id: thread.id });
                    }}
                    className={cn(
                      "min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                      thread.id === state?.active && "bg-accent text-foreground",
                    )}
                  >
                    <span className="block truncate">{title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={"Delete " + (thread.messages[0]?.content || "chat")}
                    disabled={busy}
                    onClick={() => void chat.send({ type: "remove", id: thread.id })}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Your conversations appear here.{" "}
            {settings.state?.saveOnDevice ? "History stays on this device." : "History saving is off."}
          </p>
        )}
        {!activeSample && !!current?.messages.length && (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={downloadTranscript} disabled={busy}>
              <Download size={15} aria-hidden /> Export
            </Button>
            <CopyButton text={transcript(current, "txt")} label="Copy transcript" />
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Model
            <select
              aria-label="Model"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={model}
              onChange={(event) => void chat.send({ type: "pickModel", model: event.target.value })}
            >
              {chatIds.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={newChat} disabled={busy}>
            New chat
          </Button>
        </div>

        {!ready && (
          <div className="flex flex-wrap gap-2">
            {samples.map((item, index) => (
              <Button
                key={item.title}
                variant="outline"
                size="sm"
                onClick={() => setSample(index)}
                aria-pressed={sample === index}
              >
                <item.icon size={14} aria-hidden /> {item.title}
              </Button>
            ))}
          </div>
        )}

        {!messages.length && <h2 className="pt-8 font-serif text-2xl">What are you working on?</h2>}

        {!!messages.length && (
          <section aria-label="Messages" className="flex flex-col gap-4">
            {activeSample && <p className="text-xs text-muted-foreground">Sample transcript</p>}
            {messages.map((message, index) => (
              <article
                key={index}
                className={cn(
                  "flex max-w-3xl flex-col gap-1.5 rounded-lg border border-border p-4",
                  message.role === "User" ? "ml-auto bg-card" : "bg-background",
                )}
              >
                <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {message.role === "User" ? "You" : activeSample ? "Sonnely sample" : nameOf(message.model)}
                </div>
                {message.role === "Assistant" ? (
                  <div className="text-sm leading-6">
                    <Streamdown
                      disallowedElements={["img", "video", "audio", "source", "iframe"]}
                      controls={false}
                    >
                      {message.content}
                    </Streamdown>
                  </div>
                ) : (
                  <p className="text-sm leading-6">{message.content}</p>
                )}
                <div className="flex items-center gap-1">
                  {message.role === "Assistant" && !(busy && index === messages.length - 1) && (
                    <CopyButton text={message.content} label="Copy response" />
                  )}
                  {message.role === "User" && !activeSample && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => edit(index)}>
                      <Pencil size={13} aria-hidden /> Edit
                    </Button>
                  )}
                  {message.role === "Assistant" && index === messages.length - 1 && !activeSample && ready && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={retry}>
                      <RotateCcw size={13} aria-hidden /> Retry
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden="true">
                <span className="size-2 animate-pulse rounded-full bg-foreground" />
                {lastRole === "Assistant" ? "Streaming response…" : "Waiting for model…"}
              </p>
            )}
          </section>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-4">
          {editIndex !== null && (
            <p role="status" className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs">
              <span>Editing an earlier message. Sending replaces it and anything after it.</span>
              <Button variant="ghost" size="sm" onClick={() => setEditIndex(null)}>
                Cancel
              </Button>
            </p>
          )}
          <form className="flex items-end gap-2" onSubmit={sendMessage}>
            <Textarea
              ref={composerRef}
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={12000}
              aria-label="Message"
              enterKeyHint="send"
              placeholder="Ask a question or describe a task…"
              disabled={!ready}
              className="flex-1"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  ready &&
                  text.trim() &&
                  !busy
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button type="submit" aria-label="Send message" disabled={!ready || !text.trim() || busy}>
              Send <ArrowUp size={16} aria-hidden />
            </Button>
          </form>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BadgeCheck size={15} aria-hidden />
            {!signedIn
              ? "Connect a wallet to run live inference."
              : settings.state?.saveOnDevice
                ? "History stays in this browser."
                : "Chat history is off."}
          </p>
        </div>
      </div>
    </div>
  );
}
