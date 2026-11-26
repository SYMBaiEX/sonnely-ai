// spec/app/support.md, "Story: Open a request" and "Story: Converse on a request": the customer request list,
// its expandable public threads, replies and the new-request form.
import { LifeBuoy } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import { useSession } from "../../session.ts";
import type { Ticket, TicketState, Tickets } from "../../../../gen/app__support.ts";
import { useRemote } from "../../remote.ts";
import { ConsoleFrame } from "../console/frame.tsx";
import { WorkspaceHeading, dateTime } from "../console/bits.tsx";

const ticketStates: Record<TicketState, string> = { Open: "Open", InProgress: "In progress", Resolved: "Resolved" };
const seenKey = "sonnely.supportSeen";
const topics = ["Workspace support", "Infrastructure partnership", "Billing", "Product feedback"];

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

function SupportThread({ ticket, send }: { ticket: Ticket; send: (input: unknown) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const replies = ticket.replies.filter((item) => item.visibility === "Public");

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
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
    <div className="crm-thread">
      <ul className="crm-activity">
        <li>
          <p className="crm-note">{ticket.message}</p>
          <p className="caption">{dateTime(ticket.openedAt)} · You</p>
        </li>
        {replies.map((item, index) => (
          <li key={item.time + ":" + index}>
            <p className="crm-note">{item.body}</p>
            <p className="caption">
              {dateTime(item.time)} · {item.author === "Customer" ? "You" : "Support"}
            </p>
          </li>
        ))}
      </ul>
      <form className="recovery-form" onSubmit={(event) => void sendReply(event)}>
        <label>
          Reply
          <textarea name="body" rows={3} maxLength={4000} required placeholder="Add details or follow up on this request." />
        </label>
        {ticket.state === "Resolved" && <p className="caption">Replying reopens this request.</p>}
        <button className="button quiet" disabled={busy}>
          {busy ? "Sending…" : "Send reply"}
        </button>
        {failure && (
          <p role="alert" className="error">
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
        email: String(fields.get("email") ?? "").trim(),
        topic: String(fields.get("topic") ?? "").trim(),
        message: String(fields.get("message") ?? "").trim(),
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
    <section className="panel stack-panel" aria-labelledby="new-request">
      <h2 id="new-request">New request</h2>
      <form className="recovery-form" onSubmit={(event) => void submit(event)}>
        <label>
          Email
          <input
            key={email ?? "new"}
            name="email"
            type="email"
            defaultValue={email}
            maxLength={254}
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </label>
        <label>
          Topic
          <select name="topic" defaultValue="Workspace support">
            {topics.map((topic) => (
              <option key={topic}>{topic}</option>
            ))}
          </select>
        </label>
        <label>
          Message
          <textarea name="message" rows={5} maxLength={3000} required placeholder="How can we help?" />
        </label>
        <button type="submit" className="button accent" disabled={busy}>
          {busy ? "Submitting…" : "Submit request"}
        </button>
        {failure && (
          <p role="alert" className="error">
            {failure}
          </p>
        )}
        <p role="status" className={notice ? "status" : "visually-hidden"}>
          {notice}
        </p>
      </form>
    </section>
  );
}

function SignedInSupport({ wallet, reload }: { wallet: string; reload: () => void }) {
  const support = useRemote<Tickets>("support");
  const [seen, setSeen] = useState<Record<string, number>>(readSeen);
  const tickets = [...(support.state?.tickets ?? [])].filter((row) => row.wallet === wallet).reverse();

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
        <p role="alert" className="error">
          {support.error}
        </p>
      )}
      <section className="panel stack-panel" aria-labelledby="support-requests">
        <div className="between">
          <h2 id="support-requests">Your requests</h2>
          <button type="button" className="button quiet small" onClick={reload}>
            Refresh
          </button>
        </div>
        {!support.state && !support.error ? (
          <p className="caption" role="status">
            Loading requests…
          </p>
        ) : !tickets.length ? (
          <p className="caption">No support requests yet.</p>
        ) : (
          <div className="crm-records">
            {tickets.map((row) => {
              const visible = row.replies.filter((item) => item.visibility === "Public");
              const staffTimes = visible.filter((item) => item.author === "Staff").map((item) => item.time);
              const lastReplyAt = staffTimes.length ? Math.max(...staffTimes) : undefined;
              const unread = staffTimes.length > 0 && (lastReplyAt ?? 0) > (seen[row.id] ?? 0);
              return (
                <details
                  key={row.id}
                  className="crm-record"
                  onToggle={(event) => {
                    if (event.currentTarget.open) markSeen(row.id, lastReplyAt);
                  }}
                >
                  <summary>
                    <span>
                      <strong>{row.topic}</strong>
                      <span className="caption">
                        {dateTime(lastReplyAt ?? row.updatedAt ?? row.openedAt)}
                        {visible.length ? " · " + visible.length + (visible.length === 1 ? " reply" : " replies") : ""}
                      </span>
                    </span>
                    {unread && <span className="crm-state">New reply</span>}
                    <span className="crm-state">{ticketStates[row.state]}</span>
                  </summary>
                  <SupportThread ticket={row} send={support.send} />
                </details>
              );
            })}
          </div>
        )}
      </section>
      <NewRequest email={tickets[0]?.email} wallet={wallet} send={support.send} />
    </>
  );
}

function SupportSession() {
  const session = useSession();
  const [revision, setRevision] = useState(0);
  const signedIn = session.state?.tag === "SignedIn";
  return (
    <>
      <WorkspaceHeading
        icon={LifeBuoy}
        title="Support"
        description="Open a request and follow replies from the team."
      />
      {!signedIn ? (
        <section className="panel stack-panel admin-access">
          <LifeBuoy size={21} aria-hidden="true" />
          <h2>Sign in to view support requests</h2>
          <p>Connect a Solana wallet to open a request and follow replies here.</p>
        </section>
      ) : (
        <SignedInSupport key={revision} wallet={session.state?.tag === "SignedIn" ? session.state.wallet : ""} reload={() => setRevision((current) => current + 1)} />
      )}
    </>
  );
}

export function SupportWorkspace() {
  return (
    <div className="workspace-surface">
      <SupportSession />
    </div>
  );
}
