/* eslint-disable better-tailwindcss/no-unknown-classes, max-lines-per-function -- this area intentionally uses the migrated billing class names and keeps its payment workflow together */
// spec/app/billing/deposits.md, "Story: Open a payment intent"
import { ArrowUpRight, Wallet } from "lucide-react";
import QRCode from "qrcode";
import { Suspense, use, useState, type ReactNode } from "react";
import { z } from "zod";
import {
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  isTransactionSendingSigner,
} from "@solana/kit";
import { getAddress } from "ethers";
import { Input } from "@repo/ui";
import type { Deposits, Intent } from "../../../../gen/app__billing__deposits.ts";
import type { Ledger } from "../../../../gen/app__billing__ledger.ts";
import type { Page } from "../../../../gen/app__nav.ts";
import { useRemote } from "../../remote.ts";
import { ConsoleFrame, useWorkspaceSession } from "../console/frame.tsx";
import { solanaWalletClients } from "../console/solana-wallet.ts";
import { ConfidentialCheckout } from "./confidential-checkout.tsx";
import { IntentsCheckout } from "./intents-checkout.tsx";
import {
  confidentialPaymentHoldMs,
  confidentialPaymentSchema,
  confidentialPaymentStatus,
  confidentialUsdcMint,
  CopyButton,
  creditBalance,
  date,
  Failure,
  focusHeading,
  fundingAtomic,
  inferredSolPrice,
  intentFunds,
  isPast,
  parseCreditAmount,
  paymentUri,
  readPaymentMeta,
  shorten,
  solDecimal,
  writePaymentMeta,
  type ConfidentialPayment,
  type FundingQuote,
  type IntentFund,
  type PaymentMeta,
} from "./shared.tsx";
import "./billing.css";

type PaymentMethod = "usdc" | "sol" | "confidential" | "other";

type Opened = {
  intent: Intent;
  uri: string;
  qr: string | null;
  cluster: string;
  archivedAt?: number;
};

const configSchema = z.object({
  enabled: z.boolean(),
  cluster: z.string().optional(),
  recipient: z.string().optional(),
  mint: z.string().optional(),
});
type BillingConfig = z.infer<typeof configSchema>;

async function loadConfig(): Promise<BillingConfig> {
  try {
    const response = await fetch("/api/billing/config", { cache: "no-store" });
    return configSchema.parse(await response.json());
  } catch {
    return { enabled: false };
  }
}

let configPromise: Promise<BillingConfig> | undefined;
function billingConfig() {
  configPromise ??= loadConfig();
  return configPromise;
}

const depositStatusSchema = z.union([
  z.object({ tag: z.literal("Pending") }),
  z.object({ tag: z.literal("Finalized"), signature: z.string() }),
  z.object({ tag: z.literal("Expired") }),
]);
const intentSchema = z.object({
  reference: z.string(),
  wallet: z.string(),
  asset: z.enum(["SOL", "USDC"]),
  amount: z.number(),
  atomic: z.number(),
  createdAt: z.number(),
  expiresAt: z.number(),
  status: depositStatusSchema,
});
const openDepositSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  intent: intentSchema.optional(),
  uri: z.string().optional(),
  qr: z.string().nullable().optional(),
});
const confirmDepositSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  pending: z.boolean().optional(),
  signature: z.string().optional(),
  expired: z.boolean().optional(),
});
const prepareDepositSchema = z.object({
  transaction: z.string(),
  error: z.string().optional(),
});

async function postBilling<T extends { error?: string }>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("The payment service returned an unreadable answer.");
  if (!response.ok) throw new Error(parsed.data.error || "The request failed.");
  return parsed.data;
}

