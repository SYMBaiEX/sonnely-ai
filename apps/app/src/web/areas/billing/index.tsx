// spec/app/billing/index.md — the console's billing section: the credit balance, a Solana
// deposit flow that opens an intent, shows its payment link as a QR and checks finalization, and the
// ledger and intent history for the wallet the form names.
import { Alert, Button, Card, CardTitle, Input } from "@repo/ui";
import { useCallback, useEffect, useState } from "react";
import type { Deposits, Intent } from "../../../../gen/app__billing__deposits.ts";
import type { Ledger } from "../../../../gen/app__billing__ledger.ts";
import type { Page } from "../../../../gen/app__nav.ts";
import { useRemote } from "../../remote.ts";

/** Credits are micro-dollars (lib/credit-amount.ts). */
function creditDecimal(micros: number) {
  const units = BigInt(micros);
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return "$" + whole + (fraction ? "." + fraction : "");
}

function solDecimal(lamports: number) {
  const value = BigInt(lamports);
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function atomicDecimal(intent: Intent) {
  return intent.asset === "SOL" ? `${solDecimal(intent.atomic)} SOL` : `${creditDecimal(intent.atomic)} USDC`;
}

function statusOf(intent: Intent) {
  return intent.status.tag === "Finalized" ? "Paid" : intent.status.tag === "Expired" ? "Expired" : "Waiting for payment";
}

interface Opened {
  intent: Intent;
  uri: string;
  qr: string | null;
}

interface BillingConfig {
  recipient?: string;
  mint?: string;
  cluster?: string;
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as { ok?: boolean; error?: string; pending?: boolean; signature?: string };
}

function DepositForm({ wallet, onWallet }: { wallet: string; onWallet: (w: string) => void }) {
  const [dollars, setDollars] = useState("10");
  const [asset, setAsset] = useState<"SOL" | "USDC">("USDC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [opened, setOpened] = useState<Opened>();
  const [notice, setNotice] = useState<string>();

  const open = useCallback(async () => {
    setError(undefined);
    setNotice(undefined);
    const amount = Math.round(Number(dollars) * 1_000_000);
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter a positive amount in dollars.");
    setBusy(true);
    try {
      const answer = (await post("/api/billing/deposits", { wallet, asset, amount })) as {
        ok?: boolean;
        error?: string;
        intent?: Intent;
        uri?: string;
        qr?: string | null;
      };
      if (!answer.ok || !answer.intent || !answer.uri) return setError(answer.error ?? "The payment could not be opened.");
      setOpened({ intent: answer.intent, uri: answer.uri, qr: answer.qr ?? null });
    } finally {
      setBusy(false);
    }
  }, [dollars, wallet, asset]);

  const check = useCallback(async () => {
    if (!opened) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const answer = await post("/api/billing/deposits/confirm", { reference: opened.intent.reference });
      if (answer.ok && answer.signature) return setNotice("Payment finalized — the credit is on your balance.");
      if (answer.pending) return setNotice("No finalized payment yet. Send the transfer, then check again.");
      if (answer.error) setError(answer.error);
    } finally {
      setBusy(false);
    }
  }, [opened]);

  if (opened) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <CardTitle>Send {atomicDecimal(opened.intent)}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Pay this link from the wallet the intent names — the transfer carries the intent's reference, so it can
          only pay this request.
        </p>
        {opened.qr && <img src={opened.qr} alt="Solana Pay QR" className="h-52 w-52 self-center" />}
        <a href={opened.uri} className="break-all text-sm text-primary underline">
          {opened.uri}
        </a>
        <div className="flex gap-2">
          <Button onClick={check} loading={busy}>
            Check payment
          </Button>
          <Button variant="ghost" onClick={() => setOpened(undefined)}>
            New payment
          </Button>
        </div>
        {notice && <Alert>{notice}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle>Add credit</CardTitle>
      <label className="flex flex-col gap-1 text-sm">
        Wallet that will pay
        <Input value={wallet} onChange={(e) => onWallet(e.target.value)} placeholder="Solana address" />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Amount (USD)
          <Input value={dollars} onChange={(e) => setDollars(e.target.value)} inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Asset
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value as "SOL" | "USDC")}
            className="rounded-md border border-input bg-background px-3 py-2"
          >
            <option value="USDC">USDC</option>
            <option value="SOL">SOL</option>
          </select>
        </label>
      </div>
      <Button onClick={open} loading={busy} disabled={wallet.trim() === ""}>
        Create payment link
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
    </Card>
  );
}

function BillingConsole() {
  const ledger = useRemote<Ledger>("billing-ledger");
  const deposits = useRemote<Deposits>("billing-deposits");
  const [wallet, setWallet] = useState(() => localStorage.getItem("billing.wallet") ?? "");
  const [config, setConfig] = useState<BillingConfig>();

  useEffect(() => localStorage.setItem("billing.wallet", wallet), [wallet]);
  useEffect(() => {
    void fetch("/api/billing/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: BillingConfig | null) => c && setConfig(c));
  }, []);

  const balance = ledger.state?.balance;
  const mine = deposits.state?.intents.filter((i) => i.wallet === wallet) ?? [];
  const entries = ledger.state?.entries.filter((e) => e.wallet === wallet) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <Card className="flex flex-col gap-1 p-5">
        <CardTitle>Balance</CardTitle>
        <p className="font-serif text-4xl">{balance === undefined ? "—" : creditDecimal(balance)}</p>
        <p className="text-sm text-muted-foreground">Compute credit, in dollars.</p>
      </Card>
      {config?.recipient ? (
        <DepositForm wallet={wallet} onWallet={setWallet} />
      ) : (
        <Alert>Checkout is not configured on this deployment.</Alert>
      )}
      {mine.length > 0 && (
        <Card className="flex flex-col gap-3 p-5">
          <CardTitle>Deposits</CardTitle>
          {mine
            .slice()
            .reverse()
            .map((intent) => (
              <div key={intent.reference} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{creditDecimal(intent.amount)}</span>
                <span className="text-muted-foreground">{intent.asset}</span>
                <span className="text-muted-foreground">{statusOf(intent)}</span>
              </div>
            ))}
        </Card>
      )}
      {entries.length > 0 && (
        <Card className="flex flex-col gap-3 p-5">
          <CardTitle>History</CardTitle>
          {entries
            .slice()
            .reverse()
            .map((entry, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{entry.kind}</span>
                <span className="text-muted-foreground">{entry.detail}</span>
                <span>{creditDecimal(entry.amount)}</span>
              </div>
            ))}
        </Card>
      )}
    </main>
  );
}

export function render(page: Page): React.ReactNode {
  if (page.tag === "Console" && page.section === "Billing") return <BillingConsole />;
  return null;
}
