// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { solflarePrivateModeGuide, type ConfidentialPayment } from "../lib/confidential-payment-types.ts";
import { creditBalance, creditDecimal } from "../lib/credit-amount.ts";
import { CopyButton } from "../shared.tsx";
import { request } from "../wallet";
import { EmptyState, Pill, Spinner } from "./ui.tsx";
import styles from "./confidential-payments.module.css";

const reviewRoute = "confidential-payments/review";
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const maxReasonLength = 500;

type PendingReview = ConfidentialPayment & { status: "under_review"; signature: string; submittedAt: number };
type ReviewPage = { payments: PendingReview[]; nextCursor: string | null };
type ReviewAction = "approve" | "reject";

function readQueue(cursor?: string) {
  return request<ReviewPage>(reviewRoute + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""));
}

function receiptMismatch(payment: PendingReview) {
  if (payment.reviewReason === "amount-mismatch")
    return "The received amount differs from the requested amount.";
  if (payment.reviewReason === "asset-mismatch") return "The received asset is different from USDC.";
}

function ReviewForm({
  payment,
  onCancel,
  onReview,
}: {
  payment: PendingReview;
  onCancel: () => void;
  onReview: (action: ReviewAction, reason: string) => Promise<void>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const mismatch = receiptMismatch(payment);
  const [action, setAction] = useState<ReviewAction>(mismatch ? "reject" : "approve");
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const approving = action === "approve";
  const amount = creditDecimal(payment.amount, 2);
  const headingId = `review-${payment.reference}`;

  useEffect(() => heading.current?.focus(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || (approving ? mismatch || !confirmed : !reason.trim())) return;
    setSaving(true);
    setError("");
    try {
      await onReview(action, reason.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.reviewForm} aria-labelledby={headingId} onSubmit={(event) => void submit(event)}>
      <h4 id={headingId} ref={heading} tabIndex={-1}>
        Review {amount} USDC payment
      </h4>
      <fieldset className={styles.decision} disabled={saving}>
        <legend>Decision</legend>
        <label>
          <input
            type="radio"
            name="decision"
            checked={approving}
            disabled={Boolean(mismatch)}
            onChange={() => setAction("approve")}
          />
          Approve and credit
        </label>
        <label>
          <input
            type="radio"
            name="decision"
            checked={!approving}
            onChange={() => {
              setConfirmed(false);
              setAction("reject");
            }}
          />
          Reject payment
        </label>
      </fieldset>
      {approving && (
        <label className={styles.confirmation}>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={saving}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I matched this finalized transaction signature in the treasury’s Solflare Private Mode activity
            and verified that it received exactly <strong>{amount} USDC</strong> from the listed payer.
          </span>
        </label>
      )}
      {!approving && (
        <label className={styles.reason}>
          Rejection reason
          <textarea
            value={reason}
            rows={2}
            maxLength={maxReasonLength}
            disabled={saving}
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saving && <Spinner label="Saving review…" />}
      <div className="actions">
        <button type="button" className="button quiet" disabled={saving} onClick={onCancel}>
          Cancel review
        </button>
        <button
          type="submit"
          className={approving ? "button accent" : "button danger"}
          disabled={saving || (approving ? Boolean(mismatch) || !confirmed : !reason.trim())}
        >
          {approving ? `Credit ${creditBalance(payment.amount)}` : "Reject payment"}
        </button>
      </div>
    </form>
  );
}

function PaymentReview({
  payment,
  active,
  disabled,
  onSelect,
  onReview,
}: {
  payment: PendingReview;
  active: boolean;
  disabled: boolean;
  onSelect: (reference?: string) => void;
  onReview: (payment: PendingReview, action: ReviewAction, reason: string) => Promise<void>;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const mismatch = receiptMismatch(payment);
  return (
    <article className={styles.payment}>
      <div className={styles.paymentHeader}>
        <div>
          <h3>{creditDecimal(payment.amount, 2)} USDC</h3>
          <p className="caption">
            Submitted{" "}
            <time dateTime={new Date(payment.submittedAt).toISOString()}>
              {dateFormat.format(payment.submittedAt)}
            </time>
          </p>
        </div>
        <Pill tone="ok">Finalized on Solana</Pill>
      </div>
      <dl className={styles.addresses}>
        <div>
          <dt>Payer</dt>
          <dd>
            <code>{payment.payer}</code>
          </dd>
        </div>
        <div>
          <dt>Treasury</dt>
          <dd>
            <code>{payment.treasury}</code>
          </dd>
        </div>
        <div>
          <dt>Order reference</dt>
          <dd>
            <code>{payment.reference}</code>
          </dd>
        </div>
        {payment.slot !== undefined && (
          <div>
            <dt>Slot</dt>
            <dd>
              <code>{payment.slot}</code>
            </dd>
          </div>
        )}
      </dl>
      {mismatch && <p className="caption">{mismatch}</p>}
      <div className="actions">
        <a
          className="text-link"
          href={`https://explorer.solana.com/tx/${payment.signature}`}
          target="_blank"
          rel="noreferrer"
        >
          Solana Explorer ↗
        </a>
        <CopyButton value={payment.signature} label="Copy signature" />
        {!active && (
          <button
            type="button"
            className="button quiet small"
            ref={trigger}
            disabled={disabled}
            onClick={() => onSelect(payment.reference)}
          >
            Review payment
          </button>
        )}
      </div>
      {active && (
        <ReviewForm
          payment={payment}
          onCancel={() => {
            onSelect();
            requestAnimationFrame(() => trigger.current?.focus());
          }}
          onReview={(action, reason) => onReview(payment, action, reason)}
        />
      )}
    </article>
  );
}

export function AdminConfidentialPayments() {
  const heading = useRef<HTMLHeadingElement>(null);
  const [queue, setQueue] = useState<ReviewPage>();
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState<string>();
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let current = true;
    void readQueue()
      .then((result) => {
        if (current) setQueue(result);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "The review queue is unavailable.");
      })
      .finally(() => {
        if (current) setFetching(false);
      });
    return () => {
      current = false;
    };
  }, [revision]);

  function refresh() {
    setFetching(true);
    setError("");
    setRevision((current) => current + 1);
  }

  async function loadMore() {
    if (fetching || !queue?.nextCursor) return;
    setFetching(true);
    setError("");
    try {
      const result = await readQueue(queue.nextCursor);
      setQueue((current) => ({
        payments: [
          ...(current?.payments ?? []),
          ...result.payments.filter(
            (row) => !current?.payments.some((item) => item.reference === row.reference),
          ),
        ],
        nextCursor: result.nextCursor,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More payments could not be loaded.");
    } finally {
      setFetching(false);
    }
  }

  async function review(payment: PendingReview, action: ReviewAction, reason: string) {
    const result = await request<ConfidentialPayment>(
      reviewRoute,
      action === "approve"
        ? { reference: payment.reference, action, confirmedReceipt: true }
        : { reference: payment.reference, action, reason },
    );
    if (
      result.reference !== payment.reference ||
      result.signature !== payment.signature ||
      result.status !== (action === "approve" ? "credited" : "rejected")
    ) {
      throw new Error("The server did not confirm this decision. Refresh the queue to check its status.");
    }
    setStatus(action === "approve" ? `${creditBalance(payment.amount)} credited.` : "Payment rejected.");
    setActive(undefined);
    setQueue(
      (current) =>
        current && {
          ...current,
          payments: current.payments.filter((row) => row.reference !== payment.reference),
        },
    );
    heading.current?.focus();
    refresh();
  }

  return (
    <section className="panel stack-panel" aria-labelledby="confidential-payments-heading">
      <div className={styles.paymentHeader}>
        <div>
          <h2 id="confidential-payments-heading" ref={heading} tabIndex={-1}>
            Confidential payment reviews
          </h2>
          <p className="caption">
            Verify the received asset and amount in the treasury wallet before crediting a customer.
          </p>
        </div>
        <button
          type="button"
          className="button quiet small"
          disabled={fetching || Boolean(active)}
          onClick={refresh}
        >
          Refresh reviews
        </button>
      </div>
      <a className="text-link" href={solflarePrivateModeGuide} target="_blank" rel="noreferrer">
        Treasury Solflare Private Mode guide ↗
      </a>
      <p className={status ? "status" : "visually-hidden"} role="status">
        {status}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {fetching && <Spinner label="Loading payment reviews…" />}
      {queue?.payments.map((payment) => (
        <PaymentReview
          key={payment.reference}
          payment={payment}
          active={active === payment.reference}
          disabled={fetching || Boolean(active)}
          onSelect={setActive}
          onReview={review}
        />
      ))}
      {queue?.nextCursor && (
        <div className="actions">
          <button
            type="button"
            className="button quiet"
            disabled={fetching || Boolean(active)}
            onClick={() => void loadMore()}
          >
            Load more payments
          </button>
        </div>
      )}
      {queue && !queue.payments.length && !fetching && !error && (
        <EmptyState
          title="No payments awaiting review"
          hint="Confidential USDC deposits that need manual verification appear here. Review means checking the received asset and amount in the treasury wallet, then approving or rejecting the credit."
        />
      )}
    </section>
  );
}