async function payWithWallet(walletAddress: string, reference: string, cluster: string) {
  if (cluster !== "mainnet" && cluster !== "devnet") throw new Error("Unsupported Solana network.");
  const { wallet } = solanaWalletClients[cluster];
  await wallet.whenReady();
  const connected = wallet.getState().connected;
  if (connected?.account.address !== walletAddress || !connected.account.chains.includes(`solana:${cluster}`)) {
    throw new Error("Connect your signed-in wallet from the console header, or use the Solana Pay link.");
  }
  const { signer, supportedTransactionVersions } = connected;
  const version = ([1, 0] as const).find((candidate) => supportedTransactionVersions.has(candidate));
  if (!signer || !isTransactionSendingSigner(signer) || version === undefined) {
    throw new Error("Use a wallet that supports sending Solana v0 or v1 transactions.");
  }
  const { transaction } = await postBilling("/api/billing/deposits/prepare", { reference, version }, prepareDepositSchema);
  const current = wallet.getState().connected;
  if (current?.account !== connected.account || current.signer !== signer) {
    throw new Error("The wallet changed while preparing this transaction. Review it again before paying.");
  }
  const prepared = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
  const message = getCompiledTransactionMessageDecoder().decode(prepared.messageBytes);
  if (message.version !== version || message.staticAccounts[0] !== walletAddress) {
    throw new Error("The prepared transaction does not match the selected wallet or transaction version.");
  }
  const [signature] = await signer.signAndSendTransactions([prepared]);
  if (signature?.length !== 64) throw new Error("The wallet did not return a signature. Check the payment status.");
  return getBase58Decoder().decode(signature);
}

async function qrFor(uri: string) {
  try {
    return await QRCode.toDataURL(uri, { margin: 2, width: 220 });
  } catch {
    return null;
  }
}

const confidentialStoreSchema = z.record(z.string(), z.array(confidentialPaymentSchema));
type ConfidentialStore = z.infer<typeof confidentialStoreSchema>;

function readConfidentialStore(): ConfidentialStore {
  try {
    return confidentialStoreSchema.parse(JSON.parse(localStorage.getItem("sonnely.billing.confidential") ?? "{}"));
  } catch {
    return {};
  }
}

function writeConfidentialStore(value: ConfidentialStore) {
  localStorage.setItem("sonnely.billing.confidential", JSON.stringify(value));
}

function upsertPayment(history: readonly ConfidentialPayment[], payment: ConfidentialPayment) {
  const rest = history.filter((item) => item.reference !== payment.reference);
  return [payment, ...rest];
}

function newReference() {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

const destinationAsset = "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";
const atomicString = z.string().regex(/^\d+$/);

async function quoteFunding(
  wallet: string,
  input: { asset: IntentFund; amount: string; refundTo?: string; prepare?: boolean },
): Promise<FundingQuote> {
  if (!wallet) throw new Error("Connect your Solana wallet to quote a swap.");
  const response = await fetch("/api/billing/intents/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const parsed = z
    .object({
      amountOut: atomicString.optional(),
      minAmountOut: atomicString.optional(),
      depositAddress: z.string().optional(),
      depositMemo: z.string().optional(),
      deadline: z.string().optional(),
      recipient: z.string().optional(),
      refundTo: z.string().optional(),
      error: z.string().optional(),
    })
    .safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("The quote service returned an unreadable answer.");
  const data = parsed.data;
  if (!response.ok) throw new Error(data.error || "No quote was available. Check the amount and try again.");
  if (!data.amountOut || !data.minAmountOut || !data.deadline || !data.recipient || !data.refundTo) {
    throw new Error("NEAR Intents returned inconsistent swap details. Request a new quote.");
  }
  return {
    amountOut: data.amountOut,
    minAmountOut: data.minAmountOut,
    deadline: data.deadline,
    recipient: data.recipient,
    refundTo: data.refundTo,
    ...(input.prepare ? { depositAddress: data.depositAddress, depositMemo: data.depositMemo } : {}),
  };
}

function WorkspaceHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="console-title">
      <div className="console-title-identity">
        <span className="console-title-icon">
          <Wallet size={21} aria-hidden="true" />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
    </header>
  );
}

