"use client";

import { UsageMax } from "./usage-max";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Code2,
  FileText,
  KeyRound,
  Plus,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { models, shorten, usd } from "@/lib/models";
import { providerNames } from "@/lib/provider-catalog";
import { creditBalance, parseCreditAmount } from "@/lib/credit-amount";
import { intentFunds, type FundingQuote, type IntentFund } from "@/lib/intent-funding";
import { MotionSwitch } from "./ambient-motion";
import { CopyButton } from "./shared";
import type { Theme } from "@/lib/appearance";
import { usernameHelp } from "@/lib/username";
import { payWithWallet, request, type Session, type UsageRow } from "./wallet";
import { WorkspaceHeading } from "./workspace-heading";

type Profile = Session["profile"] | undefined;
export type Preferences = { theme: Theme; localHistory: boolean; plain: boolean };

const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    time,
  );
const shortDate = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(time);
const day = (time: number) => new Date(time).toISOString().slice(0, 10);

function Empty({ title, children, icon }: { title: string; children: ReactNode; icon: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

function useRemote<T>(enabled: boolean, route: string) {
  const [state, setState] = useState<{ route: string; version: number; data?: T; error?: string }>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setState(undefined);
      return;
    }
    let alive = true;
    void request<T>(route)
      .then((data) => {
        if (alive) setState({ route, version, data });
      })
      .catch((error) => {
        if (alive)
          setState({
            route,
            version,
            error: error instanceof Error ? error.message : "Could not load this page.",
          });
      });
    return () => {
      alive = false;
    };
  }, [enabled, route, version]);
  const current = enabled && state?.route === route && state.version === version ? state : undefined;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    reload: () => setVersion((value) => value + 1),
  };
}

type Key = {
  id: string;
  created: number;
  name: string;
  prefix: string;
  cap: number | null;
  dailyCap: number | null;
  expires: number | null;
  revoked: boolean;
  lastUsed?: number;
};

