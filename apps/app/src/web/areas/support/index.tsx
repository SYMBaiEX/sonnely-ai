// spec/app/support.md, "Story: Open a request"; spec/app/support.md, "Story: Converse on a request"
import { LifeBuoy } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Card, EmptyState, Field, Input, Select, Textarea } from "@repo/ui";
import type { Page } from "../../../../gen/app__nav.ts";
import { useSession } from "../../session.ts";
import type { Ticket, TicketState, Tickets } from "../../../../gen/app__support.ts";
import { useRemote } from "../../remote.ts";
import { ConsoleFrame } from "../console/frame.tsx";
import { WorkspaceHeading, dateTime } from "../console/bits.tsx";

const ticketStates: Record<TicketState, string> = { Open: "Open", InProgress: "In progress", Resolved: "Resolved" };
const seenKey = "sonnely.supportSeen";
const topics = ["Workspace support", "Infrastructure partnership", "Billing", "Product feedback"];
const metaClass = "text-meta text-muted-foreground";
const pillClass = "inline-flex items-center rounded-xl border px-2 py-0.5 text-micro font-medium";

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Support") return null;
  return (
    <ConsoleFrame section="Support">
      <SupportWorkspace />
    </ConsoleFrame>
  );
}

function readSeen() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(seenKey) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])),
    );
  } catch {
    return {};
  }
}

