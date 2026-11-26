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

export function ContactEditorialPage() {
  const request = useSupportRequest();
  const selectedIndex = contactDestinations.findIndex((item) => item.id === request.topicId) + 1;

  return (
    <div className="wrap cx-page cx-editorial" data-topic={request.topicId}>
      <header className="cx-ed-masthead">
        <p className="cx-ed-kicker">Contact Sonnely</p>
        <h1>A private line to the right desk.</h1>
        <p className="cx-copy">
          Choose the desk, attach your workspace, and write once. Prefer email?{" "}
          <a href={mailtoFor(request.destination)}>sonnely@symbaiex.com</a>
        </p>
      </header>

      <form className="cx-form cx-ed-form" noValidate onSubmit={(event) => submitContactForm(event, request)} aria-labelledby="cx-ed-title">
        <div className="cx-form-head cx-ed-form-head">
          <div>
            <p className="cx-copy-small">Now routing to</p>
            <h2 id="cx-ed-title">{request.destination.name}</h2>
          </div>
          <span className="cx-step">0{selectedIndex} / 04</span>
        </div>
        <WalletGate request={request} compact />
        <ContactFields request={request} messageRows={6} />
        <div className="cx-form-actions">
          <SubmitButton request={request}>Send request</SubmitButton>
          <a className="cx-email-link" href={mailtoFor(request.destination)}>Email instead</a>
        </div>
        <SupportFeedback request={request} />
      </form>

      <div className="cx-ed-index" aria-label="Contact topics">
        {contactDestinations.map((destination, index) => (
          <label className="cx-ed-topic" data-active={request.topicId === destination.id} key={destination.id}>
            <input
              type="radio"
              name="editorial-topic"
              value={destination.id}
              checked={request.topicId === destination.id}
              onChange={() => request.chooseTopic(destination.id)}
            />
            <span className="cx-ed-number" aria-hidden="true">0{index + 1}</span>
            <span className="cx-ed-topic-copy">
              <strong>{destination.name}</strong>
              <small>{destination.summary}</small>
            </span>
          </label>
        ))}
      </div>

      <aside className="cx-ed-margin" aria-label="Selected request guidance">
        <span className="cx-ed-current" aria-hidden="true" key={request.topicId}>0{selectedIndex}</span>
        <div className="cx-ed-marginnote">
          <strong>{request.destination.topic}</strong>
          <p className="cx-copy-small">{request.destination.evidence}. Keep secrets and private prompt text out of the request.</p>
          <nav aria-label="Related support resources">
            <a href="/docs/troubleshooting">API troubleshooting <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href="/console/billing">Billing history <ArrowUpRight size={14} aria-hidden="true" /></a>
          </nav>
        </div>
      </aside>
    </div>
  );
}