export function Keys({ signedIn }: { signedIn: boolean }) {
  const { data, error, reload } = useRemote<Key[]>(signedIn, "keys");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<Key | null>(null);
  const revokeHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (revoke) revokeHeading.current?.focus();
  }, [revoke]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const cap = (field: string) => (fields.get(field) ? Number(fields.get(field)) : null);
    setBusy(true);
    setFailure("");
    setKey("");
    try {
      const expires = fields.get("expires");
      const result = await request<{ key: string }>("keys", {
        name: fields.get("name") || "Workspace key",
        cap: cap("cap"),
        dailyCap: cap("daily"),
        expires: expires ? Date.parse(String(expires) + "T23:59:59Z") : null,
      });
      setKey(result.key);
      setOpen(false);
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!revoke) return;
    setBusy(true);
    setFailure("");
    try {
      await request("revoke", { id: revoke.id });
      setRevoke(null);
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not revoke the key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <WorkspaceHeading
        icon={KeyRound}
        title="API keys"
        description="Issue keys, set spending limits, and revoke access."
      >
        <button
          type="button"
          className="button accent"
          disabled={!signedIn || open || busy}
          onClick={() => {
            setOpen(true);
            setKey("");
            setFailure("");
          }}
        >
          <Plus size={17} /> Create key
        </button>
      </WorkspaceHeading>
      <Failure message={failure || error} />
      {signedIn && !!key && (
        <section className="panel callout" aria-label="New API key">
          <div>
            <h2>Save your new key</h2>
            <p>Store it securely. The full key is shown once.</p>
            <code className="secret-code">{key}</code>
          </div>
          <div className="actions">
            <CopyButton value={key} label="Copy key" />
            <button type="button" className="button quiet" onClick={() => setKey("")}>
              Done
            </button>
          </div>
        </section>
      )}
      {signedIn && open && (
        <form className="panel stack-panel" onSubmit={create}>
          <h2>Create an API key</h2>
          <div className="form-row">
            <label>
              Name
              <input name="name" maxLength={60} placeholder="CI, notebook, or app" />
            </label>
            <label>
              Daily cap (USD)
              <input name="daily" type="number" min="0.01" step="0.01" placeholder="Optional" />
            </label>
            <label>
              Lifetime cap (USD)
              <input name="cap" type="number" min="0.01" step="0.01" placeholder="Optional" />
            </label>
            <label>
              Expires (UTC)
              <input name="expires" type="date" min={day(Date.now())} />
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="button accent" disabled={busy}>
              {busy ? "Creating…" : "Create key"}
            </button>
            <button type="button" className="button quiet" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {signedIn && revoke && (
        <div className="panel callout">
          <div>
            <h2 ref={revokeHeading} tabIndex={-1}>
              Revoke {revoke.name}?
            </h2>
            <p>Clients using this key will lose API access immediately.</p>
          </div>
          <div className="actions">
            <button className="button danger" type="button" onClick={disable} disabled={busy}>
              Revoke key
            </button>
            <button className="button quiet" type="button" onClick={() => setRevoke(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="panel key-records">
        {signedIn && data?.length ? (
          <div className="table-wrap">
            <table role="table" aria-label="Workspace API keys">
              <thead role="rowgroup">
                <tr role="row">
                  {["Name", "Key", "Status", "Last used", "Created", "Daily / total", "Actions"].map(
                    (label) => (
                      <th role="columnheader" scope="col" key={label}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {data.map((item) => (
                  <tr role="row" key={item.id}>
                    <th role="rowheader" scope="row">
                      {item.name}
                    </th>
                    <td role="cell" className="key-record-prefix">
                      <code>{item.prefix}…</code>
                    </td>
                    <td role="cell">
                      <span className="key-record-label" aria-hidden="true">
                        Status
                      </span>
                      <span className="pill">
                        {item.revoked
                          ? "Revoked"
                          : item.expires && item.expires < Date.now()
                            ? "Expired"
                            : "Active"}
                      </span>
                      {item.expires && !item.revoked ? (
                        <small className="key-record-expiry">Expires {date(item.expires)} UTC</small>
                      ) : null}
                    </td>
                    <td role="cell">
                      <span className="key-record-label" aria-hidden="true">
                        Last used
                      </span>
                      {item.lastUsed ? date(item.lastUsed) : "Never"}
                    </td>
                    <td role="cell">
                      <span className="key-record-label" aria-hidden="true">
                        Created
                      </span>
                      {date(item.created)}
                    </td>
                    <td role="cell">
                      <span className="key-record-label" aria-hidden="true">
                        Daily / total cap
                      </span>
                      {item.dailyCap !== null ? usd(item.dailyCap) : "—"} /{" "}
                      {item.cap !== null ? usd(item.cap) : "—"}
                    </td>
                    <td role="cell" className="key-record-action">
                      {!item.revoked && (
                        <button type="button" className="button quiet small" onClick={() => setRevoke(item)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              signedIn && error
                ? "API keys unavailable"
                : signedIn && !data
                  ? "Loading keys…"
                  : "No API keys to show"
            }
            icon={<KeyRound size={23} />}
          >
            <p>
              {!signedIn
                ? "Connect a Solana wallet to open your workspace."
                : error
                  ? "Try reloading the list."
                  : data
                    ? "Create a key to call the API from your own client."
                    : "Getting your workspace keys."}
            </p>
            {signedIn && error ? (
              <button className="button quiet small" type="button" onClick={reload}>
                Reload keys
              </button>
            ) : (
              <Link className="text-link" href="/docs/quickstart">
                Read the quickstart <ArrowUpRight size={15} />
              </Link>
            )}
          </Empty>
        )}
      </div>
    </>
  );
}

export function Usage({
  signedIn,
  balance,
  range,
  setRange,
  liveRows,
}: {
  signedIn: boolean;
  balance?: number;
  range: number;
  setRange: (range: number) => void;
  liveRows?: UsageRow[];
}) {
  const [metric, setMetric] = useState<"Spend" | "Tokens" | "Requests">("Spend");
  const [group, setGroup] = useState<"Model" | "Provider" | "Key">("Model");
  const [view, setView] = useState<"Chart" | "Table">("Chart");
  const { data, error } = useRemote<UsageRow[]>(signedIn, "usage?days=" + range);
  const usage = signedIn ? (liveRows ?? data) : null;
  const rows = usage ?? [];
  const loading = signedIn && !usage && !error;
  const activityStatus = !signedIn
    ? "Connect a wallet to see request activity."
    : loading
      ? "Loading activity…"
      : usage
        ? "No activity in this period."
        : "Activity is unavailable.";
  const spend = rows.reduce((sum, row) => sum + (row.status === "complete" ? row.cost : 0), 0);
  const held = rows.reduce(
    (sum, row) => sum + (["pending", "unreported"].includes(row.status) ? row.cost : 0),
    0,
  );
  const tokens = rows.reduce((sum, row) => sum + row.input + row.output, 0);
  const grouped = Map.groupBy(rows, (row) => {
    if (group === "Model") return models.find((model) => model.id === row.model)?.name ?? row.model;
    if (group === "Provider") return providerNames[row.provider] ?? "NEAR AI";
    return row.keyName;
  });
  const daily = Map.groupBy(rows, (row) => day(row.time));
  const series = Array.from({ length: range }, (_, i) => {
    const time = Date.now() - (range - i - 1) * 86400_000;
    const entries = daily.get(day(time)) ?? [];
    const value = entries.reduce(
      (sum, row) =>
        sum +
        (metric === "Spend"
          ? row.status === "complete"
            ? row.cost
            : 0
          : metric === "Tokens"
            ? row.input + row.output
            : 1),
      0,
    );
    return { time, value };
  });
  const high = Math.max(1, ...series.map((point) => point.value));
  return (
    <>
      <WorkspaceHeading
        icon={BarChart3}
        title="Usage"
        description="Track requests, tokens, and spend across models and providers. Dates are in UTC."
      >
        <label className="control-label">
          Date range
          <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </WorkspaceHeading>
      <Failure message={liveRows ? "" : error} />
      <div className="stat-grid">
        {[
          ["Credit balance", balance === undefined ? "—" : creditBalance(balance)],
          ["Spend", usage ? usd(spend) : "—"],
          ["Requests", usage ? rows.length : "—"],
          ["Tokens", usage ? tokens.toLocaleString() : "—"],
        ].map(([label, value]) => (
          <div className="panel stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {held > 0 && <p className="caption">Reserved for unreported or in-progress requests {usd(held)}.</p>}
      {rows.length === 1000 && (
        <p className="caption">Showing the 1,000 most recent requests in this period.</p>
      )}
      <section className="panel chart-panel">
        <div className="between controls">
          <h2>{metric} by day</h2>
          <div className="actions">
            <div className="segmented" aria-label="Chart metric">
              {(["Spend", "Tokens", "Requests"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={value === metric}
                  onClick={() => setMetric(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="segmented" aria-label="Chart view">
              {(["Chart", "Table"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={value === view}
                  onClick={() => setView(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!rows.length ? (
          <div className="chart-empty">
            <BarChart3 size={23} />
            <p role="status">{activityStatus}</p>
          </div>
        ) : view === "Chart" ? (
          <>
            <div className="bars" role="img" aria-label={metric + " by day over the last " + range + " days"}>
              {series.map(({ time, value }) => (
                <span
                  key={time}
                  title={shortDate(time) + " · " + (metric === "Spend" ? usd(value) : value)}
                  data-empty={!value || undefined}
                  style={{ height: value ? Math.max(1, (value / high) * 100) + "%" : "1px" }}
                />
              ))}
            </div>
            <div className="between caption">
              <span>{shortDate(series[0].time)}</span>
              <span>{shortDate(series[range - 1].time)}</span>
            </div>
          </>
        ) : (
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{metric}</th>
                </tr>
              </thead>
              <tbody>
                {series
                  .filter((point) => point.value)
                  .map(({ time, value }) => (
                    <tr key={time}>
                      <td>{date(time)}</td>
                      <td>{metric === "Spend" ? usd(value) : value}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel breakdown">
        <div className="between controls">
          <h2 id="request-breakdown">Request breakdown</h2>
          <div className="segmented" aria-label="Group usage">
            {(["Model", "Provider", "Key"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={value === group}
                onClick={() => setGroup(value)}
              >
                By {value.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        {grouped.size ? (
          <div
            className="table-wrap workspace-data-table"
            role="region"
            aria-labelledby="request-breakdown"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {[group, "Requests", "Failed", "Input", "Output", "Spend"].map((value) => (
                    <th key={value}>{value}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped, ([label, groupRows]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{groupRows.length}</td>
                    <td>{groupRows.filter((row) => row.status === "failed").length}</td>
                    <td>{groupRows.reduce((n, r) => n + r.input, 0)}</td>
                    <td>{groupRows.reduce((n, r) => n + r.output, 0)}</td>
                    <td>{usd(groupRows.reduce((n, r) => n + (r.status === "complete" ? r.cost : 0), 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="caption">
            {!signedIn
              ? "Connect a wallet to see the request breakdown."
              : loading
                ? "Loading request breakdown…"
                : usage
                  ? "No request breakdown for this period."
                  : "Request breakdown is unavailable."}
          </p>
        )}
      </section>
      {usage && <UsageMax days={range} hasUsage={rows.some((row) => row.status === "complete")} />}
    </>
  );
}

type Payment = { uri: string; reference: string; cluster: string; amount: number; qr: string };
type Confirmation = { ok: boolean; cluster: string };
type Receipt = { reference: string; cluster: string; amount: number; signature?: string; time: number };

export function Billing({ session, refresh }: { session: Session | null; refresh: () => Promise<void> }) {
  const profile = session?.profile;
  const { data, error, reload } = useRemote<Receipt[]>(Boolean(profile), "history");
  const [dollars, setDollars] = useState("5");
  const [fund, setFund] = useState<IntentFund>("sol");
  const [fundAmount, setFundAmount] = useState("0.1");
  const [refundTo, setRefundTo] = useState("");
  const [intent, setIntent] = useState<FundingQuote | null>(null);
  const fundingDetails = intent?.recipient === profile?.wallet ? intent : null;
  const swapAsset = intentFunds[fund];
  const [order, setOrder] = useState<Payment | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState("");
  const quoting = pending === "quote" || pending === "prepare-swap";
  const [failure, setFailure] = useState("");
  const [status, setStatus] = useState("");

  const reference = order?.reference;
  const wallet = profile?.wallet;

  async function finishPayment(cluster: string) {
    setStatus(cluster === "mainnet" ? "Payment confirmed. Credits added." : "Devnet payment verified.");
    setFailure("");
    setOrder(null);
    setSignature("");
    setSubmitted(false);
    reload();
    await refresh();
  }

  const reportFinality = useEffectEvent(finishPayment);
  useEffect(() => {
    if (!wallet || !reference || !session?.paymentVerificationEnabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const result = await request<Confirmation>("confirm", { reference });
        if (!stopped && result.ok) {
          await reportFinality(result.cluster);
          return;
        }
      } catch {
        // Keep the draft available if RPC finality checks are temporarily unavailable.
      }
      if (!stopped) timer = setTimeout(check, 8_000);
    }
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [reference, session?.paymentVerificationEnabled, wallet]);

  function openPayment(payment: Payment) {
    setOrder(payment);
    setSignature("");
    setSubmitted(false);
  }

  async function resumePayment(reference: string) {
    openPayment(await request<Payment>("payment?reference=" + encodeURIComponent(reference)));
  }

  async function run(name: string, action: () => Promise<void>) {
    setPending(name);
    setFailure("");
    setStatus("");
    try {
      await action();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The request failed.");
    } finally {
      setPending("");
    }
  }

  return (
    <>
      <WorkspaceHeading
        icon={Wallet}
        title="Billing"
        description="Add compute credits, check your balance, and track wallet payments."
      />
      <Failure message={failure || error} />
      {status && (
        <p role="status" className="status">
          {status}
        </p>
      )}
      <div className="billing-grid">
        <section className="panel stack-panel billing-balance">
          <div className="between">
            <h2>Compute balance</h2>
            <Wallet size={21} />
          </div>
          <p className="amount">{profile ? creditBalance(profile.balance) : "—"}</p>
          <p className="caption">Available for inference and compute.</p>
          <Link className="text-link" href="/models">
            View token rates <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="panel stack-panel buy-credits">
          <div className="between">
            <h2>Buy credits</h2>
            <span className="pill">{session?.billingEnabled ? session.cluster : "Solana Pay"}</span>
          </div>
          <p className="caption">
            {session?.termsRequired
              ? "Accept the current terms above to buy credits."
              : profile
                ? "Choose an amount in USDC. Credits post after your wallet transfer finalizes."
                : "Connect your Solana wallet in the header to buy credits."}
          </p>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run("deposit", async () => {
                const amount = parseCreditAmount(dollars);
                if (amount === null)
                  throw new Error("Enter a positive USDC amount with up to six decimal places.");
                if (order?.amount === amount) return;
                const existing = data?.find(
                  (item) => !item.signature && item.cluster === session?.cluster && item.amount === amount,
                );
                if (existing) await resumePayment(existing.reference);
                else {
                  openPayment(await request<Payment>("deposit", { dollars }));
                  reload();
                }
              });
            }}
          >
            <label>
              Amount in USDC
              <input
                type="number"
                min="0.000001"
                step="0.000001"
                inputMode="decimal"
                required
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
              />
            </label>
            <button
              className="button accent"
              disabled={!profile || !session?.billingEnabled || !!pending || submitted}
            >
              {pending === "deposit" ? "Preparing…" : "Continue to payment"}
            </button>
          </form>
          {order && profile && (
            <section className="checkout" aria-label="Review transfer">
              <div className="between">
                <h2>Pay {creditBalance(order.amount)} in USDC</h2>
                <span className="pill">{order.cluster}</span>
              </div>
              <p className="caption">
                Your wallet shows the transfer before you approve. A small SOL fee and token account setup may
                apply.
              </p>
              {submitted ? (
                <p role="status" className="status">
                  Payment submitted. Waiting for Solana finality…
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="button accent"
                    disabled={!session?.billingEnabled || !!pending}
                    onClick={() =>
                      void run("pay", async () => {
                        const sent = await payWithWallet(profile.wallet, order.reference, order.cluster);
                        setSignature(sent);
                        setSubmitted(true);
                      })
                    }
                  >
                    {pending === "pay" ? "Waiting for wallet…" : "Pay with connected wallet"}
                  </button>
                  <details>
                    <summary>Use a Solana Pay link or QR code</summary>
                    <div className="payment-qr">
                      <img src={order.qr} width={176} height={176} alt="Scan with a Solana Pay wallet" />
                      <div>
                        <p>Open the payment in a compatible wallet on {order.cluster}.</p>
                        <a className="button quiet" href={order.uri}>
                          Open in wallet <ArrowUpRight size={16} />
                        </a>
                        <CopyButton value={order.uri} label="Copy payment link" />
                      </div>
                    </div>
                  </details>
                </>
              )}
              <details>
                <summary>Check payment status</summary>
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run("confirm", async () => {
                      const result = await request<Confirmation>("confirm", {
                        reference: order.reference,
                        signature: signature.trim() || undefined,
                      });
                      if (result.ok) await finishPayment(result.cluster);
                      else setStatus("Waiting for a matching, finalized payment.");
                    });
                  }}
                >
                  <label>
                    Transaction signature (optional)
                    <input
                      minLength={64}
                      maxLength={88}
                      value={signature}
                      onChange={(event) => setSignature(event.target.value)}
                    />
                  </label>
                  <button
                    className="button quiet"
                    disabled={!session?.paymentVerificationEnabled || !!pending}
                  >
                    {pending === "confirm" ? "Checking…" : "Check now"}
                  </button>
                </form>
              </details>
            </section>
          )}
        </section>
        {session?.cluster === "mainnet" && (
          <section className="panel stack-panel">
            <div className="between">
              <h2>Fund with other crypto</h2>
              <span className="pill">NEAR Intents</span>
            </div>
            <p className="caption">Swap into Solana USDC in your connected wallet, then buy credits above.</p>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                setIntent(null);
                void run("quote", async () =>
                  setIntent(
                    await request<FundingQuote>("quote", {
                      asset: fund,
                      amount: fundAmount.trim(),
                      ...(fund !== "sol" ? { refundTo: refundTo.trim() } : {}),
                    }),
                  ),
                );
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
                <input
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
                  <input
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
              <button className="button quiet" disabled={!profile || !!pending}>
                {pending === "quote" ? "Quoting…" : "Get quote"}
              </button>
            </form>
            {fundingDetails && (
              <section className="checkout" aria-label="Swap details">
                <p role="status" className="status">
                  {creditBalance(Number(fundingDetails.amountOut))} estimated ·{" "}
                  {creditBalance(Number(fundingDetails.minAmountOut))} minimum
                </p>
                {fundingDetails.depositAddress ? (
                  <>
                    <p>
                      Send exactly{" "}
                      <strong>
                        {fundAmount.trim()} {swapAsset.symbol}
                      </strong>{" "}
                      on <strong>{swapAsset.network} mainnet</strong> to the address below before{" "}
                      {new Date(fundingDetails.deadline).toLocaleTimeString([], { timeZoneName: "short" })}.
                      Save the address and transaction ID.
                    </p>
                    <CopyButton value={fundingDetails.depositAddress} label="Copy swap deposit address" />
                    <code style={{ overflowWrap: "anywhere" }}>{fundingDetails.depositAddress}</code>
                    {fundingDetails.depositMemo && (
                      <>
                        <p>Include this memo with your transfer.</p>
                        <CopyButton value={fundingDetails.depositMemo} label="Copy deposit memo" />
                        <code style={{ overflowWrap: "anywhere" }}>{fundingDetails.depositMemo}</code>
                      </>
                    )}
                    <p className="caption">
                      Solana USDC goes to {shorten(fundingDetails.recipient)}. Refunds go to{" "}
                      {shorten(fundingDetails.refundTo)} on {swapAsset.network}. Once USDC arrives in your
                      wallet, use the USDC checkout above.
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    className="button accent"
                    disabled={!!pending || !session?.billingEnabled || session.termsRequired}
                    onClick={() =>
                      void run("prepare-swap", async () =>
                        setIntent(
                          await request<FundingQuote>("quote", {
                            asset: fund,
                            amount: fundAmount.trim(),
                            ...(fund !== "sol" ? { refundTo: refundTo.trim() } : {}),
                            prepare: true,
                          }),
                        ),
                      )
                    }
                  >
                    {pending === "prepare-swap" ? "Preparing…" : "Get swap deposit address"}
                  </button>
                )}
              </section>
            )}
          </section>
        )}
      </div>
      <section className="panel breakdown">
        <h2 id="payment-history">Payment history</h2>
        {profile && data?.length ? (
          <div
            className="table-wrap workspace-data-table payment-history"
            role="region"
            aria-labelledby="payment-history"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Date (UTC)</th>
                  <th>Network</th>
                  <th>USDC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.reference}>
                    <td>{date(item.time)}</td>
                    <td>{item.cluster}</td>
                    <td>{creditBalance(item.amount)}</td>
                    <td>
                      {item.signature ? (
                        <a
                          className="text-link"
                          href={
                            "https://explorer.solana.com/tx/" +
                            item.signature +
                            (item.cluster === "devnet" ? "?cluster=devnet" : "")
                          }
                        >
                          Finalized <ArrowUpRight size={13} />
                        </a>
                      ) : (
                        <div className="payment-status">
                          <span className="caption">Awaiting payment</span>
                          <button
                            className="text-link"
                            type="button"
                            aria-label="Resume payment"
                            disabled={!!pending}
                            onClick={() => {
                              if (order?.reference !== item.reference)
                                void run("resume", () => resumePayment(item.reference));
                            }}
                          >
                            Resume
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="caption" role="status">
            {!profile
              ? "Connect a wallet to view payment history and request quotes."
              : error
                ? "Payment history is unavailable."
                : data
                  ? "No payments to show."
                  : "Loading payment history…"}
          </p>
        )}
      </section>
    </>
  );
}

type ReferralRow = { username?: string; wallet: string; joined: number; funded: boolean; active: boolean };
type ReferralPage = { page: ReferralRow[]; isDone: boolean; continueCursor: string };

export function Referrals({ profile }: { profile: Profile }) {
  const [cursor, setCursor] = useState("");
  const [earlier, setEarlier] = useState<ReferralRow[]>([]);
  const { data, error, reload } = useRemote<ReferralPage>(
    Boolean(profile),
    "referral-pipeline" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
  );
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = profile ? origin + "/console?ref=" + profile.referral : "";
  const loading = Boolean(profile) && !data && !error;
  const rows = [...earlier, ...(data?.page ?? [])];
  return (
    <>
      <WorkspaceHeading
        icon={Users}
        title="Referrals"
        description="Track invitations from wallet sign-up through funding and first paid request."
      />
      <Failure message={error} />
      <section className="panel callout referral-invite">
        <div>
          <span className="empty-icon">
            <Users size={22} />
          </span>
          <h2>Your invite link</h2>
          {profile && origin ? (
            <>
              <p>
                {profile.username
                  ? "@" + profile.username
                  : "Add a username in Settings so referrals can recognize you."}
              </p>
              <code className="secret-code">{url}</code>
            </>
          ) : (
            <p>Connect a Solana wallet to get your personal invite link.</p>
          )}
        </div>
        {profile && origin && (
          <div className="actions">
            <CopyButton value={url} label="Copy invite link" />
            <Link href="/console/settings" className="button quiet">
              {profile.username ? "Edit username" : "Set username"}
            </Link>
          </div>
        )}
      </section>
      <section className="panel breakdown">
        <div className="between">
          <h2>Referral activity</h2>
          {profile && (
            <button
              className="button quiet small"
              disabled={loading}
              onClick={() => {
                setEarlier([]);
                setCursor("");
                reload();
              }}
            >
              Refresh
            </button>
          )}
        </div>
        {!!rows.length && (
          <>
            <p className="caption">
              Showing {rows.length} sign-ups · {rows.filter((row) => row.funded).length} funded ·{" "}
              {rows.filter((row) => row.active).length} active
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Joined (UTC)</th>
                    <th>Mainnet funding</th>
                    <th>Paid inference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, index) => (
                    <tr key={item.joined + ":" + item.wallet + ":" + index}>
                      <th scope="row">{item.username ? "@" + item.username : item.wallet}</th>
                      <td>{date(item.joined)}</td>
                      <td>{item.funded ? "Funded" : "Pending"}</td>
                      <td>{item.active ? "Active" : "Pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!rows.length && (
          <p className="caption" role="status">
            {!profile
              ? "Sign in to view referrals."
              : loading
                ? "Loading referrals…"
                : "No verified sign-ups yet."}
          </p>
        )}
        {data && !data.isDone && (
          <button
            className="button quiet small"
            disabled={loading}
            onClick={() => {
              setEarlier((items) => [...items, ...data.page]);
              setCursor(data.continueCursor);
            }}
          >
            Load more referrals
          </button>
        )}
        <p className="caption">
          An invite is recorded when a wallet signs in for the first time through your link.
        </p>
      </section>
    </>
  );
}

export function SettingsPanel({
  profile,
  refresh,
  preferences,
  change,
}: {
  profile: Profile;
  refresh: () => Promise<void>;
  preferences: Preferences;
  change: (next: Preferences) => void;
}) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("profile", { name: fields.get("name"), username: fields.get("username") });
      await refresh();
      setNotice("Profile saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <WorkspaceHeading
        icon={Settings}
        title="Settings"
        description="Edit your profile and choose how this device displays the console."
      />
      <Failure message={error} />
      {notice && (
        <p role="status" className="status">
          {notice}
        </p>
      )}
      <section className="panel stack-panel settings-panel">
        <div className="between">
          <h2>Workspace identity</h2>
          <Shield size={20} />
        </div>
        <div className="settings-row">
          <div>
            <strong>Solana wallet</strong>
            <p>{profile ? shorten(profile.wallet) : "Connect a wallet to manage your account."}</p>
          </div>
          {profile && <CopyButton value={profile.wallet} label="Copy address" />}
        </div>
        {profile && (
          <form
            className="settings-row"
            onSubmit={rename}
            key={profile.wallet + profile.name + (profile.username ?? "")}
          >
            <label>
              Display name
              <input name="name" maxLength={60} defaultValue={profile.name} placeholder="Your name" />
            </label>
            <label>
              Username
              <input
                name="username"
                aria-describedby="username-help"
                maxLength={24}
                defaultValue={profile.username ?? ""}
                placeholder="your_username"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span id="username-help" className="caption">
                {usernameHelp} Shown in referral activity.
              </span>
            </label>
            <button className="button quiet" type="submit" disabled={busy}>
              Save profile
            </button>
          </form>
        )}
      </section>
      <section className="panel stack-panel settings-panel">
        <div className="between">
          <h2>Preferences</h2>
          <Code2 size={20} />
        </div>
        <div className="settings-row">
          <div>
            <strong>Appearance</strong>
            <p>Choose the console theme.</p>
          </div>
          <div className="segmented">
            {(["system", "light", "dark"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={preferences.theme === value}
                onClick={() => change({ ...preferences, theme: value })}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>Ambient motion</strong>
            <p>Animate the background and the homepage request trace.</p>
          </div>
          <MotionSwitch />
        </div>
        <div className="settings-row">
          <div>
            <strong>Plain writing</strong>
            <p>Ask the chat model for concise, clear language.</p>
          </div>
          <button
            type="button"
            role="switch"
            className="toggle"
            aria-label="Plain writing"
            aria-checked={preferences.plain}
            onClick={() => change({ ...preferences, plain: !preferences.plain })}
          >
            <span />
          </button>
        </div>
        <div className="settings-row">
          <div>
            <strong>Save on this device</strong>
            <p>Turning this off clears saved Sonnely chats from this browser.</p>
          </div>
          <button
            type="button"
            role="switch"
            className="toggle"
            aria-label="Save on this device"
            aria-checked={preferences.localHistory}
            onClick={() => change({ ...preferences, localHistory: !preferences.localHistory })}
          >
            <span />
          </button>
        </div>
      </section>
      <div className="actions">
        <Link className="button quiet" href="/docs/attestation#data-handling">
          <FileText size={17} /> Data handling
        </Link>
        <Link className="button quiet" href="/contact">
          <CircleHelp size={17} /> Account support
        </Link>
      </div>
    </>
  );
}
