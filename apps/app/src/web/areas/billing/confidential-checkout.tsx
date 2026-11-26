/* eslint-disable better-tailwindcss/no-unknown-classes, max-lines-per-function -- this checkout intentionally uses the migrated billing class names and preserves its review workflow */
// spec/app/billing/deposits.md, "Story: Open a payment intent"
import { ArrowUpRight } from "lucide-react";
import { Input } from "@repo/ui";
import { useRef, useState, type FormEvent } from "react";
import {
  confidentialPaymentStatus,
  isPast,
  creditBalance,
  creditDecimal,
  focusHeading,
  CopyButton,
  parseCreditAmount,
  shorten,
  solflarePrivateModeGuide,
  type ConfidentialPayment,
} from "./shared.tsx";

function paymentError(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed. Try again.";
}

export function ConfidentialCheckout({
  order,
  available,
  loading,
  lookupError,
  retry,
  amount,
  changeAmount,
  onOrder,
  createOrder,
  submitOrder,
  cancelOrder,
  refreshOrder,
}: {
  order: ConfidentialPayment | null;
  available: boolean;
  loading: boolean;
  lookupError: string;
  retry: () => void;
  amount: string;
  changeAmount: (amount: string) => void;
  onOrder: (order: ConfidentialPayment | null) => void;
  createOrder: (amount: string) => ConfidentialPayment | Promise<ConfidentialPayment>;
  submitOrder: (reference: string, signature: string) => ConfidentialPayment | Promise<ConfidentialPayment>;
  cancelOrder: (reference: string) => ConfidentialPayment | Promise<ConfidentialPayment>;
  refreshOrder: (reference: string) => ConfidentialPayment | Promise<ConfidentialPayment>;
}) {
  const amountInputRef = useRef<HTMLInputElement>(null);
  const [signature, setSignature] = useState("");
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState<"start" | "submit" | "cancel" | "status">();
  const [status, setStatus] = useState("");
  const [cancel, setCancel] = useState(false);
  const expired = Boolean(order?.expiresAt && isPast(order.expiresAt));
  const orderStatus = order?.status;

  function receive(updated: ConfidentialPayment) {
    onOrder(updated);
    setSignature("");
    setCancel(false);
    if (updated.status === "credited") setStatus(`${creditBalance(updated.amount)} in compute credits added.`);
    else if (updated.status === "under_review") setStatus("Payment received for review.");
    else if (updated.status === "cancelled") setStatus("Payment request cancelled.");
  }

  async function run(action: NonNullable<typeof pending>, callback: () => Promise<void>) {
    setPending(action);
    setFailure("");
    setStatus("");
    try {
      await callback();
    } catch (error) {
      setFailure(paymentError(error));
    } finally {
      setPending(undefined);
    }
  }

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("start", async () => {
      if (parseCreditAmount(amount) === null) throw new Error("Enter a positive USDC amount with up to six decimal places.");
      receive(await createOrder(amount));
    });
  }

  const canSend = orderStatus === "awaiting_payment" && !expired;
  const canSubmit = orderStatus === "awaiting_payment" || orderStatus === "expired" || orderStatus === "cancelled";

  return (
    <>
      <p className="caption">
        Pay with Solflare’s Private Mode on Solana. Credits post after receipt verification. The amount and asset are
        hidden on-chain, while wallet addresses stay visible.
      </p>
      {lookupError && (
        <div className="stack-panel">
          <p className="error" role="alert">
            {lookupError}
          </p>
          <button type="button" className="button quiet" onClick={retry}>
            Retry payment status
          </button>
        </div>
      )}
      <p role="status" className={status ? "status" : "visually-hidden"}>
        {status}
      </p>
      {failure && (
        <p className="error" role="alert">
          {failure}
        </p>
      )}
      {loading && !order && (
        <p role="status" className="caption">
          Loading confidential payments…
        </p>
      )}
      {!order && !loading && !lookupError && (
        <>
          {!available && <p className="caption">Confidential USDC checkout is unavailable for this account.</p>}
          <form className="inline-form" onSubmit={start}>
            <label>
              Amount in USDC
              <Input
                ref={amountInputRef}
                type="number"
                min="0.000001"
                step="0.000001"
                inputMode="decimal"
                value={amount}
                required
                disabled={!available || Boolean(pending)}
                onChange={(event) => changeAmount(event.target.value)}
              />
            </label>
            <button className="button accent" disabled={!available || Boolean(pending)}>
              {pending === "start" ? "Preparing…" : "Get payment details"}
            </button>
          </form>
        </>
      )}
      {order && (
        <section className="checkout confidential-checkout" aria-labelledby="confidential-payment-heading">
          <div className="between">
            <h3 id="confidential-payment-heading" ref={focusHeading} tabIndex={-1}>
              {creditDecimal(order.amount, 2)} USDC
            </h3>
            <span className="pill">{confidentialPaymentStatus(order)}</span>
          </div>
          {canSend ? (
            <>
              <dl className="confidential-payment-details">
                <div>
                  <dt>Sonnely treasury</dt>
                  <dd>
                    <code>{order.treasury}</code>
                    <CopyButton value={order.treasury} label="Copy treasury address" />
                  </dd>
                </div>
                <div>
                  <dt>Amount to receive</dt>
                  <dd>
                    {creditDecimal(order.amount, 2)} USDC
                    <CopyButton value={creditDecimal(order.amount)} label="Copy USDC amount" />
                  </dd>
                </div>
              </dl>
              <p className="caption">
                In Solflare, switch to wallet <strong>{shorten(order.payer)}</strong>, then open
                <strong> Private Mode → Send</strong>. Enter the treasury address and amount, and confirm Solflare
                labels the transfer <strong>Private</strong>. Wallet fees are shown in Solflare.
              </p>
              <p className="caption">
                Pay before{" "}
                {new Date(order.expiresAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
                .
              </p>
              <a className="text-link" href={solflarePrivateModeGuide} target="_blank" rel="noreferrer">
                Solflare payment guide <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </>
          ) : null}
          {canSubmit && (
            <>
              {!canSend && (
                <p className="caption">Already paid while this request was open? You can still submit the signature.</p>
              )}
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("submit", async () => receive(await submitOrder(order.reference, signature.trim())));
                }}
              >
                <label>
                  Transaction signature
                  <Input
                    value={signature}
                    autoComplete="off"
                    spellCheck={false}
                    minLength={64}
                    maxLength={88}
                    required
                    onChange={(event) => setSignature(event.target.value)}
                  />
                </label>
                <button className="button accent" disabled={Boolean(pending)}>
                  {pending === "submit" ? "Checking…" : "Verify payment"}
                </button>
              </form>
            </>
          )}
          {orderStatus === "under_review" && (
            <p className="caption">
              Your transaction has finalized on Solana. Your credits will appear once Sonnely verifies the private
              receipt.
            </p>
          )}
          {orderStatus === "credited" && <p className="caption">{creditBalance(order.amount)} in compute credits added.</p>}
          {orderStatus === "rejected" && (
            <p className="caption">
              {order.reason}{" "}
              <a className="text-link" href="/console/support">
                Contact support
              </a>
            </p>
          )}
          <div className="confidential-payment-actions">
            {order.signature && (
              <a className="text-link" href={`https://explorer.solana.com/tx/${order.signature}`}>
                View transaction <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
            {orderStatus === "under_review" && (
              <button
                type="button"
                className="button quiet"
                disabled={Boolean(pending)}
                onClick={() =>
                  void run("status", async () => receive(await refreshOrder(order.reference)))
                }
              >
                {pending === "status" ? "Checking…" : "Refresh status"}
              </button>
            )}
            {canSend && !cancel && (
              <button type="button" className="text-link" disabled={Boolean(pending)} onClick={() => setCancel(true)}>
                Cancel request
              </button>
            )}
            {!canSend && available && (
              <button
                type="button"
                className="button quiet"
                disabled={Boolean(pending)}
                onClick={() => {
                  onOrder(null);
                  amountInputRef.current?.focus();
                }}
              >
                New payment
              </button>
            )}
          </div>
          {canSend && cancel && (
            <div className="confidential-payment-actions">
              <p className="caption">You can still submit a transfer sent before you cancel.</p>
              <button type="button" className="button quiet" disabled={Boolean(pending)} onClick={() => setCancel(false)}>
                Keep request
              </button>
              <button
                type="button"
                className="button danger"
                disabled={Boolean(pending)}
                onClick={() => void run("cancel", async () => receive(await cancelOrder(order.reference)))}
              >
                {pending === "cancel" ? "Cancelling…" : "Cancel payment request"}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
