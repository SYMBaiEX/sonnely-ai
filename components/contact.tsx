"use client";
import Link from "next/link";
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
        <div className="contact-resources">
          <h3>Before you submit</h3>
          <p>
            For API issues, include the status code, model ID and approximate time. For billing, include the
            payment reference or public transaction signature. Keep API keys, wallet recovery phrases and
            private prompt text out of the request.
          </p>
          <Link className="text-link" href="/docs#errors">
            API troubleshooting <ArrowUpRight size={16} />
          </Link>
          <Link className="text-link" href="/console/billing">
            Billing history <ArrowUpRight size={16} />
          </Link>
        </div>
      </aside>
      <form className="panel contact-form" onSubmit={submit} aria-labelledby="support-request">
        <div>
          <h2 id="support-request">Send a support request</h2>
          <p className="caption">
            Connect a wallet to submit. Save the reference after the request is recorded.
          </p>
        </div>
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
