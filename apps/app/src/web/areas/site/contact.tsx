/* eslint-disable better-tailwindcss/no-unknown-classes, no-restricted-syntax -- contact migration preserves the original form markup, class names and screen structure */
// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, Inbox } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Tickets } from "../../../../gen/app__support.ts";
import { useRemote } from "../../remote.ts";
import { useSession } from "../../session.ts";
import { useBillingCluster, WalletControl } from "../console/wallet.tsx";
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
  const cluster = useBillingCluster();

  async function signIn(signedWallet: string) {
    const state = await session.refresh();
    return state?.tag === "SignedIn" && state.wallet === signedWallet;
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
        wallet: wallet ?? "",
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
        <h2>Before you submit</h2>
        <div className="contact-resources contact-resources-first">
          <p>
            For API issues, include the status code, model ID and approximate time. For billing, include the
            payment reference or public transaction signature. Keep API keys, wallet recovery phrases and
            private prompt text out of the request.
          </p>
        </div>
        <div className="contact-resources">
          <h3>After you submit</h3>
          <p>
            The request is saved with a reference you can quote when you follow up. Signed-in workspaces
            can track the request and its status in the console.
          </p>
          <a className="text-link" href="/console/support">
            Track requests in the console <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="contact-resources">
          <h3>Other ways to reach us</h3>
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
          cluster={cluster}
          checkingAccount={checkingAccount}
          onSignIn={signIn}
          onSignOut={signOut}
        />
        {session.error && <p role="alert">{session.error}</p>}
        <fieldset className="contact-topics">
          <legend>Topic</legend>
          {supportTopics.map(([icon, label, description]) => (
            <label key={label} className="contact-topic" data-checked={topic === label || undefined}>
              <input
                type="radio"
                name="topic"
                value={label}
                checked={topic === label}
                onChange={() => setTopic(label)}
              />
              <ProductIcon name={icon} size={21} />
              <span>
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
            </label>
          ))}
        </fieldset>
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
