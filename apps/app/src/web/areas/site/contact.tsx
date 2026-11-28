// spec/app/support.md, "Story: Open a request"
import { ArrowUpRight } from "lucide-react";
import { Input } from "@repo/ui";
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
import styles from "./contact.module.css";

export function ContactPage() {
  const request = useSupportRequest();

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Contact Sonnely</h1>
        <p className={styles.lede}>
          Get help with your workspace or billing, become a provider, or share feedback.
        </p>
      </header>

      <form className={styles.form} noValidate onSubmit={(event) => submitContactForm(event, request)} aria-labelledby="cx-message-title">
        <div className={styles.routing}>
          <fieldset className={styles.topics} aria-describedby="cx-desk-summary">
            <legend>Choose a desk</legend>
            <div className={styles["topic-grid"]}>
              {contactDestinations.map((destination) => (
                <label className={styles.topic} data-active={request.topicId === destination.id} key={destination.id}>
                  <Input
                    type="radio"
                    name="correspondence-topic"
                    value={destination.id}
                    checked={request.topicId === destination.id}
                    onChange={() => request.chooseTopic(destination.id)}
                  />
                  <span className={styles["topic-icon"]} aria-hidden="true">
                    <destination.Icon size={16} />
                  </span>
                  <span>{destination.shortName}</span>
                </label>
              ))}
            </div>
            <p className={styles["desk-summary"]} id="cx-desk-summary">
              <strong>{request.destination.name}</strong>
              <span>{request.destination.summary}.</span>
            </p>
          </fieldset>
          <p className={styles["email-fallback"]}>
            No wallet? <a className={styles["email-link"]} href={mailtoFor(request.destination)}>Email us instead <ArrowUpRight size={14} aria-hidden="true" /></a>
          </p>
        </div>

        <div className={styles.compose}>
          <h2 id="cx-message-title">Write your message</h2>
          <WalletGate request={request} />

          <ContactFields request={request} messageRows={4} />

          <div className={styles["form-actions"]}>
            <SubmitButton request={request}>Send request</SubmitButton>
            <p>Save the reference you receive to follow up.</p>
          </div>
          <SupportFeedback request={request} />
        </div>
      </form>

      <aside className={styles.aside} aria-labelledby="cx-resources-title">
        <h2 id="cx-resources-title">Support resources</h2>
        <nav className={styles.resources} aria-labelledby="cx-resources-title">
          <a href="/docs/troubleshooting">API troubleshooting <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="/console/billing">Billing history <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="/console/support">Track requests <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href={mailtoFor(request.destination)}>sonnely@symbaiex.com <ArrowUpRight size={15} aria-hidden="true" /></a>
        </nav>
      </aside>
    </div>
  );
}
