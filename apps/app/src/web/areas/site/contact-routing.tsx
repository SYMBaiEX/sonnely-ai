// spec/app/support.md, "Story: Open a request"
import { ArrowRight, ArrowUpRight, LifeBuoy, ReceiptText, Mail } from "lucide-react";
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

export function ContactRoutingPage() {
  const request = useSupportRequest();

  return (
    <div className="wrap cx-page cx-routing" data-topic={request.topicId}>
      <header className="cx-rd-head">
        <div className="cx-rd-title">
          <p className="cx-rd-status"><i className="cx-rd-live" aria-hidden="true" /> Routing desk online</p>
          <h1>Put the request on the right route.</h1>
          <p className="cx-copy">Choose a destination once. Sonnely carries the workspace, message and reference through the same support lane.</p>
        </div>
        <a className="cx-rd-stamp" href={mailtoFor(request.destination)}>Fallback<br />sonnely@symbaiex.com</a>
      </header>

      <div className="cx-rd-board">
        <section className="cx-rd-panel" aria-labelledby="cx-rd-destinations-title">
          <header>
            <h2 id="cx-rd-destinations-title">Destination</h2>
            <span className="cx-rd-count">04 lanes</span>
          </header>
          <fieldset className="cx-rd-destinations">
            <legend className="cx-visually-hidden">Choose a support destination</legend>
            {contactDestinations.map((destination) => {
              const Icon = destination.Icon;
              const hasDraft = Boolean(request.drafts[destination.id].trim());
              return (
                <label className="cx-rd-destination" data-active={request.topicId === destination.id} key={destination.id}>
                  <input
                    type="radio"
                    name="routing-topic"
                    value={destination.id}
                    checked={request.topicId === destination.id}
                    onChange={() => request.chooseTopic(destination.id)}
                  />
                  <Icon size={18} aria-hidden="true" />
                  <span>
                    <strong>{destination.name}</strong>
                    <small>{destination.summary}</small>
                  </span>
                  {hasDraft && <em>Draft</em>}
                </label>
              );
            })}
          </fieldset>
        </section>

        <section className="cx-rd-panel cx-rd-desk" aria-labelledby="cx-rd-title">
          <div className="cx-rd-route" aria-label={"Route to " + request.destination.topic}>
            <span>{request.destination.route[0]}</span>
            <ArrowRight size={13} aria-hidden="true" />
            <span>{request.destination.route[1]}</span>
            <ArrowRight size={13} aria-hidden="true" />
            <span>{request.destination.route[2]}</span>
            <i className="cx-rd-pulse" key={request.topicId} aria-hidden="true" />
          </div>
          <div className="cx-rd-context">
            <div>
              <span>Carry in the message</span>
              <strong>{request.destination.evidence}</strong>
            </div>
            <div>
              <span>While switching desks</span>
              <strong>Drafts stay in place</strong>
            </div>
          </div>

          <form className="cx-form" noValidate onSubmit={(event) => submitContactForm(event, request)}>
            <div className="cx-form-head">
              <h2 id="cx-rd-title">{request.destination.topic}</h2>
              <span className="cx-step">Route check</span>
            </div>
            <WalletGate request={request} compact />
            <ContactFields request={request} messageRows={5} />
            <div className="cx-form-actions">
              <SubmitButton request={request}>Route request</SubmitButton>
              <a className="cx-email-link" href={mailtoFor(request.destination)}>Email this desk</a>
            </div>
            <SupportFeedback request={request} />
          </form>
        </section>

        <nav className="cx-rd-panel cx-rd-lanes" aria-label="Fast lanes">
          <a href="/docs/troubleshooting">
            <LifeBuoy size={18} aria-hidden="true" />
            <span><strong>API trouble</strong><small>Troubleshooting guide</small></span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <a href="/console/billing">
            <ReceiptText size={18} aria-hidden="true" />
            <span><strong>Payment question</strong><small>Billing history</small></span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <a href={mailtoFor(request.destination)}>
            <Mail size={18} aria-hidden="true" />
            <span><strong>Cannot sign in</strong><small>Email support</small></span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
      </div>
    </div>
  );
}