function BillingConsole() {
  const config = use(billingConfig());
  const session = useWorkspaceSession();
  const ledger = useRemote<Ledger>("billing-ledger");
  const deposits = useRemote<Deposits>("billing-deposits");
  const [dollars, setDollars] = useState("5");
  const [method, setMethod] = useState<PaymentMethod>("usdc");
  const [confidentialSelection, setConfidentialSelection] = useState<{
    wallet: string;
    order: ConfidentialPayment | null;
  }>();
  const [confidentialStore, setConfidentialStore] = useState<ConfidentialStore>(() => readConfidentialStore());
  const [fund, setFund] = useState<IntentFund>("sol");
  const [fundAmount, setFundAmount] = useState("0.1");
  const [refundTo, setRefundTo] = useState("");
  const [intent, setIntent] = useState<FundingQuote | null>(null);
  const [order, setOrder] = useState<Opened | null>(null);
  const [submittedSignature, setSubmittedSignature] = useState("");
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState("");
  const [archive, setArchive] = useState("");
  const [failure, setFailure] = useState<{ action: string; message: string }>();
  const [status, setStatus] = useState("");
  const [meta, setMeta] = useState<Record<string, PaymentMeta>>(() => readPaymentMeta());

  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const entries = ledger.state?.entries.filter((entry) => entry.wallet === wallet) ?? [];
  const balance = entries.reduce((total, entry) => total + (entry.kind === "Charge" || entry.kind === "AdjustDebit" ? -entry.amount : entry.amount), 0);
  const profile = wallet ? { wallet, balance } : null;
  const cluster = config.cluster ?? "devnet";
  const billingEnabled = config.enabled;
  const paymentVerificationEnabled = config.enabled;
  const termsRequired = false;
  const showSol = Boolean(billingEnabled && cluster === "mainnet");
  const showConfidential = Boolean(profile && cluster === "mainnet");
  const showOther = cluster === "mainnet";
  const intentsWidgetUrl = undefined;
  const confidentialHistoryForWallet = wallet ? (confidentialStore[wallet] ?? []) : [];
  const selectedPayment = confidentialSelection?.wallet === wallet ? confidentialSelection : undefined;
  const activeConfidential = confidentialHistoryForWallet.find((item) =>
    ["awaiting_payment", "under_review"].includes(item.status),
  );
  const confidentialOrder = selectedPayment ? selectedPayment.order : (activeConfidential ?? null);
  const confidentialMap = new Map(confidentialHistoryForWallet.map((payment) => [payment.reference, payment]));
  if (confidentialOrder) confidentialMap.set(confidentialOrder.reference, confidentialOrder);
  const mine = deposits.state?.intents.filter((item) => item.wallet === wallet) ?? [];
  const paymentHistory = [
    ...mine.map((item) => ({ kind: "public" as const, item, time: item.createdAt })),
    ...Array.from(confidentialMap.values(), (item) => ({ kind: "confidential" as const, item, time: item.createdAt })),
  ].sort((left, right) => right.time - left.time);
  const fundingDetails = intent?.recipient === wallet ? intent : null;
  const swapAsset = intentFunds[fund];
  const quoting = pending === "quote" || pending === "prepare-swap";
  const reference = order?.intent.reference;
  const archived = order?.archivedAt !== undefined;
  const quoteExpired = Boolean(order?.intent.expiresAt && isPast(order.intent.expiresAt));
  const submitted = Boolean(submittedSignature);

  function saveMeta(next: Record<string, PaymentMeta>) {
    setMeta(next);
    writePaymentMeta(next);
  }

  function rememberPayment(opened: Opened) {
    saveMeta({
      ...meta,
      [opened.intent.reference]: {
        uri: opened.uri,
        qr: opened.qr,
        cluster: opened.cluster,
        ...(opened.archivedAt === undefined ? {} : { archivedAt: opened.archivedAt }),
      },
    });
  }

  function presentPayment(item: Intent): Opened {
    const saved = meta[item.reference];
    const uri = saved?.uri ?? (config.recipient && config.mint ? paymentUri(item, config.recipient, config.mint) : "");
    return {
      intent: item,
      uri,
      qr: saved?.qr ?? null,
      cluster: saved?.cluster ?? cluster,
      ...(saved?.archivedAt === undefined ? {} : { archivedAt: saved.archivedAt }),
    };
  }

  function openPayment(payment: Opened) {
    setOrder(payment);
    setSignature("");
    setSubmittedSignature("");
  }

  async function resumePayment(referenceValue: string) {
    const item = deposits.state?.intents.find((candidate) => candidate.reference === referenceValue);
    if (!item) throw new Error("Payment request unavailable.");
    const presented = presentPayment(item);
    if (!presented.qr && presented.uri) presented.qr = await qrFor(presented.uri);
    setMethod(item.asset === "SOL" ? "sol" : "usdc");
    openPayment(presented);
    rememberPayment(presented);
  }

  function selectConfidentialPayment(payment: ConfidentialPayment | null) {
    if (!wallet) return;
    setConfidentialSelection({ wallet, order: payment });
  }

  function updateConfidential(updated: ConfidentialPayment) {
    const current = confidentialStore[updated.payer] ?? [];
    const next = { ...confidentialStore, [updated.payer]: upsertPayment(current, updated) };
    setConfidentialStore(next);
    writeConfidentialStore(next);
    setConfidentialSelection({ wallet: updated.payer, order: updated });
    return updated;
  }

  function createConfidentialOrder(amountText: string) {
    if (!wallet || !config.recipient) throw new Error("Confidential USDC checkout is unavailable for this account.");
    const amount = parseCreditAmount(amountText);
    if (amount === null) throw new Error("Enter a positive USDC amount with up to six decimal places.");
    const now = Date.now();
    return updateConfidential({
      reference: newReference(),
      payer: wallet,
      treasury: config.recipient,
      cluster: "mainnet",
      mint: confidentialUsdcMint,
      amount,
      status: "awaiting_payment",
      createdAt: now,
      expiresAt: now + confidentialPaymentHoldMs,
    });
  }

  function submitConfidentialOrder(referenceValue: string, submitted: string) {
    const current = wallet ? confidentialStore[wallet]?.find((item) => item.reference === referenceValue) : undefined;
    if (!current) throw new Error("Payment request unavailable.");
    return updateConfidential({ ...current, status: "under_review", signature: submitted, submittedAt: Date.now() });
  }

  function cancelConfidentialOrder(referenceValue: string) {
    const current = wallet ? confidentialStore[wallet]?.find((item) => item.reference === referenceValue) : undefined;
    if (!current) throw new Error("Payment request unavailable.");
    return updateConfidential({ ...current, status: "cancelled", cancelledAt: Date.now() });
  }

  function refreshConfidentialOrder(referenceValue: string) {
    const current = wallet ? confidentialStore[wallet]?.find((item) => item.reference === referenceValue) : undefined;
    if (!current) throw new Error("Payment request unavailable.");
    return updateConfidential(current);
  }

  async function run(name: string, action: () => Promise<void>) {
    setPending(name);
    setFailure(undefined);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setFailure({ action: name, message: error instanceof Error ? error.message : "The request failed." });
    } finally {
      setPending("");
    }
  }

  function finishPayment(clusterName: string) {
    setStatus(clusterName === "mainnet" ? "Payment confirmed. Credits added." : "Devnet payment verified.");
    setFailure(undefined);
    setOrder(null);
    setSignature("");
    setSubmittedSignature("");
  }

  const historyError = deposits.error;

  return (
    <div className="billing-legacy">
      <WorkspaceHeading title="Billing" description="Add compute credits, check your balance, and track wallet payments." />
      <Failure message={failure && !["deposit", "pay", "confirm"].includes(failure.action) ? failure.message : historyError} />
      <p role="status" className={status ? "status" : "visually-hidden"}>
        {status}
      </p>
      <div className="billing-grid">
        <section className="panel stack-panel billing-balance">
          <div className="between">
            <h2>Compute balance</h2>
            <Wallet size={21} />
          </div>
          <p className="amount">{profile ? creditBalance(profile.balance) : "—"}</p>
          <p className="caption">Available for inference.</p>
          {profile && profile.balance > 0 && (
            <a className="text-link" href="/console/chat">
              Send a prompt <ArrowUpRight size={16} />
            </a>
          )}
          <a className="text-link" href="/models">
            View token rates <ArrowUpRight size={16} />
          </a>
        </section>
        <section className="panel stack-panel buy-credits" id="buy-credits">
          <div className="between">
            <h2>Buy credits</h2>
            <span className="pill">{billingEnabled ? cluster : "Solana Pay"}</span>
          </div>
          {(showSol || showConfidential || showOther) && (
            <fieldset className="billing-payment-method">
              <legend>Payment method</legend>
              <div className="billing-payment-options">
                {(
                  [
                    { id: "usdc", label: "USDC", available: true },
                    { id: "sol", label: "SOL", available: showSol },
                    { id: "confidential", label: "Confidential USDC", available: showConfidential },
                    { id: "other", label: "Other crypto", available: showOther },
                  ] as const
                )
                  .filter(({ available }) => available)
                  .map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className="button quiet"
                      aria-pressed={method === id}
                      disabled={!!pending || submitted}
                      onClick={() => {
                        if (method === id) return;
                        setMethod(id);
                        setIntent(null);
                        setFailure(undefined);
                      }}
                    >
                      {label}
                    </button>
                  ))}
              </div>
            </fieldset>
          )}
          {(method === "usdc" || method === "sol") && (
            <>
              <p className="caption">
                {termsRequired
                  ? "Accept the current terms above to buy credits."
                  : profile
                    ? method === "sol"
                      ? "Enter the USD credit amount. You’ll review a time-limited SOL quote before you pay."
                      : "Credits post after your public USDC transfer finalizes."
                    : "Connect your Solana wallet in the header to buy credits."}
              </p>
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("deposit", async () => {
                    if (!wallet) throw new Error("Connect your Solana wallet in the header to buy credits.");
                    const amount = parseCreditAmount(dollars);
                    if (amount === null) throw new Error("Enter a positive amount with up to six decimal places.");
                    if (
                      order?.intent.amount === amount &&
                      Boolean(order.intent.asset === "SOL") === (method === "sol") &&
                      !quoteExpired &&
                      !archived
                    )
                      return;
                    const existing = mine.find(
                      (item) =>
                        item.status.tag === "Pending" &&
                        meta[item.reference]?.archivedAt === undefined &&
                        item.amount === amount &&
                        (item.asset === "SOL") === (method === "sol") &&
                        !isPast(item.expiresAt),
                    );
                    if (existing) await resumePayment(existing.reference);
                    else {
                      const answer = await postBilling(
                        "/api/billing/deposits",
                        { wallet, asset: method === "sol" ? "SOL" : "USDC", amount },
                        openDepositSchema,
                      );
                      if (!answer.ok || !answer.intent || !answer.uri)
                        throw new Error(answer.error ?? "The payment could not be opened.");
                      const opened: Opened = {
                        intent: answer.intent,
                        uri: answer.uri,
                        qr: answer.qr ?? null,
                        cluster,
                      };
                      openPayment(opened);
                      rememberPayment(opened);
                    }
                  });
                }}
              >
                <label>
                  {method === "sol" ? "Credits in USD" : "Amount in USDC"}
                  <Input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    inputMode="decimal"
                    required
                    value={dollars}
                    onChange={(event) => {
                      setDollars(event.target.value);
                      if (failure?.action === "deposit" || failure?.action === "pay") setFailure(undefined);
                    }}
                  />
                </label>
                <button className="button accent" disabled={!profile || !billingEnabled || !!pending || submitted}>
                  {pending === "deposit" ? "Preparing…" : "Continue to payment"}
                </button>
              </form>
              {failure?.action === "deposit" && <Failure message={failure.message} />}
            </>
          )}
          {method === "confidential" && showConfidential && (
            <ConfidentialCheckout
              key={wallet}
              order={confidentialOrder}
              available={Boolean(billingEnabled && config.recipient)}
              loading={false}
              lookupError=""
              retry={() => setFailure(undefined)}
              amount={dollars}
              changeAmount={setDollars}
              onOrder={selectConfidentialPayment}
              createOrder={createConfidentialOrder}
              submitOrder={submitConfidentialOrder}
              cancelOrder={cancelConfidentialOrder}
              refreshOrder={refreshConfidentialOrder}
            />
          )}
          {method === "other" && showOther && intentsWidgetUrl && (
            <IntentsCheckout
              url={intentsWidgetUrl}
              wallet={wallet}
              unavailableReason={
                termsRequired
                  ? "Accept the current terms above to use NEAR Intents."
                  : !billingEnabled
                    ? "Swaps are temporarily unavailable."
                    : undefined
              }
            />
          )}
          {method === "other" && showOther && !intentsWidgetUrl && (
            <div className="stack-panel">
              <p className="caption">
                NEAR Intents converts your funds to USDC in your wallet. Then pay with USDC to add credits.
              </p>
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setIntent(null);
                  void run("quote", async () => {
                    if (!wallet) throw new Error("Connect your Solana wallet to start a swap.");
                    setIntent(await quoteFunding(wallet, {
                      asset: fund,
                      amount: fundAmount.trim(),
                      ...(fund !== "sol" ? { refundTo: refundTo.trim() } : {}),
                    }));
                  });
                }}
              >
                <label>
                  Source asset
                  <select
                    value={fund}
                    disabled={quoting}
                    onChange={(event) => {
                      setFund(event.target.value as IntentFund);
                      setIntent(null);
                    }}
                  >
                    {Object.entries(intentFunds).map(([id, asset]) => (
                      <option key={id} value={id}>
                        {asset.symbol} on {asset.network}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount in {swapAsset.symbol}
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    maxLength={37}
                    disabled={quoting}
                    value={fundAmount}
                    onChange={(event) => {
                      setFundAmount(event.target.value);
                      setIntent(null);
                    }}
                  />
                </label>
                {fund !== "sol" && (
                  <label>
                    Refund wallet on {swapAsset.network}
                    <Input
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="0x…"
                      required
                      maxLength={42}
                      disabled={quoting}
                      value={refundTo}
                      onChange={(event) => {
                        setRefundTo(event.target.value);
                        setIntent(null);
                      }}
                    />
                  </label>
                )}
                <button className="button quiet" disabled={!profile || !billingEnabled || !!pending}>
                  {pending === "quote" ? "Quoting…" : "Get quote"}
                </button>
              </form>
              {failure?.action === "quote" && <Failure message={failure.message} />}
              {fundingDetails && (
                <section className="checkout" aria-label="Swap details">
                  <p role="status" className="status">
                    {creditBalance(Number(fundingDetails.amountOut))} estimated · {creditBalance(Number(fundingDetails.minAmountOut))} minimum
                  </p>
                  {fundingDetails.depositAddress ? (
                    <>
                      <p>
                        Send exactly{" "}
                        <strong>
                          {fundAmount.trim()} {swapAsset.symbol}
                        </strong>{" "}
                        on <strong>{swapAsset.network} mainnet</strong> to the address below before{" "}
                        {new Date(fundingDetails.deadline).toLocaleTimeString([], { timeZoneName: "short" })}. Save the address and
                        transaction ID.
                      </p>
                      <CopyButton value={fundingDetails.depositAddress} label="Copy swap deposit address" />
                      <code className="break-anywhere">{fundingDetails.depositAddress}</code>
                      {fundingDetails.depositMemo && (
                        <>
                          <p>Include this memo with your transfer.</p>
                          <CopyButton value={fundingDetails.depositMemo} label="Copy deposit memo" />
                          <code className="break-anywhere">{fundingDetails.depositMemo}</code>
                        </>
                      )}
                      <p className="caption">
                        Solana USDC goes to {shorten(fundingDetails.recipient)}. Refunds go to {shorten(fundingDetails.refundTo)} on{" "}
                        {swapAsset.network}. Once USDC arrives in your wallet, select USDC to finish paying for credits.
                      </p>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button accent"
                      disabled={!!pending || !billingEnabled || termsRequired}
                      onClick={() =>
                        void run("prepare-swap", async () => {
                          if (!wallet) throw new Error("Connect your Solana wallet to start a swap.");
                          setIntent(await quoteFunding(wallet, {
                            asset: fund,
                            amount: fundAmount.trim(),
                            ...(fund !== "sol" ? { refundTo: refundTo.trim() } : {}),
                            prepare: true,
                          }));
                        })
                      }
                    >
                      {pending === "prepare-swap" ? "Preparing…" : "Get swap deposit address"}
                    </button>
                  )}
                  {failure?.action === "prepare-swap" && <Failure message={failure.message} />}
                </section>
              )}
            </div>
          )}
          {order && profile && method === (order.intent.asset === "SOL" ? "sol" : "usdc") && (
            <section className="checkout" aria-label={archived ? "Archived payment" : "Review transfer"}>
              <div className="between">
                <h2 tabIndex={-1} ref={focusHeading}>
                  {archived
                    ? "Archived payment"
                    : order.intent.asset === "SOL"
                      ? "Pay " + solDecimal(order.intent.atomic) + " SOL"
                      : "Pay " + creditBalance(order.intent.amount) + " in USDC"}
                </h2>
                <span className="pill">{order.cluster}</span>
              </div>
              <p className="caption">
                {archived
                  ? "If you already sent this transfer, you can still check for confirmation and receive credits."
                  : order.intent.asset === "SOL"
                    ? `${creditBalance(order.intent.amount)} in credits at $${inferredSolPrice(order.intent)} per SOL. Quote expires at ${new Date(order.intent.expiresAt).toLocaleTimeString()}. Network fees are separate.`
                    : "Your wallet shows the transfer before you approve. A small SOL fee and token account setup may apply."}
              </p>
              {submitted ? (
                <p role="status" className="status">
                  Payment submitted. Waiting for Solana finality…
                </p>
              ) : archived ? null : quoteExpired ? (
                <p role="status">SOL quote expired. Continue to payment to request a new quote.</p>
              ) : (
                <>
                  <button
                    type="button"
                    className="button accent"
                    disabled={!billingEnabled || !!pending}
                    onClick={() =>
                      void run("pay", async () => {
                        if (!profile) throw new Error("Connect your signed-in wallet from the console header, or use the Solana Pay link.");
                        const sent = await payWithWallet(profile.wallet, order.intent.reference, order.cluster);
                        setSignature(sent);
                        setSubmittedSignature(sent);
                      })
                    }
                  >
                    {pending === "pay" ? "Waiting for wallet…" : "Pay with connected wallet"}
                  </button>
                  {failure?.action === "pay" && <Failure message={failure.message} />}
                  <details>
                    <summary>Use a Solana Pay link or QR code</summary>
                    <div className="payment-qr">
                      {order.qr && <img src={order.qr} width={176} height={176} alt="Scan with a Solana Pay wallet" />}
                      <div>
                        <p>Open the payment in a compatible wallet on {order.cluster}.</p>
                        {order.uri && (
                          <a className="button quiet" href={order.uri}>
                            Open in wallet <ArrowUpRight size={16} />
                          </a>
                        )}
                        {order.uri && <CopyButton value={order.uri} label="Copy payment link" />}
                      </div>
                    </div>
                  </details>
                </>
              )}
              <details key={reference} open={archived || undefined}>
                <summary>Check payment status</summary>
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run("confirm", async () => {
                      const result = await postBilling(
                        "/api/billing/deposits/confirm",
                        { reference: order.intent.reference, signature: signature.trim() || undefined },
                        confirmDepositSchema,
                      );
                      if (result.ok && result.signature) finishPayment(order.cluster);
                      else setStatus("Waiting for a matching, finalized payment.");
                    });
                  }}
                >
                  <label>
                    Transaction signature (optional)
                    <Input minLength={64} maxLength={88} value={signature} onChange={(event) => setSignature(event.target.value)} />
                  </label>
                  <button className="button quiet" disabled={!paymentVerificationEnabled || !!pending}>
                    {pending === "confirm" ? "Checking…" : "Check now"}
                  </button>
                </form>
                {failure?.action === "confirm" && <Failure message={failure.message} />}
              </details>
            </section>
          )}
        </section>
        <section className="panel breakdown billing-history">
          <h2 id="payment-history" tabIndex={-1}>
            Payment history
          </h2>
          {profile && paymentHistory.length > 0 ? (
            <div className="table-wrap workspace-data-table payment-history" role="region" aria-labelledby="payment-history" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th>Network</th>
                    <th>Credits</th>
                    <th>Paid with</th>
                    <th>Status</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map(({ kind, item, time }) =>
                    kind === "confidential" ? (
                      <tr key={item.reference}>
                        <td>{date(time)}</td>
                        <td>{item.cluster}</td>
                        <td>{creditBalance(item.amount)}</td>
                        <td>Confidential USDC</td>
                        <td>{confidentialPaymentStatus(item)}</td>
                        <td>
                          <button
                            type="button"
                            className="text-link"
                            disabled={Boolean(pending) || submitted}
                            onClick={() => {
                              setMethod("confidential");
                              selectConfidentialPayment(item);
                            }}
                          >
                            View payment
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.reference}>
                        <td>{date(item.createdAt)}</td>
                        <td>{meta[item.reference]?.cluster ?? cluster}</td>
                        <td>{creditBalance(item.amount)}</td>
                        <td>{item.asset === "SOL" ? solDecimal(item.atomic) + " SOL" : "USDC"}</td>
                        <td>
                          {item.status.tag === "Finalized" ? (
                            <div className="payment-status">
                              <a
                                className="text-link"
                                href={
                                  "https://explorer.solana.com/tx/" +
                                  item.status.signature +
                                  ((meta[item.reference]?.cluster ?? cluster) === "devnet" ? "?cluster=devnet" : "")
                                }
                              >
                                Finalized <ArrowUpRight size={13} />
                              </a>
                              <CopyButton
                                value={`Sonnely ${item.asset === "SOL" ? "SOL" : "USDC"} receipt ${creditBalance(item.amount)} ${meta[item.reference]?.cluster ?? cluster} ${item.status.signature}`}
                                label="Copy receipt"
                              />
                            </div>
                          ) : archive === item.reference ? (
                            <div className="payment-status">
                              <span className="caption">Archive this payment request?</span>
                              <button
                                className="text-link"
                                type="button"
                                disabled={!!pending}
                                onClick={() => {
                                  const archivedAt = Date.now();
                                  const current = presentPayment(item);
                                  const opened = { ...current, archivedAt, uri: "", qr: null };
                                  const next = {
                                    ...meta,
                                    [item.reference]: { uri: "", qr: null, cluster: opened.cluster, archivedAt },
                                  };
                                  saveMeta(next);
                                  if (order?.intent.reference === item.reference) setOrder(opened);
                                  setArchive("");
                                  setStatus("Payment request archived. You can still check for a finalized transfer.");
                                }}
                              >
                                Confirm archive
                              </button>
                              <button className="text-link" type="button" disabled={!!pending} onClick={() => setArchive("")}>
                                Keep
                              </button>
                            </div>
                          ) : (
                            <div className="payment-status">
                              <span className={item.status.tag === "Expired" ? "caption state-expired" : "caption"}>
                                {meta[item.reference]?.archivedAt !== undefined
                                  ? "Archived"
                                  : item.status.tag === "Expired" || isPast(item.expiresAt)
                                    ? "Expired"
                                    : "Awaiting payment"}
                              </span>
                              {item.status.tag !== "Expired" && !isPast(item.expiresAt) && (
                                <>
                                  <button
                                    className="text-link"
                                    type="button"
                                    aria-label={meta[item.reference]?.archivedAt !== undefined ? "Check archived payment" : "Resume payment"}
                                    disabled={!!pending}
                                    onClick={() => void run("resume", () => resumePayment(item.reference))}
                                  >
                                    {meta[item.reference]?.archivedAt !== undefined ? "Check status" : "Resume"}
                                  </button>
                                  {meta[item.reference]?.archivedAt === undefined && (
                                    <button className="text-link" type="button" disabled={!!pending} onClick={() => setArchive(item.reference)}>
                                      Archive request
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <CopyButton value={item.reference} label="Copy payment reference" />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="caption" role="status">
              {!profile
                ? "Connect a wallet to view payment history."
                : historyError
                  ? "Payment history is unavailable."
                  : deposits.state
                    ? "No payments to show."
                    : "Loading payment history…"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function BillingFallback() {
  return (
    <div className="billing-legacy">
      <WorkspaceHeading title="Billing" description="Add compute credits, check your balance, and track wallet payments." />
      <div className="billing-grid">
        <section className="panel stack-panel billing-balance">
          <div className="between">
            <h2>Compute balance</h2>
            <Wallet size={21} />
          </div>
          <p className="amount">—</p>
          <p className="caption">Available for inference.</p>
        </section>
        <section className="panel breakdown billing-history">
          <h2>Payment history</h2>
          <p className="caption" role="status">
            Loading payment history…
          </p>
        </section>
      </div>
    </div>
  );
}

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Billing") return null;
  return (
    <ConsoleFrame section="Billing">
      <Suspense fallback={<BillingFallback />}>
        <BillingConsole />
      </Suspense>
    </ConsoleFrame>
  );
}
