// spec/app/support.md, "Story: Open a request"
import { useId, useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Code2, CreditCard, MessageSquare, Send } from "lucide-react";
import { Button, Input, Textarea } from "@repo/ui";
import type { Tickets } from "../../../../gen/app__support.ts";
import { useRemote } from "../../remote.ts";
import { useSession } from "../../session.ts";
import { useBillingCluster, WalletControl } from "../console/wallet.tsx";

export type ContactTopicId = "workspace" | "billing" | "partnership" | "feedback";

export interface ContactDestination {
  id: ContactTopicId;
  topic: string;
  name: string;
  shortName: string;
  summary: string;
  evidence: string;
  prompt: string;
  route: readonly [string, string, string];
  Icon: LucideIcon;
}

export const contactDestinations: readonly [ContactDestination, ContactDestination, ContactDestination, ContactDestination] = [
  {
    id: "workspace",
    topic: "Workspace support",
    name: "Workspace & API",
    shortName: "Workspace",
    summary: "Sign-in, keys, API errors and model access",
    evidence: "Status code · model ID · approximate time",
    prompt: "What happened, which model, and when?",
    route: ["You", "Gateway", "Workspace support"],
    Icon: Code2,
  },
  {
    id: "billing",
    topic: "Billing",
    name: "Billing & credits",
    shortName: "Billing",
    summary: "Payments, balances and usage charges",
    evidence: "Payment reference or public transaction signature",
    prompt: "Which payment or charge should we inspect?",
    route: ["You", "Ledger", "Billing"],
    Icon: CreditCard,
  },
  {
    id: "partnership",
    topic: "Infrastructure partnership",
    name: "Infrastructure partnerships",
    shortName: "Partnerships",
    summary: "Confidential compute, routing and integrations",
    evidence: "Region · capacity · hardware · timeline",
    prompt: "What infrastructure or integration are you proposing?",
    route: ["You", "Routing desk", "Partnerships"],
    Icon: Send,
  },
  {
    id: "feedback",
    topic: "Product feedback",
    name: "Product feedback",
    shortName: "Feedback",
    summary: "Ideas, gaps and what Sonnely should build next",
    evidence: "Workflow · expected result · current workaround",
    prompt: "What should change, and what are you doing today?",
    route: ["You", "Product", "Feedback"],
    Icon: MessageSquare,
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
    message: "The request could not be sent. Your draft is still here; check the connection and try again.",
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
    if (!cleanEmail) errors.email = "Enter the email we should answer.";
    else if (!emailPattern.test(cleanEmail)) errors.email = "Enter a valid email address.";
    if (!cleanMessage) errors.message = "Write a few details so the team can act.";
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

export function WalletGate({ request, compact = false }: { request: SupportRequestController; compact?: boolean }) {
  const wallet = request.sessionState.kind === "ready" ? request.sessionState.wallet : undefined;
  return (
    <div className={compact ? "cx-wallet cx-wallet-compact" : "cx-wallet"}>
      <WalletControl
        wallet={wallet}
        cluster={request.cluster}
        checkingAccount={request.sessionState.kind === "checking"}
        onSignIn={request.signIn}
        onSignOut={request.signOut}
      />
      <div className="cx-wallet-copy">
        <span>
          {request.sessionState.kind === "ready"
            ? "Workspace attached"
            : request.sessionState.kind === "checking"
              ? "Checking workspace"
              : "Connect a wallet"}
        </span>
        <small>
          {request.sessionState.kind === "ready"
            ? "Your public key travels with the request"
            : request.sessionState.kind === "checking"
              ? "Restoring the current workspace session"
              : "Attach your workspace, or use the email fallback"}
        </small>
      </div>
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
      <label className="cx-field">
        <span>Email</span>
        <Input
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          value={request.email}
          invalid={Boolean(request.fieldErrors.email)}
          aria-describedby={request.fieldErrors.email ? emailErrorId : undefined}
          onChange={(event) => request.updateEmail(event.currentTarget.value)}
        />
        {request.fieldErrors.email && (
          <span role="alert" className="cx-field-error" id={emailErrorId}>{request.fieldErrors.email}</span>
        )}
      </label>
      <label className="cx-field cx-message-field">
        <span>Message</span>
        <Textarea
          name="message"
          rows={messageRows}
          maxLength={3000}
          placeholder={request.destination.prompt}
          value={request.message}
          invalid={Boolean(request.fieldErrors.message)}
          aria-describedby={`${messageHelpId}${request.fieldErrors.message ? ` ${messageErrorId}` : ""}`}
          onChange={(event) => request.updateMessage(event.currentTarget.value)}
        />
        <span className="cx-safety" id={messageHelpId}>
          {request.destination.evidence}. Keep API keys, wallet recovery phrases and private prompt text out of the request.
        </span>
        {request.fieldErrors.message && (
          <span role="alert" className="cx-field-error" id={messageErrorId}>{request.fieldErrors.message}</span>
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
      className="cx-submit"
    >
      {request.submission.kind === "sending" ? "Sending…" : children}
    </Button>
  );
}

export function SupportFeedback({ request }: { request: SupportRequestController }) {
  if (request.submission.kind === "failed") {
    return (
      <div role="alert" className="cx-error">
        <p>{request.submission.message}</p>
        <small>Nothing was lost. The message above is still editable.</small>
        <div className="cx-error-actions">
          <button type="button" onClick={() => void request.submit()}>Try again</button>
          <a href={mailtoFor(request.destination)}>Email instead</a>
        </div>
      </div>
    );
  }
  if (request.submission.kind === "sent") {
    return (
      <div role="status" className="cx-confirmation">
        <h3>Request received</h3>
        <p>Save this reference. The team can use it to find the thread when you write again.</p>
        <code className="cx-reference">{request.submission.reference}</code>
      </div>
    );
  }
  if (request.remoteError) {
    return (
      <div role="alert" className="cx-error">
        <p>{request.remoteError}</p>
        <small>Use the email fallback if the support channel stays unavailable.</small>
      </div>
    );
  }
  return null;
}

export function submitContactForm(event: FormEvent<HTMLFormElement>, request: SupportRequestController) {
  event.preventDefault();
  void request.submit();
}
