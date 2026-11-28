// spec/app/billing/payouts.md, "Story: Prepare a margin payout"
import { Suspense, use, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button, Field, Input, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@repo/ui";
import type { Payout, PayoutStatus } from "../../../../gen/app__billing__payouts.ts";
import { CopyButton, creditBalance, dateTime, parseCreditAmount, shorten } from "../console/bits.tsx";
import { ChoiceGroup, Empty, FormError, Panel, Stat, StatusMark, TableFrame } from "./ui.tsx";

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


function PayoutDeskLoaded() {
  const first = use(bootSnapshot());
  const [snapshot, setSnapshot] = useState(first);
  const [amount, setAmount] = useState("");
  const [version, setVersion] = useState<"0" | "1">("1");
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
      const answer = await post<PrepareAnswer>("/api/admin/payouts/prepare", { amount: micros, version: Number(version) });
      if (!answer.payout || !answer.transaction) throw new Error("The payout preparation answer was incomplete.");
      setPrepared(answer);
      setReference(answer.payout.reference);
      return "Unsigned payout transaction prepared. Sign it with the treasury wallet outside Sonnely.";
    });
  }

  function submitExecution(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const answer = await post<{ status?: string; pending?: boolean; error?: string }>("/api/admin/payouts/execute", { reference: selectedReference, signature });
      setSignature("");
      return answer.pending ? "Execution recorded. The transaction is not finalized yet; submit the same signature again after finality." : "Payout verified on chain with the exact prepared terms.";
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
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Available margin" value={creditBalance(position.availableMicros)} hint={`ledger entry ${position.throughEntry.toLocaleString()}`} />
        <Stat label="Markup margin earned" value={creditBalance(position.marginMicros)} hint={`${creditBalance(position.chargeTotal)} charged`} />
        <Stat label="Live payouts" value={creditBalance(position.liveMicros)} hint={live ? shorten(live.reference) : "none live"} />
        <Stat label="Customer credit liability" value={creditBalance(position.creditLiabilityMicros)} hint={`${creditBalance(position.paidMicros)} profit paid`} />
      </div>

      <Panel
        title="Treasury position"
        aside={<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await refresh(); return "Position refreshed."; })}>Refresh</Button>}
      >
        <div className="grid gap-2 px-4 py-3 text-ui text-muted-foreground sm:grid-cols-3">
          <p>Treasury <span className="font-mono text-meta text-foreground">{snapshot.treasury ? shorten(snapshot.treasury) : "unconfigured"}</span></p>
          <p>Payout wallet <span className="font-mono text-meta text-foreground">{shorten(snapshot.payoutWallet)}</span></p>
          <p>Cluster <span className="text-foreground">{snapshot.cluster ?? "unavailable"}</span></p>
        </div>
        {error && <FormError message={error} />}
        {notice && <p role="status" className="border-t border-border px-4 py-3 text-ui text-ok">{notice}</p>}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Prepare unsigned payout">
          <form className="grid gap-3 px-4 py-4" onSubmit={submitPrepare}>
            <Field label="Amount in USDC" control={(props) => <Input {...props} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" />} />
            <ChoiceGroup label="Transaction version" value={version} choices={[{ value: "1", label: "v1" }, { value: "0", label: "v0" }] as const} onChange={setVersion} />
            <Button type="submit" disabled={busy || !snapshot.enabled || position.availableMicros <= 0 || Boolean(live)} className="justify-self-start">Prepare payout</Button>
            {live && <p className="text-meta text-muted-foreground">Finish or cancel the live payout before preparing another.</p>}
          </form>
          {prepared?.transaction && prepared.payout && (
            <div className="grid gap-3 border-t border-border px-4 py-4">
              <h3 className="text-ui font-medium">Unsigned transaction for {shorten(prepared.payout.reference)}</h3>
              <Textarea readOnly rows={7} value={prepared.transaction} aria-label="Unsigned payout transaction" />
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton value={prepared.transaction} label="Copy unsigned transaction" />
                {prepared.lastValidBlockHeight !== undefined && <span className="text-meta text-muted-foreground">Last valid block {prepared.lastValidBlockHeight.toLocaleString()}</span>}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Record execution">
          <form className="grid gap-3 px-4 py-4" onSubmit={submitExecution}>
            <Field label="Payout reference" control={(props) => <Input {...props} value={selectedReference} onChange={(event) => setReference(event.target.value)} placeholder="Reference" />} />
            <Field label="Transaction signature" control={(props) => <Input {...props} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Signature" />} />
            <Button type="submit" disabled={busy || !selectedReference || !signature.trim()} className="justify-self-start">Verify execution</Button>
          </form>
        </Panel>
      </div>

      <Panel title="Payout history">
        {snapshot.payouts.length === 0 ? <Empty title="No payouts" /> : (
          <TableFrame>
            <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Window</TableHead><TableHead>Prepared</TableHead><TableHead>Signature</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {[...snapshot.payouts].reverse().map((payout) => {
                const changed = statusTime(payout.status);
                return (
                  <TableRow key={payout.reference}>
                    <TableCell className="font-mono text-meta" label="Reference">{shorten(payout.reference)}</TableCell>
                    <TableCell label="Status"><StatusMark tone={statusTone(payout.status)}>{statusText(payout.status)}</StatusMark></TableCell>
                    <TableCell label="Amount">{creditBalance(payout.amount)}</TableCell>
                    <TableCell label="Window">entry {payout.throughEntry.toLocaleString()} · {creditBalance(payout.chargeTotal)}</TableCell>
                    <TableCell label="Prepared">{dateTime(payout.preparedAt)}{changed ? " · " + dateTime(changed) : ""}</TableCell>
                    <TableCell className="font-mono text-meta" label="Signature">{signatureOf(payout.status) ? shorten(signatureOf(payout.status)) : "—"}</TableCell>
                    <TableCell label="Action">{payout.status.tag === "Prepared" ? <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => cancelPrepared(payout)}>Cancel</Button> : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </TableFrame>
        )}
      </Panel>
    </div>
  );
}

export function AdminPayouts() {
  return (
    <Suspense fallback={<Panel title="Margin position"><p role="status" className="px-4 py-6 text-ui text-muted-foreground">Loading payout position…</p></Panel>}>
      <PayoutDeskLoaded />
    </Suspense>
  );
}
