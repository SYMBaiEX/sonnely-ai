/* eslint-disable better-tailwindcss/no-unknown-classes, no-restricted-syntax -- contact migration preserves the original form markup, class names and screen structure */
// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, Inbox } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Tickets } from "../../../../gen/app__support.ts";
import { useRemote } from "../../remote.ts";
import { useSession } from "../../session.ts";
import { WalletControl } from "../console/wallet.tsx";
import { SiteLead } from "./chrome.tsx";
import { entryActions, pages, supportTopics } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import { PlatformLinks } from "./products.tsx";
import { textLink, wrap } from "./ui.ts";

const defaultTopic = "Workspace support";

function ContactForm() {
  const session = useSession();
  const support = useRemote<Tickets>("support");
  const [ticket, setTicket] = useState("");
  const [topic, setTopic] = useState(defaultTopic);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const checkingAccount = session.state === undefined && !session.error;

  async function signIn(signedWallet: string) {
    await session.refresh();
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response.ok) return false;
    const state: unknown = await response.json();
    return (
      typeof state === "object" &&
      state !== null &&
      "tag" in state &&
      state.tag === "SignedIn" &&
      "wallet" in state &&
      state.wallet === signedWallet
    );
  }

  async function signOut() {
    return session.send({ type: "signOut" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const field = (name: string) => {
      const value = fields.get(name);
      return typeof value === "string" ? value : "";
    };
    const id = crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const ok = await support.send({
        type: "open",
        id,
        email: field("email"),
        topic: field("topic"),
        message: field("message"),
        now: Date.now(),
      });
      if (!ok) {
        setError("Could not submit the request.");
        return;
      }
      setTicket(id);
      form.reset();
      setTopic(defaultTopic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="contact-grid" id="support-form">
      <aside className="panel contact-guide">
        <h2>Choose a support topic</h2>
        <div className="contact-topics" role="group" aria-label="Choose a support topic">
          {supportTopics.map(([icon, label, description]) => (
            <button
              type="button"
              key={label}
              className="contact-topic"
              aria-pressed={topic === label}
              onClick={() => setTopic(label)}
            >
              <ProductIcon name={icon} size={21} />
              <span>
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
              <ArrowUpRight size={15} aria-hidden="true" />
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
          <a className="text-link" href="/docs/troubleshooting">
            API troubleshooting <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a className="text-link" href="/console/billing">
            Billing history <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a className="text-link" href="mailto:sonnely@symbaiex.com">
            Email support without signing in <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a className="text-link" href="https://x.com/sonnelyai" aria-label="Sonnely on X">
            Sonnely on X <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      </aside>
      <form className="panel contact-form" onSubmit={(event) => void submit(event)} aria-labelledby="support-request">
        <div>
          <Inbox size={20} aria-hidden="true" />
          <h2 id="support-request">Send a support request</h2>
          <p className="caption">
            Connect your wallet so we can find your workspace. Save the reference after you submit.
          </p>
        </div>
        <WalletControl
          wallet={wallet}
          cluster="mainnet"
          checkingAccount={checkingAccount}
          onSignIn={signIn}
          onSignOut={signOut}
        />
        {session.error && <p role="alert">{session.error}</p>}
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
            <option>Infrastructure partnership</option>
            <option>Billing</option>
            <option>Product feedback</option>
          </select>
        </label>
        <label>
          Message
          <textarea name="message" rows={6} maxLength={3000} required placeholder="How can we help?" />
        </label>
        <button type="submit" className="button accent" disabled={!wallet || busy}>
          {busy ? "Submitting…" : "Submit request"}
          <ArrowUpRight size={15} aria-hidden="true" />
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

export function ContactPage() {
  const [title, description] = pages.contact;
  const entry = entryActions.contact;
  return (
    <div className={wrap + " inner-page market-page"}>
      <SiteLead
        title={title}
        description={description}
        brief={{
          title: "Contact Sonnely",
          rows: [
            ["Workspace", "Access and API support"],
            ["Billing", "Payments and usage charges"],
            ["Partners", "Infrastructure partnerships"],
          ],
        }}
      >
        <div className="product-entry-actions">
          <a href={entry.section} className="button accent">
            {entry.label} <ArrowDown size={15} aria-hidden="true" />
          </a>
          <a href={entry.next} className={textLink}>
            {entry.action} <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </SiteLead>
      <ContactForm />
      <PlatformLinks compact />
    </div>
  );
}