function formText(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function stateTone(state: TicketState) {
  if (state === "Resolved") return "border-ok/40 bg-ok/10 text-ok";
  if (state === "InProgress") return "border-warn/40 bg-warn/10 text-warn";
  return "border-info/40 bg-info/10 text-info";
}

function SupportThread({ ticket, send }: { ticket: Ticket; send: (input: unknown) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const replies = ticket.replies.filter((item) => item.visibility === "Public");

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formText(new FormData(form), "body");
    setBusy(true);
    setFailure("");
    try {
      const ok = await send({ type: "reply", id: ticket.id, body, now: Date.now() });
      if (ok) form.reset();
      else setFailure("Could not send the reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 border-t border-border px-4 py-4">
      <ul className="grid gap-3">
        <li className="grid gap-1">
          <p className="text-ui text-foreground">{ticket.message}</p>
          <p className={metaClass}>{dateTime(ticket.openedAt)} · You</p>
        </li>
        {replies.map((item) => (
          <li key={`${item.time}:${item.author}:${item.body.slice(0, 24)}`} className="grid gap-1">
            <p className="text-ui text-foreground">{item.body}</p>
            <p className={metaClass}>
              {dateTime(item.time)} · {item.author === "Customer" ? "You" : "Support"}
            </p>
          </li>
        ))}
      </ul>
      <form className="grid gap-3" onSubmit={(event) => void sendReply(event)}>
        <Field
          label="Reply"
          control={(props) => <Textarea {...props} className="min-h-20" name="body" rows={3} maxLength={4000} required placeholder="Add details or follow up on this request." />}
        />
        {ticket.state === "Resolved" && <p className={metaClass}>Replying reopens this request.</p>}
        <div>
          <Button type="submit" variant="outline" loading={busy}>
            Send reply
          </Button>
        </div>
        {failure && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-ui text-destructive">
            {failure}
          </p>
        )}
      </form>
    </div>
  );
}

function NewRequest({ email, wallet, send }: { email?: string; wallet: string; send: (input: unknown) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const ok = await send({
        type: "open",
        id: crypto.randomUUID(),
        email: formText(fields, "email"),
        topic: formText(fields, "topic"),
        message: formText(fields, "message"),
        wallet,
        now: Date.now(),
      });
      if (!ok) {
        setFailure("Could not submit the request.");
        return;
      }
      form.reset();
      setNotice("Request sent. Replies appear in your request list.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="new-request" className="gap-4 p-4 shadow-none">
      <h2 id="new-request" className="text-lead font-strong tracking-heading">
        New request
      </h2>
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <Field
          className="max-w-md"
          label="Email"
          control={(props) => (
            <Input
              key={email ?? "new"}
              {...props}
              name="email"
              type="email"
              defaultValue={email}
              maxLength={254}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          )}
        />
        <Field
          className="max-w-md"
          label="Topic"
          control={(props) => (
            <Select {...props} name="topic" defaultValue="Workspace support">
              {topics.map((topic) => (
                <option key={topic}>{topic}</option>
              ))}
            </Select>
          )}
        />
        <Field
          className="max-w-md"
          label="Message"
          control={(props) => <Textarea {...props} className="min-h-24" name="message" rows={5} maxLength={3000} required placeholder="How can we help?" />}
        />
        <div>
          <Button type="submit" loading={busy}>
            Submit request
          </Button>
        </div>
        {failure && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-ui text-destructive">
            {failure}
          </p>
        )}
        <p role="status" className={notice ? "rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-ui text-ok" : "sr-only"}>
          {notice}
        </p>
      </form>
    </Card>
  );
}

function SignedInSupport({ wallet, reload }: { wallet: string; reload: () => void }) {
  const support = useRemote<Tickets>("support");
  const [seen, setSeen] = useState<Record<string, number>>(readSeen);
  const tickets = [...(support.state?.tickets ?? [])].filter((row) => row.wallet === wallet).reverse();
  const send = (input: unknown) => support.send(input);

  function markSeen(id: string, time?: number) {
    if (!time) return;
    setSeen((current) => {
      if ((current[id] ?? 0) >= time) return current;
      const next = { ...current, [id]: time };
      try {
        localStorage.setItem(seenKey, JSON.stringify(next));
      } catch {
        return next;
      }
      return next;
    });
  }

  return (
    <>
      {support.error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-ui text-destructive">
          {support.error}
        </p>
      )}
      <Card aria-labelledby="support-requests" className="gap-4 p-4 shadow-none">
        <div className="flex items-center justify-between gap-3">
          <h2 id="support-requests" className="text-lead font-strong tracking-heading">
            Your requests
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            Refresh
          </Button>
        </div>
        {!support.state && !support.error ? (
          <p className={metaClass} role="status">
            Loading requests…
          </p>
        ) : !tickets.length ? (
          <EmptyState title="No support requests yet." icon={<LifeBuoy size={22} aria-hidden />} />
        ) : (
          <div className="grid gap-3">
            {tickets.map((row) => {
              const visible = row.replies.filter((item) => item.visibility === "Public");
              const staffTimes = visible.filter((item) => item.author === "Staff").map((item) => item.time);
              const lastReplyAt = staffTimes.length ? Math.max(...staffTimes) : undefined;
              const unread = staffTimes.length > 0 && (lastReplyAt ?? 0) > (seen[row.id] ?? 0);
              return (
                <details
                  key={row.id}
                  className="group rounded-lg border border-border bg-background open:bg-card"
                  onToggle={(event) => {
                    if (event.currentTarget.open) markSeen(row.id, lastReplyAt);
                  }}
                >
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 outline-none focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="grid gap-1">
                      <strong className="text-ui font-medium">{row.topic}</strong>
                      <span className={metaClass}>
                        {dateTime(lastReplyAt ?? row.updatedAt ?? row.openedAt)}
                        {visible.length ? " · " + visible.length + (visible.length === 1 ? " reply" : " replies") : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {unread && <span className={`${pillClass} border-info/40 bg-info/10 text-info`}>New reply</span>}
                      <span className={`${pillClass} ${stateTone(row.state)}`}>{ticketStates[row.state]}</span>
                    </span>
                  </summary>
                  <SupportThread ticket={row} send={send} />
                </details>
              );
            })}
          </div>
        )}
      </Card>
      <NewRequest email={tickets[0]?.email} wallet={wallet} send={send} />
    </>
  );
}

function SupportSession() {
  const session = useSession();
  const [revision, setRevision] = useState(0);
  const signedIn = session.state?.tag === "SignedIn";
  return (
    <>
      <WorkspaceHeading icon={LifeBuoy} title="Support" description="Open a request and follow replies from the team." />
      {!signedIn ? (
        <Card className="items-center gap-3 p-6 text-center shadow-none">
          <LifeBuoy size={21} aria-hidden="true" className="text-primary" />
          <h2 className="text-lead font-strong tracking-heading">Sign in to view support requests</h2>
          <p className={metaClass}>Connect a Solana wallet to open a request and follow replies here.</p>
        </Card>
      ) : (
        <SignedInSupport key={revision} wallet={session.state?.tag === "SignedIn" ? session.state.wallet : ""} reload={() => setRevision((current) => current + 1)} />
      )}
    </>
  );
}

export function SupportWorkspace() {
  return (
    <div className="grid min-w-0 gap-3 text-foreground">
      <SupportSession />
    </div>
  );
}
