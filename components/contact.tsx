"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Code2, CreditCard, Inbox, Send } from "lucide-react";
import { request, useSession, WalletControl } from "./wallet";

const supportTopics = [
  [Code2, "Workspace support", "API errors, keys, sign-in, and model access"],
  [CreditCard, "Billing", "USDC payments, credit balances, and charges"],
  [Send, "Provider partnership", "Model providers and integration questions"],
] as const;

export function Contact() {
  const { session, failure, refresh } = useSession();
  const [ticket, setTicket] = useState("");
  const [topic, setTopic] = useState("Workspace support");
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
      setTopic("Workspace support");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not submit the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="contact-grid" id="support-form">
      <aside className="panel contact-guide">
        <h2>Choose a support topic</h2>
        <div className="contact-topics" role="group" aria-label="Choose a support topic">
          {supportTopics.map(([Icon, label, description]) => (
            <button
              type="button"
              key={label}
              className="contact-topic"
              aria-pressed={topic === label}
              onClick={() => setTopic(label)}
            >
              <Icon size={21} aria-hidden />
              <span>
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
              <ArrowUpRight size={15} aria-hidden />
            </button>
          ))}
        </div>
        <div className="contact-resources">
          <h3>Before you submit</h3>
          <p>
            For API issues, include the status code, model ID and approximate time. For billing, include the
            payment reference or public transaction signature. Keep API keys, wallet recovery phrases and
            private prompt text out of the request.
          </p>
          <Link className="text-link" href="/docs/troubleshooting">
            API troubleshooting <ArrowUpRight size={16} />
          </Link>
          <Link className="text-link" href="/console/billing">
            Billing history <ArrowUpRight size={16} />
          </Link>
        </div>
      </aside>
      <form className="panel contact-form" onSubmit={submit} aria-labelledby="support-request">
        <div>
          <Inbox size={20} aria-hidden="true" />
          <h2 id="support-request">Send a support request</h2>
          <p className="caption">
            Connect your wallet so we can find your workspace. Save the reference after you submit.
          </p>
        </div>
        <WalletControl session={session} refresh={refresh} />
        {failure && <p role="alert">{failure}</p>}
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
          <select name="topic" value={topic} onChange={(event) => setTopic(event.target.value)}>
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
        <button type="submit" className="button accent" disabled={!session?.profile || busy}>
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
