"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LifeBuoy } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { request, type Session } from "./wallet";
import { WorkspaceHeading } from "./workspace-heading";

type Profile = Session["profile"] | undefined;
type TicketsPage = FunctionReturnType<typeof api.support.myTickets>;
type TicketRow = TicketsPage["page"][number];
type Thread = NonNullable<FunctionReturnType<typeof api.support.myThread>>;

const localTime = (date: number) => new Date(date).toLocaleString();
const ticketStates = { open: "Open", in_progress: "In progress", resolved: "Resolved" } as const;
const seenKey = "sonnely.supportSeen";

function useRemote<T>(enabled: boolean, route: string) {
  const [state, setState] = useState<{ route: string; version: number; data?: T; error?: string }>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setState(undefined);
      return;
    }
    let alive = true;
    void request<T>(route)
      .then((data) => {
        if (alive) setState({ route, version, data });
      })
      .catch((error) => {
        if (alive)
          setState({
            route,
            version,
            error: error instanceof Error ? error.message : "Could not load this page.",
          });
      });
    return () => {
      alive = false;
    };
  }, [enabled, route, version]);
  const current = enabled && state?.route === route && state.version === version ? state : undefined;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    reload: () => setVersion((value) => value + 1),
  };
}

function SupportThread({ id, reload }: { id: string; reload: () => void }) {
  const { data, error, reload: reloadThread } = useRemote<Thread | null>(
    true,
    "support-thread?id=" + encodeURIComponent(id),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setFailure("");
    try {
      await request("support-reply", { id, body: new FormData(form).get("body") });
      form.reset();
      reloadThread();
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not send the reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-thread">
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !data ? (
        <p role="status" className="caption">
          Loading conversation…
        </p>
      ) : (
        <ul className="crm-activity">
          <li>
            <p className="crm-note">{data.message}</p>
            <p className="caption">{localTime(data.opened)} · You</p>
          </li>
          {data.replies.map((item) => (
            <li key={item.id}>
              <p className="crm-note">{item.body}</p>
              <p className="caption">
                {localTime(item.time)} · {item.mine ? "You" : "Support"}
              </p>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <form className="recovery-form" onSubmit={(event) => void send(event)}>
          <label>
            Reply
            <textarea
              name="body"
              rows={3}
              maxLength={4000}
              required
              placeholder="Add details or follow up on this request."
            />
          </label>
          {data.state === "resolved" && (
            <p className="caption">Replying reopens this request.</p>
          )}
          <button className="button quiet" disabled={busy}>
            {busy ? "Sending…" : "Send reply"}
          </button>
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function NewRequest({ email, done }: { email?: string; done: () => void }) {
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
      await request("support-open", {
        email: fields.get("email"),
        topic: fields.get("topic"),
        message: fields.get("message"),
      });
      form.reset();
      setNotice("Request sent. Replies appear in your request list.");
      done();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not submit the request.");
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
            <option>Workspace support</option>
            <option>Provider partnership</option>
            <option>Billing</option>
            <option>Product feedback</option>
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
        {notice && (
          <p role="status" className="status">
            {notice}
          </p>
        )}
      </form>
    </section>
  );
}

export function SupportPanel({ profile }: { profile: Profile }) {
  const signedIn = Boolean(profile);
  const { data, error, reload } = useRemote<TicketsPage>(signedIn, "support-tickets");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem(seenKey) ?? "{}"));
    } catch {
      /* Ignore stored markers that cannot be parsed. */
    }
  }, []);

  function markSeen(id: string, time?: number) {
    if (!time) return;
    setSeen((current) => {
      if ((current[id] ?? 0) >= time) return current;
      const next = { ...current, [id]: time };
      try {
        localStorage.setItem(seenKey, JSON.stringify(next));
      } catch {
        /* Read markers are best-effort. */
      }
      return next;
    });
  }

  return (
    <>
      <WorkspaceHeading
        icon={LifeBuoy}
        title="Support"
        description="Open a request and follow replies from the team."
      />
      {!profile ? (
        <section className="panel stack-panel admin-access">
          <LifeBuoy size={21} aria-hidden="true" />
          <h2>Sign in to view support requests</h2>
          <p>Connect a Solana wallet to open a request and follow replies here.</p>
        </section>
      ) : (
        <>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <section className="panel stack-panel" aria-labelledby="support-requests">
            <div className="between">
              <h2 id="support-requests">Your requests</h2>
              <button type="button" className="button quiet small" onClick={reload}>
                Refresh
              </button>
            </div>
            {!data && !error ? (
              <p className="caption" role="status">
                Loading requests…
              </p>
            ) : !data?.page.length ? (
              <p className="caption">No support requests yet.</p>
            ) : (
              <div className="crm-records">
                {data.page.map((row) => {
                  const unread = row.hasPublicReply && (row.lastReplyAt ?? 0) > (seen[row.id] ?? 0);
                  return (
                    <details
                      key={row.id}
                      className="crm-record"
                      onToggle={(event) => {
                        if (!event.currentTarget.open) return;
                        markSeen(row.id, row.lastReplyAt);
                        if (!expanded[row.id])
                          setExpanded((current) => ({ ...current, [row.id]: true }));
                      }}
                    >
                      <summary>
                        <span>
                          <strong>{row.topic}</strong>
                          <span className="caption">
                            {localTime(row.lastReplyAt ?? row.updated ?? row.opened)}
                            {row.replyCount
                              ? " · " + row.replyCount + (row.replyCount === 1 ? " reply" : " replies")
                              : ""}
                          </span>
                        </span>
                        {unread && <span className="crm-state">New reply</span>}
                        <span className="crm-state">{ticketStates[row.state]}</span>
                      </summary>
                      {expanded[row.id] && <SupportThread id={row.id} reload={reload} />}
                    </details>
                  );
                })}
              </div>
            )}
          </section>
          <NewRequest email={data?.page[0]?.email} done={reload} />
        </>
      )}
    </>
  );
}
