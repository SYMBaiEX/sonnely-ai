// spec/app/support.md, "Story: Open a request"
import { ArrowUpRight } from "lucide-react";
import {
  ContactFields,
  SubmitButton,
  SupportFeedback,
  WalletGate,
  contactDestinations,
  mailtoFor,
  submitContactForm,
  useSupportRequest,
} from "./contact-shared.tsx";

export function ContactPage() {
  const request = useSupportRequest();

  return (
    <div className="wrap cx-page">
      <header className="cx-head">
        <p className="cx-eyebrow">Sonnely support</p>
        <h1>
          Contact Sonnely<span aria-hidden="true">.</span>
        </h1>
        <p className="cx-lede">
          Choose the desk, attach your workspace and include the evidence that lets the first reply act.
        </p>
      </header>

      <div className="cx-layout">
        <form className="cx-panel cx-form" noValidate onSubmit={(event) => submitContactForm(event, request)} aria-labelledby="cx-topics-title">
          <fieldset className="cx-topics">
            <legend id="cx-topics-title">Send this note to</legend>
            <div className="cx-topic-grid">
              {contactDestinations.map((destination) => (
                <label className="cx-topic" data-active={request.topicId === destination.id} key={destination.id}>
                  <input
                    type="radio"
                    name="correspondence-topic"
                    value={destination.id}
                    checked={request.topicId === destination.id}
                    onChange={() => request.chooseTopic(destination.id)}
                  />
                  <span className="cx-topic-icon" aria-hidden="true">
                    <destination.Icon size={16} />
                  </span>
                  <span className="cx-topic-copy">
                    <strong>{destination.shortName}</strong>
                    <small>{destination.summary}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <WalletGate request={request} compact />

          <ContactFields request={request} messageRows={7} />

          <div className="cx-form-actions">
            <SubmitButton request={request}>Send the note</SubmitButton>
            <a className="cx-email-link" href={mailtoFor(request.destination)}>
              Write by email <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          <SupportFeedback request={request} />
        </form>

        <aside className="cx-aside" aria-label="Before writing">
          <div className="cx-guide">
            <span className="cx-aside-label">Before you write</span>
            <ul>
              <li><span className="cx-guide-index">01</span><p>Addressed to <strong>{request.destination.topic}</strong>.</p></li>
              <li><span className="cx-guide-index">02</span><p>Bring <strong>{request.destination.evidence.toLowerCase()}</strong> when relevant.</p></li>
              <li><span className="cx-guide-index">03</span><p>A reference is issued on receipt; quote it when you write again.</p></li>
              <li><span className="cx-guide-index">04</span><p>Leave API keys, recovery phrases and private prompt text out of the note.</p></li>
            </ul>
            <nav className="cx-resources" aria-label="Related support resources">
              <a href="/docs/troubleshooting">API troubleshooting <ArrowUpRight size={13} aria-hidden="true" /></a>
              <a href="/console/billing">Billing history <ArrowUpRight size={13} aria-hidden="true" /></a>
              <a href="/console/support">Track requests <ArrowUpRight size={13} aria-hidden="true" /></a>
              <a href={mailtoFor(request.destination)}>sonnely@symbaiex.com <ArrowUpRight size={13} aria-hidden="true" /></a>
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
