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

export function ContactCorrespondencePage({ canonical = false }: { canonical?: boolean }) {
  const request = useSupportRequest();

  return (
    <div className={canonical ? "wrap cx-page cx-correspondence cx-correspondence-canonical" : "wrap cx-page cx-correspondence"} data-topic={request.topicId}>
      <header className="cx-co-intro">
        <span>{canonical ? "Sonnely support correspondence" : "Correspondence with Sonnely"}</span>
        <h1>{canonical ? "Write once. Reach the right desk." : "Write to us. A person will write back."}</h1>
        <p className="cx-copy">
          {canonical
            ? "Choose the desk, attach your workspace and include the evidence that lets the first reply act."
            : "A quieter support room for careful questions, edge cases and partnership notes."}
        </p>
        <a href={mailtoFor(request.destination)}>sonnely@symbaiex.com</a>
      </header>

      <div className="cx-co-desk">
        <aside className="cx-co-postcard" aria-label="Before writing">
          <span>Before you write</span>
          <ul>
            <li><span>01</span><p>Addressed to <strong>{request.destination.topic}</strong>.</p></li>
            <li><span>02</span><p>Bring <strong>{request.destination.evidence.toLowerCase()}</strong> when relevant.</p></li>
            <li><span>03</span><p>A reference is issued on receipt; quote it when you write again.</p></li>
            <li><span>04</span><p>Leave API keys, recovery phrases and private prompt text out of the note.</p></li>
          </ul>
          <nav aria-label="Related support resources">
            <a href="/docs/troubleshooting">API troubleshooting <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href="/console/billing">Billing history <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href="/console/support">Track requests <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href={mailtoFor(request.destination)}>Email without signing in <ArrowUpRight size={14} aria-hidden="true" /></a>
          </nav>
        </aside>

        <form className="cx-form cx-co-letter" noValidate onSubmit={(event) => submitContactForm(event, request)} aria-labelledby="cx-co-title">
          <div className="cx-co-letterhead">
            <span>Sonnely support</span>
            <span>{request.destination.topic}</span>
          </div>
          <div className="cx-co-body">
            <fieldset className="cx-co-topics">
              <legend>Send this note to</legend>
              {contactDestinations.map((destination) => (
                <label className="cx-co-topic" data-active={request.topicId === destination.id} key={destination.id}>
                  <input
                    type="radio"
                    name="correspondence-topic"
                    value={destination.id}
                    checked={request.topicId === destination.id}
                    onChange={() => request.chooseTopic(destination.id)}
                  />
                  <span>{destination.shortName}</span>
                  {canonical && <small>{destination.summary}</small>}
                </label>
              ))}
            </fieldset>

            <div className="cx-co-writer">
              <h2 id="cx-co-title">Dear Sonnely,</h2>
              <WalletGate request={request} compact />
            </div>

            <ContactFields request={request} messageRows={7} />

            <div className="cx-form-actions cx-co-actions">
              <SubmitButton request={request}>Send the note</SubmitButton>
              <a className="cx-email-link" href={mailtoFor(request.destination)}>Write by email</a>
            </div>
            <SupportFeedback request={request} />
          </div>
        </form>
      </div>
    </div>
  );
}
