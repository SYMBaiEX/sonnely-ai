// spec/app/support.md, "Story: Open a request"
import { useId, useState, type FormEvent } from "react";
import { Button, Input, Textarea } from "@repo/ui";
import type { Tickets } from "../../../../gen/app__support.ts";
import { useRemote } from "../../remote.ts";
import { useSession } from "../../session.ts";
import { useBillingCluster, WalletControl } from "../console/wallet.tsx";
import styles from "./contact.module.css";

export type ContactTopicId = "workspace" | "billing" | "partnership" | "feedback";

export interface ContactDestination {
  id: ContactTopicId;
  topic: string;
  shortName: string;
  summary: string;
  evidence: string;
  prompt: string;
}

export const contactDestinations: readonly [ContactDestination, ContactDestination, ContactDestination, ContactDestination] = [
  {
    id: "workspace",
    topic: "Workspace support",
    shortName: "Workspace",
    summary: "Sign-in, keys, API errors and model access",
    evidence: "Status code · model ID · approximate time",
    prompt: "What happened, which model, and when?",
  },
  {
    id: "billing",
    topic: "Billing",
    shortName: "Billing",
    summary: "Payments, balances and usage charges",
    evidence: "Payment reference or public transaction signature",
    prompt: "Which payment or charge should we inspect?",
  },
  {
    id: "partnership",
    topic: "Provider partnership",
    shortName: "Providers",
    summary: "Serving inference through Sonnely, routing and integrations",
    evidence: "Models served · privacy tier · capacity · timeline",
    prompt: "What inference capacity or integration are you proposing?",
  },
  {
    id: "feedback",
    topic: "Product feedback",
    shortName: "Feedback",
    summary: "Ideas, gaps and what Sonnely should build next",
    evidence: "Workflow · expected result · current workaround",
    prompt: "What should change, and what are you doing today?",
  },
];

export type ContactSessionState =
  | { kind: "checking" }
  | { kind: "disconnected" }
  | { kind: "ready"; wallet: string };

export type ContactSubmission =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "failed"; message: string }
  | { kind: "sent"; reference: string };

export interface ContactFieldErrors {
  email?: string;
  message?: string;
}

