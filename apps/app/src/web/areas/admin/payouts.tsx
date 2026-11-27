/* eslint-disable better-tailwindcss/no-unknown-classes -- this area uses the migrated admin shell class names */
// spec/app/billing/payouts.md, "Story: Prepare a margin payout"
import { Suspense, use, useState, type FormEvent } from "react";
import { z } from "zod";
import { Input, Textarea } from "@repo/ui";
import type { Payout, PayoutStatus } from "../../../../gen/app__billing__payouts.ts";
import { CopyButton, creditBalance, dateTime, parseCreditAmount, shorten } from "../console/bits.tsx";
import { EmptyState, Pill } from "./legacy/admin/ui.tsx";

const positionSchema = z.object({
  throughEntry: z.number(),
  chargeTotal: z.number(),
  marginMicros: z.number(),
  committedMicros: z.number(),
  liveMicros: z.number(),
  paidMicros: z.number(),
  availableMicros: z.number(),
  creditLiabilityMicros: z.number(),
});

const payoutStatusSchema = z.union([
  z.object({ tag: z.literal("Prepared") }),
  z.object({ tag: z.literal("Executed"), signature: z.string(), executedAt: z.number() }),
  z.object({ tag: z.literal("Verified"), signature: z.string(), verifiedAt: z.number() }),
  z.object({ tag: z.literal("Failed"), signature: z.string(), failedAt: z.number(), reason: z.string() }),
  z.object({ tag: z.literal("Cancelled"), cancelledAt: z.number(), reason: z.string() }),
]);

const payoutSchema = z.object({
  reference: z.string(),
  destination: z.string(),
  amount: z.number(),
  preparedAt: z.number(),
  throughEntry: z.number(),
  chargeTotal: z.number(),
  preparedBy: z.string(),
  lastValidBlockHeight: z.number(),
  status: payoutStatusSchema,
});

const snapshotSchema = z.object({
  ok: z.literal(true),
  enabled: z.boolean(),
  cluster: z.string().optional(),
  treasury: z.string().optional(),
  payoutWallet: z.string(),
  position: positionSchema,
  payouts: z.array(payoutSchema),
});

type Snapshot = z.infer<typeof snapshotSchema>;

