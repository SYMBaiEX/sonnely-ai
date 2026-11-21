"use client";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { request, useSession, WalletControl } from "./wallet";

export function Contact() {
  const { session, failure, refresh } = useSession();
  const [ticket, setTicket] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ ticket: string }>("contact", Object.fromEntries(new FormData(form)));
      setTicket(result.ticket);
      form.reset();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not submit the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="contact-grid">
      <aside className="panel benefit">
        <Inbox />
        <h2>Support and partnerships</h2>
        <p>
          Include your use case or the steps that led to an issue. Sign in so we can associate the request
          with your workspace.
        </p>
        <WalletControl session={session} refresh={refresh} />
        {failure && <p role="alert">{failure}</p>}
      </aside>
      <form className="panel contact-form" onSubmit={submit}>
        <label>
          Email
          <input
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </label>
        <label>
          Topic
          <select name="topic">
            <option>Workspace support</option>
            <option>Provider partnership</option>
            <option>Billing</option>
            <option>Product feedback</option>
          </select>
        </label>
        <label>
          Message
          <textarea name="message" rows={6} maxLength={3000} required placeholder="How can we help?" />
        </label>
        <button type="submit" className="button ink" disabled={!session?.profile || busy}>
          {busy ? "Submitting…" : "Submit request"}
          <ArrowUpRight size={15} />
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {ticket && (
          <p role="status">
            Request saved. Reference <code>{ticket}</code>.
          </p>
        )}
      </form>
    </div>
  );
}
