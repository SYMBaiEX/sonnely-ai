"use client";

import { useEffect, useEffectEvent, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Code2,
  FileText,
  KeyRound,
  Plus,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { models, shorten, usd } from "@/lib/models";
import { creditBalance, parseCreditAmount } from "@/lib/credit-amount";
import { CopyButton } from "./shared";
import type { Theme } from "@/lib/appearance";
import { payWithWallet, request, type Session, type UsageRow } from "./wallet";

type Profile = Session["profile"] | undefined;
export type Preferences = { theme: Theme; localHistory: boolean; plain: boolean };

const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    time,
  );
const shortDate = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(time);
const day = (time: number) => new Date(time).toISOString().slice(0, 10);

function Title({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="console-title section-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}

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
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    if (enabled)
      void request<T>(route)
        .then((result) => {
          if (alive) setData(result);
        })
        .catch((err) => {
          if (alive) setError(err instanceof Error ? err.message : "Could not load this page.");
        });
    return () => {
      alive = false;
    };
  }, [enabled, route, version]);
  return { data, error, reload: () => setVersion((value) => value + 1) };
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
      <Title title="API keys" description="Manage credentials, budgets, and expiration for your workspace.">
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
      </Title>
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
            <h2>Revoke {revoke.name}?</h2>
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
      <div className="panel">
        {signedIn && data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {["Name", "Key", "Created", "Last used", "Daily / total", "Status", "Actions"].map(
                    (label) => (
                      <th key={label}>{label}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.name}</th>
                    <td>
                      <code>{item.prefix}…</code>
                    </td>
                    <td>{date(item.created)}</td>
                    <td>{item.lastUsed ? date(item.lastUsed) : "—"}</td>
                    <td>
                      {item.dailyCap !== null ? usd(item.dailyCap) : "—"} /{" "}
                      {item.cap !== null ? usd(item.cap) : "—"}
                    </td>
                    <td>
                      <span className="pill">
                        {item.revoked
                          ? "Revoked"
                          : item.expires && item.expires < Date.now()
                            ? "Expired"
                            : "Active"}
                      </span>
                    </td>
                    <td>
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
            title={signedIn && !data && !error ? "Loading keys…" : "No API keys to show"}
            icon={<KeyRound size={23} />}
          >
            <p>
              {signedIn
                ? "Create a key to call the API from your own client."
                : "Connect a Solana wallet to open your workspace."}
            </p>
            <Link className="text-link" href="/docs#quickstart">
              Read the quickstart <ArrowUpRight size={15} />
            </Link>
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
  const [group, setGroup] = useState<"Model" | "Key">("Model");
  const [view, setView] = useState<"Chart" | "Table">("Chart");
  const { data, error } = useRemote<UsageRow[]>(signedIn, "usage?days=" + range);
  const rows = signedIn ? (liveRows ?? data ?? []) : [];
  const spend = rows.reduce((sum, row) => sum + (row.status === "complete" ? row.cost : 0), 0);
  const held = rows.reduce(
    (sum, row) => sum + (["pending", "unreported"].includes(row.status) ? row.cost : 0),
    0,
  );
  const tokens = rows.reduce((sum, row) => sum + row.input + row.output, 0);
  const grouped = Map.groupBy(rows, (row) => (group === "Model" ? row.model : row.keyName));
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
      <Title title="Usage" description="Track model requests, tokens, and spend. All dates are UTC.">
        <label className="control-label">
          Date range
          <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </Title>
      <Failure message={liveRows ? "" : error} />
      <div className="stat-grid">
        {[
          ["Credit balance", balance === undefined ? "—" : creditBalance(balance)],
          ["Spend", signedIn ? usd(spend) : "—"],
          ["Requests", signedIn ? rows.length : "—"],
          ["Tokens", signedIn ? tokens.toLocaleString() : "—"],
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
            <p>
              {signedIn
                ? liveRows || data || error
                  ? "No activity in this period."
                  : "Loading activity…"
                : "Connect a wallet to see request activity."}
            </p>
          </div>
        ) : view === "Chart" ? (
          <>
            <div className="bars" role="img" aria-label={metric + " by day over the last " + range + " days"}>
              {series.map(({ time, value }) => (
                <span
                  key={time}
                  title={shortDate(time) + " · " + (metric === "Spend" ? usd(value) : value)}
                  style={{ height: Math.max(2, (value / high) * 100) + "%" }}
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
          <h2>Request breakdown</h2>
          <div className="segmented" aria-label="Group usage">
            {(["Model", "Key"] as const).map((value) => (
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
          <div className="table-wrap">
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
                    <th scope="row">{models.find((model) => model.id === label)?.name ?? label}</th>
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
          <p className="caption">No request breakdown for this period.</p>
        )}
      </section>
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
  const [sol, setSol] = useState("1");
  const [intent, setIntent] = useState<{
    amountOut: string;
    minAmountOut: string;
    timeEstimate?: number;
  } | null>(null);
  const [order, setOrder] = useState<Payment | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState("");
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
      <Title title="Billing" description="Add compute credits and track wallet payments." />
      <Failure message={failure || error} />
      {status && (
        <p role="status" className="status">
          {status}
        </p>
      )}
      <div className="billing-grid">
        <section className="panel stack-panel">
          <div className="between">
            <h2>Compute balance</h2>
            <Wallet size={21} />
          </div>
          <p className="amount">{profile ? creditBalance(profile.balance) : "—"}</p>
          <p className="caption">Available for managed inference.</p>
          <Link className="text-link" href="/models">
            View token rates <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="panel stack-panel buy-credits">
          <div className="between">
            <h2>Buy credits</h2>
            <span className="pill">
              {session?.billingEnabled ? session.cluster : profile ? "Pilot access" : "Solana Pay"}
            </span>
          </div>
          <p className="caption">
            {profile
              ? "Choose an amount in USDC. Credits post after your wallet transfer finalizes."
              : "Connect your Solana wallet in the header to check checkout access."}
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
        <section className="panel stack-panel">
          <div className="between">
            <h2>NEAR Intents</h2>
            <span className="pill">Quote only</span>
          </div>
          <p className="caption">Estimate what a SOL-to-USDC swap would return. Quotes do not move funds.</p>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              setIntent(null);
              void run("quote", async () => setIntent(await request("quote", { sol: Number(sol) })));
            }}
          >
            <label>
              Amount in SOL
              <input
                type="number"
                required
                min="0.01"
                max="1000"
                step="0.01"
                value={sol}
                onChange={(e) => {
                  setSol(e.target.value);
                  setIntent(null);
                }}
              />
            </label>
            <button className="button quiet" disabled={!profile || !!pending}>
              {pending === "quote" ? "Quoting…" : "Get quote"}
            </button>
          </form>
          {intent && (
            <p role="status" className="status">
              {usd(Number(intent.amountOut))} estimated · {usd(Number(intent.minAmountOut))} minimum
            </p>
          )}
        </section>
      </div>
      <section className="panel breakdown">
        <h2>Payment history</h2>
        {profile && data?.length ? (
          <div className="table-wrap">
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
                        <button
                          className="button quiet small"
                          type="button"
                          disabled={!!pending}
                          onClick={() => {
                            if (order?.reference !== item.reference)
                              void run("resume", () => resumePayment(item.reference));
                          }}
                        >
                          Resume payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="caption">
            {profile
              ? "No payments to show."
              : "Connect a wallet to view payment history and request quotes."}
          </p>
        )}
      </section>
    </>
  );
}

export function Referrals({ profile }: { profile: Profile }) {
  const { data, error } = useRemote<{ wallet: string; time: number }[]>(Boolean(profile), "referrals");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = profile ? origin + "/console?ref=" + profile.referral : "";
  return (
    <>
      <Title title="Referrals" description="Invite someone to Sonnely and see verified wallet sign-ups." />
      <Failure message={error} />
      <section className="panel callout">
        <div>
          <span className="empty-icon">
            <Users size={22} />
          </span>
          <h2>Your invite link</h2>
          {profile && origin ? (
            <code className="secret-code">{url}</code>
          ) : (
            <p>Connect a Solana wallet to get your personal invite link.</p>
          )}
        </div>
        {profile && origin && <CopyButton value={url} label="Copy invite link" />}
      </section>
      <section className="panel breakdown">
        <h2>Sign-ups</h2>
        {profile && data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Joined (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <code>{item.wallet}</code>
                    </td>
                    <td>{date(item.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="caption">{profile ? "No verified sign-ups yet." : "Sign in to view referrals."}</p>
        )}
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
      await request("profile", { name: fields.get("name") });
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
      <Title title="Settings" description="Manage your identity and device preferences." />
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
          <form className="settings-row" onSubmit={rename} key={profile.wallet + profile.name}>
            <label>
              Display name
              <input name="name" maxLength={60} defaultValue={profile.name} placeholder="Your name" />
            </label>
            <button className="button quiet" type="submit" disabled={busy}>
              Save name
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
        <Link className="button quiet" href="/docs#privacy">
          <FileText size={17} /> Data handling
        </Link>
        <Link className="button quiet" href="/contact">
          <CircleHelp size={17} /> Account support
        </Link>
      </div>
    </>
  );
}
