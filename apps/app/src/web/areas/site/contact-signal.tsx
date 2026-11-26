// spec/app/support.md, "Story: Open a request"
import { ArrowUpRight, Mail } from "lucide-react";
import {
  ContactFields,
  SubmitButton,
  SupportFeedback,
  WalletGate,
  contactDestinations,
  mailtoFor,
  submitContactForm,
  useSupportRequest,
  type ContactTopicId,
} from "./contact-shared.tsx";

const beams: Record<ContactTopicId, { d: string; x: number; y: number }> = {
  workspace: { d: "M 204 522 C 405 520 588 242 910 176", x: 910, y: 176 },
  billing: { d: "M 204 522 C 438 522 674 386 948 380", x: 948, y: 380 },
  partnership: { d: "M 204 522 C 430 528 654 574 916 560", x: 916, y: 560 },
  feedback: { d: "M 204 522 C 360 468 574 662 862 666", x: 862, y: 666 },
};

export function ContactSignalPage() {
  const request = useSupportRequest();
  const beam = beams[request.topicId];

  return (
    <div className="wrap cx-page cx-signal" data-topic={request.topicId}>
      <div className="cx-si-composition">
        <header className="cx-si-copy">
          <p className="cx-si-kicker">Contact / signal</p>
          <h1>One signal finds its desk.</h1>
          <p className="cx-copy">The path redraws as the destination changes. Your draft stays in the panel while you aim it.</p>
        </header>

        <svg className="cx-si-map" viewBox="0 0 1120 700" data-active={request.topicId} aria-hidden="true">
          <g className="cx-si-grid">
            <path d="M 110 120 H 1050" />
            <path d="M 110 270 H 1050" />
            <path d="M 110 420 H 1050" />
            <path d="M 110 570 H 1050" />
            <path d="M 260 70 V 650" />
            <path d="M 520 70 V 650" />
            <path d="M 780 70 V 650" />
            <path d="M 1040 70 V 650" />
          </g>
          <g className="cx-si-rings">
            <circle cx="204" cy="522" r="74" />
            <circle cx="204" cy="522" r="148" />
            <circle cx="204" cy="522" r="236" />
          </g>
          {Object.values(beams).map((path) => (
            <path className="cx-si-faintbeam" d={path.d} key={path.d} />
          ))}
          <path className="cx-si-beam" d={beam.d} />
          <path className="cx-si-pulsebeam" d={beam.d} pathLength={100} key={request.topicId} />
          <g className="cx-si-origin">
            <circle cx="204" cy="522" r="11" />
            <circle cx="204" cy="522" r="25" />
            <text x="176" y="574">YOU</text>
          </g>
          {contactDestinations.map((destination) => {
            const point = beams[destination.id];
            return (
              <g className="cx-si-node" data-active={request.topicId === destination.id} key={destination.id}>
                <circle cx={point.x} cy={point.y} r="10" />
                <circle cx={point.x} cy={point.y} r="24" />
                <text x={point.x - 30} y={point.y - 36}>{destination.shortName.toUpperCase()}</text>
              </g>
            );
          })}
        </svg>

        <form className="cx-form cx-si-form" noValidate onSubmit={(event) => submitContactForm(event, request)} aria-labelledby="cx-si-title">
          <div className="cx-form-head">
            <div>
              <p className="cx-copy-small">Destination locked</p>
              <h2 id="cx-si-title">{request.destination.name}</h2>
            </div>
            <span className="cx-step">Live route</span>
          </div>
          <fieldset className="cx-si-topiclist">
            <legend className="cx-visually-hidden">Choose a destination</legend>
            {contactDestinations.map((destination) => (
              <label data-active={request.topicId === destination.id} key={destination.id}>
                <input
                  type="radio"
                  name="signal-topic"
                  value={destination.id}
                  checked={request.topicId === destination.id}
                  onChange={() => request.chooseTopic(destination.id)}
                />
                <span>{destination.shortName}</span>
                <small>{destination.summary}</small>
              </label>
            ))}
          </fieldset>
          <WalletGate request={request} compact />
          <ContactFields request={request} messageRows={4} />
          <div className="cx-form-actions">
            <SubmitButton request={request}>Transmit request</SubmitButton>
            <a className="cx-email-link" href={mailtoFor(request.destination)}>Email instead</a>
          </div>
          <SupportFeedback request={request} />
        </form>

        <div className="cx-si-fallback">
          <Mail size={16} aria-hidden="true" />
          <p><strong>No wallet?</strong> Email <a href={mailtoFor(request.destination)}>sonnely@symbaiex.com</a> and include the same details.</p>
          <a href="/docs/troubleshooting" aria-label="API troubleshooting"><ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </div>
    </div>
  );
}
