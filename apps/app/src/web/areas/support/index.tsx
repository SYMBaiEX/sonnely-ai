// spec/app/support.md, "Story: Open a request": the request list, its threads, and the new-request form.
import { LifeBuoy } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Ticket, TicketState, Tickets } from "../../../../gen/app__support.ts";
import { Button, Card, CardTitle, Input, Label, Textarea } from "@repo/ui";
import { useRemote } from "../../remote.ts";

const states: Record<TicketState, string> = { Open: "Open", InProgress: "In progress", Resolved: "Resolved" };
const localTime = (time: number) =>
  new Date(time).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const topics = ["Workspace support", "Infrastructure partnership", "Billing", "Product feedback"];

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Support") return null;
  return <SupportArea />;
}

function SupportArea() {
  const { state, send, error } = useRemote<Tickets>("support");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");

  const tickets = state?.tickets ?? [];
  const email = tickets[0]?.email;

  async function run(event: object, message: string, done?: () => void) {
    setBusy(true);
    setFailure("");
    try {
      const ok = await send(event);
      if (ok) done?.();
      else setFailure(message);
    } finally {
      setBusy(false);
    }
  }

  async function openRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const request = {
      type: "open",
      id: crypto.randomUUID(),
      email: String(data.get("email") ?? "").trim(),
      topic: String(data.get("topic") ?? "Workspace support"),
      message: String(data.get("message") ?? "").trim(),
      now: Date.now(),
    };
    await run(request, "Could not open the request.", () => {
      event.currentTarget.reset();
      setNotice("Request submitted.");
    });
  }

  async function reply(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = String(data.get("body") ?? "").trim();
    if (!body) return;
    await run({ type: "reply", id, body, now: Date.now() }, "Could not send the reply.", () =>
      event.currentTarget.reset(),
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <LifeBuoy size={21} className="text-muted-foreground" aria-hidden />
        <div>
          <h1 className="font-serif text-3xl">Support</h1>
          <p className="text-sm text-muted-foreground">Open a request and follow replies from the team.</p>
        </div>
      </header>

      {(failure || error) && (
        <p role="alert" className="text-sm text-destructive">
          {failure || error}
        </p>
      )}

      <Card aria-labelledby="support-requests">
        <CardTitle id="support-requests">Your requests</CardTitle>
        {state === undefined ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading requests…
          </p>
        ) : !tickets.length ? (
          <p className="text-sm text-muted-foreground">No support requests yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...tickets].reverse().map((row) => (
              <details
                key={row.id}
                className="rounded-md border border-border px-4 py-3"
                onToggle={(event) => {
                  if (!event.currentTarget.open) return;
                  if (!expanded[row.id]) setExpanded((current) => ({ ...current, [row.id]: true }));
                }}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span>
                    <strong className="text-sm">{row.topic}</strong>
                    <span className="block text-xs text-muted-foreground">
                      {localTime(row.updatedAt)}
                      {row.replies.length
                        ? " · " + row.replies.length + (row.replies.length === 1 ? " reply" : " replies")
                        : ""}
                    </span>
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {states[row.state]}
                  </span>
                </summary>
                {expanded[row.id] && <Thread ticket={row} busy={busy} reply={(event) => void reply(row.id, event)} />}
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card asChild>
        <form onSubmit={(event) => void openRequest(event)} aria-labelledby="new-request">
          <CardTitle id="new-request">New request</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label className="flex flex-col gap-1 text-sm">
              Email
              <Input
                key={email ?? "new"}
                name="email"
                type="email"
                defaultValue={email}
                maxLength={254}
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </Label>
            <Label className="flex flex-col gap-1 text-sm">
              Topic
              <select name="topic" defaultValue="Workspace support" className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                {topics.map((topic) => (
                  <option key={topic}>{topic}</option>
                ))}
              </select>
            </Label>
          </div>
          <Label className="flex flex-col gap-1 text-sm">
            Message
            <Textarea name="message" rows={5} maxLength={3000} required placeholder="How can we help?" />
          </Label>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" loading={busy}>
              Submit request
            </Button>
            <p role="status" className="text-xs text-muted-foreground">
              {notice}
            </p>
          </div>
        </form>
      </Card>
    </main>
  );
}

function Thread({ ticket, busy, reply }: { ticket: Ticket; busy: boolean; reply: (event: FormEvent<HTMLFormElement>) => void }) {
  const replies = ticket.replies.filter((entry) => entry.visibility === "Public");
  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex flex-col gap-3">
        <Message
          body={ticket.message}
          caption={`${localTime(ticket.openedAt)} · You`}
        />
        {replies.map((entry, index) => (
          <Message
            key={index}
            body={entry.body}
            caption={`${localTime(entry.time)} · ${entry.author === "Customer" ? "You" : "Sonnely"}`}
          />
        ))}
      </div>
      <form className="flex flex-col gap-2" onSubmit={reply}>
        <Label className="flex flex-col gap-1 text-sm">
          Reply
          <Textarea name="body" rows={3} maxLength={4000} required placeholder="Add details or follow up on this request." />
        </Label>
        {ticket.state === "Resolved" && (
          <p className="text-xs text-muted-foreground">Replying reopens this request.</p>
        )}
        <div>
          <Button type="submit" variant="secondary" size="sm" loading={busy}>
            Send reply
          </Button>
        </div>
      </form>
    </div>
  );
}

function Message({ body, caption }: { body: string; caption: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{caption}</p>
      <p className="whitespace-pre-wrap text-sm">{body}</p>
    </div>
  );
}