type PrepareAnswer = {
  ok: boolean;
  payout?: Payout;
  transaction?: string;
  lastValidBlockHeight?: number;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

async function loadSnapshot(): Promise<Snapshot> {
  const response = await fetch("/api/admin/payouts", { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error ?? "The payout position could not be loaded.");
  return snapshotSchema.parse(body);
}

let snapshotPromise: Promise<Snapshot> | undefined;
function bootSnapshot() {
  snapshotPromise ??= loadSnapshot();
  return snapshotPromise;
}

async function refreshSnapshot() {
  const next = await loadSnapshot();
  snapshotPromise = Promise.resolve(next);
  return next;
}

async function post<T extends { error?: string }>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await readJson<T>(response);
  if (!response.ok) throw new Error(parsed.error ?? "The payout request was refused.");
  return parsed;
}

function statusText(status: PayoutStatus) {
  return status.tag.toLowerCase();
}

function statusTone(status: PayoutStatus): "ok" | "warn" | "error" | "info" | "muted" {
  if (status.tag === "Verified") return "ok";
  if (status.tag === "Failed" || status.tag === "Cancelled") return "error";
  if (status.tag === "Executed") return "info";
  return "warn";
}

function signatureOf(status: PayoutStatus) {
  return "signature" in status ? status.signature : "";
}

function statusTime(status: PayoutStatus) {
  if (status.tag === "Executed") return status.executedAt;
  if (status.tag === "Verified") return status.verifiedAt;
  if (status.tag === "Failed") return status.failedAt;
  if (status.tag === "Cancelled") return status.cancelledAt;
  return undefined;
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PayoutDeskLoaded() {
  const first = use(bootSnapshot());
  const [snapshot, setSnapshot] = useState(first);
  const [amount, setAmount] = useState("");
  const [version, setVersion] = useState<0 | 1>(1);
  const [reference, setReference] = useState("");
  const [signature, setSignature] = useState("");
  const [prepared, setPrepared] = useState<PrepareAnswer>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const live = snapshot.payouts.find((payout) => payout.status.tag === "Prepared" || payout.status.tag === "Executed");
  const selectedReference = reference || live?.reference || "";
  const position = snapshot.position;

  async function refresh() {
    setSnapshot(await refreshSnapshot());
  }

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The payout request failed.");
    } finally {
      setBusy(false);
    }
  }

  function submitPrepare(event: FormEvent) {
    event.preventDefault();
    const micros = parseCreditAmount(amount);
    if (micros === null) {
      setError("Enter a positive USDC amount with at most six decimal places.");
      return;
    }
    void run(async () => {
      const answer = await post<PrepareAnswer>("/api/admin/payouts/prepare", { amount: micros, version });
      if (!answer.payout || !answer.transaction) throw new Error("The payout preparation answer was incomplete.");
      setPrepared(answer);
      setReference(answer.payout.reference);
      return "Unsigned payout transaction prepared. Sign it with the treasury wallet outside Sonnely.";
    });
  }

  function submitExecution(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const answer = await post<{ status?: string; pending?: boolean; error?: string }>("/api/admin/payouts/execute", {
        reference: selectedReference,
        signature,
      });
      setSignature("");
      return answer.pending
        ? "Execution recorded. The transaction is not finalized yet; submit the same signature again after finality."
        : "Payout verified on chain with the exact prepared terms.";
    });
  }

  function cancelPrepared(payout: Payout) {
    void run(async () => {
      await post("/api/admin/payouts/cancel", { reference: payout.reference, reason: "abandoned by operator" });
      if (prepared?.payout?.reference === payout.reference) setPrepared(undefined);
      return "Prepared payout cancelled. Its margin is available again.";
    });
  }

  return (
    <div className="admin-grid">
      <section className="panel stack-panel">
        <div className="section-head">
          <div>
            <h2>Margin position</h2>
            <p className="caption">
              Inference markup is one eleventh of customer charges. Customer credit and upstream-cost obligations stay in the treasury.
            </p>
          </div>
          <button className="button quiet" type="button" disabled={busy} onClick={() => void run(async () => { await refresh(); return "Position refreshed."; })}>
            Refresh
          </button>
        </div>
        <dl className="admin-metrics">
          <Metric label="Net inference charges">{creditBalance(position.chargeTotal)}</Metric>
          <Metric label="Markup margin earned">{creditBalance(position.marginMicros)}</Metric>
          <Metric label="Live payouts">{creditBalance(position.liveMicros)}</Metric>
          <Metric label="Profit paid">{creditBalance(position.paidMicros)}</Metric>
          <Metric label="Available margin">{creditBalance(position.availableMicros)}</Metric>
          <Metric label="Customer credit liability">{creditBalance(position.creditLiabilityMicros)}</Metric>
          <Metric label="Ledger position">entry {position.throughEntry.toLocaleString()}</Metric>
        </dl>
        <p className="caption">
          Treasury {snapshot.treasury ? shorten(snapshot.treasury) : "unconfigured"} · payout wallet {shorten(snapshot.payoutWallet)} · {snapshot.cluster ?? "cluster unavailable"}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </section>

      <section className="panel stack-panel">
        <h2>Prepare unsigned payout</h2>
        <p className="caption">
          Sonnely builds the exact USDC transfer from treasury to the configured payout wallet. It never accepts or stores the treasury key.
        </p>
        <form className="admin-toolbar" onSubmit={submitPrepare}>
          <label>
            <span className="caption">Amount in USDC</span>
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" />
          </label>
          <label>
            <span className="caption">Transaction version</span>
            <select value={version} onChange={(event) => setVersion(Number(event.target.value) as 0 | 1)}>
              <option value={1}>v1</option>
              <option value={0}>v0</option>
            </select>
          </label>
          <button className="button accent" type="submit" disabled={busy || !snapshot.enabled || position.availableMicros <= 0 || Boolean(live)}>
            Prepare payout
          </button>
        </form>
        {live && <p className="caption">Finish, fail, or cancel the live payout before preparing another.</p>}
        {prepared?.transaction && prepared.payout && (
          <div className="stack-panel">
            <h3>Unsigned transaction for {shorten(prepared.payout.reference)}</h3>
            <Textarea readOnly rows={7} value={prepared.transaction} aria-label="Unsigned payout transaction" />
            <div className="actions">
              <CopyButton value={prepared.transaction} label="Copy unsigned transaction" />
              {prepared.lastValidBlockHeight !== undefined && <span className="caption">Last valid block {prepared.lastValidBlockHeight.toLocaleString()}</span>}
            </div>
          </div>
        )}
      </section>

      <section className="panel stack-panel">
        <h2>Record execution</h2>
        <p className="caption">
          After signing and submitting externally, paste the transaction signature. Sonnely reads the finalized chain transaction and records it only when signer, reference, destination, asset, and amount match.
        </p>
        <form className="admin-toolbar" onSubmit={submitExecution}>
          <label>
            <span className="caption">Payout reference</span>
            <Input value={selectedReference} onChange={(event) => setReference(event.target.value)} placeholder="Reference" />
          </label>
          <label>
            <span className="caption">Transaction signature</span>
            <Input value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Signature" />
          </label>
          <button className="button accent" type="submit" disabled={busy || !selectedReference || !signature.trim()}>
            Verify execution
          </button>
        </form>
      </section>

      <section className="panel breakdown">
        <h2 id="payout-history">Payout history</h2>
        {snapshot.payouts.length === 0 ? (
          <EmptyState title="No payouts" hint="Prepared, executed, verified, failed, and cancelled payouts will appear here." />
        ) : (
          <div className="table-wrap">
            <table data-cards aria-labelledby="payout-history">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th>Window</th>
                  <th>Prepared</th>
                  <th>Signature</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshot.payouts].reverse().map((payout) => {
                  const changed = statusTime(payout.status);
                  return (
                    <tr key={payout.reference}>
                      <th scope="row" data-label="Reference">{shorten(payout.reference)}</th>
                      <td data-label="Status"><Pill tone={statusTone(payout.status)}>{statusText(payout.status)}</Pill></td>
                      <td className="num" data-label="Amount">{creditBalance(payout.amount)}</td>
                      <td data-label="Window">entry {payout.throughEntry.toLocaleString()} · {creditBalance(payout.chargeTotal)}</td>
                      <td data-label="Prepared">{dateTime(payout.preparedAt)}{changed ? " · " + dateTime(changed) : ""}</td>
                      <td data-label="Signature">{signatureOf(payout.status) ? shorten(signatureOf(payout.status)) : "—"}</td>
                      <td data-label="Action">
                        {payout.status.tag === "Prepared" ? (
                          <button className="button quiet small" type="button" disabled={busy} onClick={() => cancelPrepared(payout)}>
                            Cancel
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function AdminPayouts() {
  return (
    <Suspense fallback={<section className="panel stack-panel"><h2>Margin position</h2><p role="status">Loading payout position…</p></section>}>
      <PayoutDeskLoaded />
    </Suspense>
  );
}