export interface SupportRequestController {
  destination: ContactDestination;
  topicId: ContactTopicId;
  email: string;
  message: string;
  drafts: Record<ContactTopicId, string>;
  fieldErrors: ContactFieldErrors;
  sessionState: ContactSessionState;
  submission: ContactSubmission;
  cluster: "mainnet" | "devnet";
  remoteError?: string;
  chooseTopic: (id: ContactTopicId) => void;
  updateEmail: (value: string) => void;
  updateMessage: (value: string) => void;
  submit: () => Promise<void>;
  signIn: (wallet: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
}

const emptyDrafts: Record<ContactTopicId, string> = { workspace: "", billing: "", partnership: "", feedback: "" };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function recoverable(setSubmission: (value: ContactSubmission) => void) {
  setSubmission({
    kind: "failed",
    message: "We couldn’t send your request. Try again or switch to email. Your draft is still here.",
  });
}

export function useSupportRequest(): SupportRequestController {
  const session = useSession();
  const support = useRemote<Tickets>("support");
  const cluster = useBillingCluster();
  const [topicId, setTopicId] = useState<ContactTopicId>("workspace");
  const [email, setEmail] = useState("");
  const [drafts, setDrafts] = useState<Record<ContactTopicId, string>>(emptyDrafts);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [submission, setSubmission] = useState<ContactSubmission>({ kind: "idle" });
  const destination = contactDestinations.find((item) => item.id === topicId) ?? contactDestinations[0];
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const sessionState: ContactSessionState = wallet
    ? { kind: "ready", wallet }
    : session.state === undefined && !session.error
      ? { kind: "checking" }
      : { kind: "disconnected" };

  function clearRecoverable() {
    if (submission.kind === "failed") setSubmission({ kind: "idle" });
  }

  function chooseTopic(id: ContactTopicId) {
    setTopicId(id);
    setFieldErrors({});
    clearRecoverable();
  }

  function updateEmail(value: string) {
    setEmail(value);
    setFieldErrors((current) => ({ ...current, email: undefined }));
    clearRecoverable();
  }

  function updateMessage(value: string) {
    setDrafts((current) => ({ ...current, [topicId]: value }));
    setFieldErrors((current) => ({ ...current, message: undefined }));
    clearRecoverable();
  }

  async function signIn(signedWallet: string) {
    const state = await session.refresh();
    return state?.tag === "SignedIn" && state.wallet === signedWallet;
  }

  async function signOut() {
    return session.send({ type: "signOut" });
  }

  async function submit() {
    const cleanEmail = email.trim();
    const cleanMessage = drafts[topicId].trim();
    const errors: ContactFieldErrors = {};
    if (!cleanEmail) errors.email = "Enter an email address for replies.";
    else if (cleanEmail.length > 254) errors.email = "Use 254 characters or fewer for the email address.";
    else if (!emailPattern.test(cleanEmail)) errors.email = "Enter a valid email address.";
    if (!cleanMessage) errors.message = "Enter a message for the support team.";
    else if (cleanMessage.length > 3000) errors.message = "Use 3,000 characters or fewer for the message.";
    setFieldErrors(errors);
    if (errors.email || errors.message) return;
    if (!wallet) {
      setSubmission({ kind: "failed", message: "Connect a wallet first, or email sonnely@symbaiex.com instead." });
      return;
    }
    const reference = crypto.randomUUID();
    setSubmission({ kind: "sending" });
    const ok = await support.send({
      type: "open",
      id: reference,
      email: cleanEmail,
      topic: destination.topic,
      message: cleanMessage,
      wallet,
      now: Date.now(),
    });
    if (!ok) {
      recoverable(setSubmission);
      return;
    }
    setDrafts((current) => ({ ...current, [topicId]: "" }));
    setSubmission({ kind: "sent", reference });
  }

  return {
    destination,
    topicId,
    email,
    message: drafts[topicId],
    drafts,
    fieldErrors,
    sessionState,
    submission,
    cluster,
    remoteError: support.error,
    chooseTopic,
    updateEmail,
    updateMessage,
    submit,
    signIn,
    signOut,
  };
}

export function mailtoFor(destination: ContactDestination) {
  return `mailto:sonnely@symbaiex.com?subject=${encodeURIComponent(destination.topic)}`;
}

export function WalletGate({ request }: { request: SupportRequestController }) {
  const wallet = request.sessionState.kind === "ready" ? request.sessionState.wallet : undefined;
  return (
    <div className={styles.wallet}>
      <WalletControl
        wallet={wallet}
        cluster={request.cluster}
        checkingAccount={request.sessionState.kind === "checking"}
        onSignIn={request.signIn}
        onSignOut={request.signOut}
      />
      <p className={styles["wallet-copy"]}>
        {request.sessionState.kind === "ready"
          ? "Your wallet’s public key is included with the request."
          : request.sessionState.kind === "checking"
            ? "Checking whether you’re signed in."
            : "Sign in to send a request. No funds move."}
      </p>
    </div>
  );
}

export function ContactFields({ request, messageRows = 6 }: { request: SupportRequestController; messageRows?: number }) {
  const id = useId();
  const emailErrorId = `${id}-email-error`;
  const messageErrorId = `${id}-message-error`;
  const messageHelpId = `${id}-message-help`;
  return (
    <>
      <label className={styles.field}>
        <span id={`${id}-email-label`}>Email for replies</span>
        <Input
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          value={request.email}
          invalid={Boolean(request.fieldErrors.email)}
          aria-labelledby={`${id}-email-label`}
          aria-describedby={request.fieldErrors.email ? emailErrorId : undefined}
          onChange={(event) => request.updateEmail(event.currentTarget.value)}
        />
        {request.fieldErrors.email && (
          <span role="alert" className={styles["field-error"]} id={emailErrorId}>{request.fieldErrors.email}</span>
        )}
      </label>
      <label className={styles.field}>
        <span id={`${id}-message-label`}>Message</span>
        <Textarea
          name="message"
          rows={messageRows}
          maxLength={3000}
          placeholder={request.destination.prompt}
          value={request.message}
          invalid={Boolean(request.fieldErrors.message)}
          aria-labelledby={`${id}-message-label`}
          aria-describedby={`${messageHelpId}${request.fieldErrors.message ? ` ${messageErrorId}` : ""}`}
          onChange={(event) => request.updateMessage(event.currentTarget.value)}
        />
        <span className={styles.safety} id={messageHelpId}>
          Include: {request.destination.evidence}. Don’t share API keys, wallet recovery phrases, or private prompts.
        </span>
        {request.fieldErrors.message && (
          <span role="alert" className={styles["field-error"]} id={messageErrorId}>{request.fieldErrors.message}</span>
        )}
      </label>
    </>
  );
}

export function SubmitButton({ request, children = "Submit request" }: { request: SupportRequestController; children?: string }) {
  return (
    <Button
      type="submit"
      size="lg"
      loading={request.submission.kind === "sending"}
      disabled={request.sessionState.kind !== "ready"}
      className={styles.submit}
    >
      {request.submission.kind === "sending" ? "Sending…" : children}
    </Button>
  );
}

export function SupportFeedback({ request }: { request: SupportRequestController }) {
  if (request.submission.kind === "failed") {
    return (
      <div role="alert" className={styles.error}>
        <p>{request.submission.message}</p>
        <div className={styles["error-actions"]}>
          <button type="button" className={styles["error-action"]} onClick={() => void request.submit()}>Try again</button>
          <a className={styles["error-action"]} href={mailtoFor(request.destination)}>Email instead</a>
        </div>
      </div>
    );
  }
  if (request.submission.kind === "sent") {
    return (
      <div role="status" className={styles.confirmation}>
        <h3>Request received</h3>
        <p>Save this reference and include it if you follow up.</p>
        <code className={styles.reference}>{request.submission.reference}</code>
      </div>
    );
  }
  if (request.remoteError) {
    return (
      <div role="alert" className={styles.error}>
        <p>{request.remoteError}</p>
        <small>Use “Email us instead” if the form is still unavailable.</small>
      </div>
    );
  }
  return null;
}

export function submitContactForm(event: FormEvent<HTMLFormElement>, request: SupportRequestController) {
  event.preventDefault();
  void request.submit();
}
