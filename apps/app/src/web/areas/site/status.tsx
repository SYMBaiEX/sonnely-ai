// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight, CircleAlert, CircleCheck, Clock, RefreshCw, Activity } from "lucide-react";
import { useState } from "react";
import { overall, routingUp } from "../../../../gen/app__site.effect.vibe";
import type { Board, ProbeState, Report } from "../../../../gen/app__site.ts";
import type { Registry } from "../../../../gen/app__admin.ts";
import { useRemote } from "../../remote.ts";
import { useSession } from "../../session.ts";
import { CorrespondenceHero } from "./chrome.tsx";
import { caption, textLink } from "./ui.ts";

const checkExplanations: Record<string, string> = {
  "Account service": "The workspace store behind sign-in, API keys, and billing records.",
  "Inference routing": "Connectivity to each provider's model catalog, checked with provider credentials.",
  "Mainnet USDC": "Solana mainnet payment configuration for checkout and credit settlement.",
  "Deposit recovery": "The watcher that credits payments sent while a checkout session was closed.",
};

const stateExplanations: Record<ProbeState, [string, string]> = {
  Ok: ["Reachable", "The provider answered the catalog check within the timeout."],
  Down: ["Down", "The provider did not answer the catalog check within four seconds."],
  Pending: ["Pending", "The check has not completed yet."],
  Disabled: [
    "Disabled",
    "No API key is configured for this provider in this deployment, or an operator paused it. This is configuration, not an outage.",
  ],
};

function services(report: Report) {
  const probes = report.probes.map((probe) => probe.state);
  const up = routingUp(report);
  const disabledCount = probes.filter((state) => state === "Disabled").length;
  const routingLabel = up
    ? disabledCount > 0
      ? `Operational · ${disabledCount} disabled`
      : "Operational"
    : probes.some((state) => state === "Ok")
      ? "Degraded"
      : probes.some((state) => state === "Down")
        ? "Unavailable"
        : "Check pending";
  return [
    ["Account service", report.accountUp, "Connected", "Unavailable"],
    ["Inference routing", up, routingLabel, routingLabel],
    ["Mainnet USDC", report.mainnetUp, "Configured", "Unavailable"],
    ["Deposit recovery", report.recoveryUp, "Running", "Check pending"],
  ] as const;
}

const checkedAtFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

function useReceivedAt(report: Report | undefined) {
  const [stamp, setStamp] = useState<{ report: Report; at: number } | undefined>(undefined);
  if (report && stamp?.report !== report) {
    const at = Date.now();
    setStamp({ report, at });
    return at;
  }
  return report ? stamp?.at : undefined;
}

export function StatusPage() {
  const { state, error } = useRemote<Board>("site");
  const session = useSession();
  const admin = useRemote<Registry>("admin");
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : "";
  const isOperator = Boolean(wallet && admin.state?.ops.roster.some((row) => row.wallet === wallet));
  const report = state?.tag === "Live" ? state.report : undefined;
  const healthy = report ? overall(report) === "Healthy" : undefined;
  const receivedAt = useReceivedAt(report);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  async function runCheck() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      const response = await fetch("/api/site/status", { method: "POST" });
      if (!response.ok) setRefreshError("The check request was not accepted.");
    } catch {
      setRefreshError("Could not reach the gateway for a fresh check.");
    } finally {
      setRefreshing(false);
    }
  }

  const upCount = report ? services(report).filter(([, ok]) => ok).length : 0;

  return (
    <div className="wrap cor-page cor-status-page">
      <CorrespondenceHero
        eyebrow="Service status · Sonnely"
        title="Live checks, on the record."
        description="What the gateway last measured of its account store, inference routing, payment configuration and deposit recovery."
        brief={{
          title: "Latest report",
          rows: [
            ["Board", healthy === undefined ? "Check pending" : healthy ? "Healthy" : "Needs attention"],
            ["Checks up", report ? `${upCount} of 4` : "—"],
            ["Providers", report ? `${report.probes.filter((probe) => probe.state === "Ok").length} reachable` : "—"],
          ],
        }}
        actionsLabel="Status actions"
        asideLabel="Latest report"
      >
        <a href="/api/health">
          Health endpoint <ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <a href="/docs/troubleshooting">
          Errors and recovery <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </CorrespondenceHero>

      <section className="cor-sheet cor-status-board" aria-labelledby="status-checks">
        <header className="cor-sheet-head">
          <div>
            <span>Workspace checks</span>
            <h2 id="status-checks">What the board measures</h2>
          </div>
          <span className="cor-stamp" aria-hidden="true"><Activity size={20} /></span>
        </header>
        <dl className="status-checks">
          {(report ? services(report) : []).map(([name, ok, ready, unavailable]) => (
            <div key={name}>
              <dt>
                {name}
                <small>{checkExplanations[name]}</small>
              </dt>
              <dd>
                {ok ? (
                  <CircleCheck size={17} aria-hidden="true" className="text-ok" />
                ) : (
                  <CircleAlert size={17} aria-hidden="true" className="text-warn" />
                )}
                {ok ? ready : unavailable}
              </dd>
            </div>
          ))}
        </dl>
        {report && (
          <>
            <h3 className="status-subhead">Provider connectivity</h3>
            <ul className="status-probes" role="list" aria-label="Provider connectivity">
              {report.probes.map((probe) => (
                <li key={probe.provider} data-state={probe.state} className="status-probe">
                  {probe.label} · {probe.state === "Ok" ? "Reachable" : probe.state}
                </li>
              ))}
            </ul>
            <ul className="status-legend" role="list" aria-label="What the provider states mean">
              {(Object.keys(stateExplanations) as ProbeState[]).map((state) => (
                <li key={state}>
                  <span data-state={state} className="status-probe">
                    {stateExplanations[state][0]}
                  </span>
                  <p>{stateExplanations[state][1]}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        <footer className="status-meta">
          <p className={caption}>
            <Clock size={13} aria-hidden="true" />
            {receivedAt
              ? "This report reached your browser at " +
                checkedAtFormat.format(new Date(receivedAt)) +
                ". The board shows the most recent check the gateway recorded."
              : "Waiting for the first report."}
          </p>
          {isOperator && (
            <button
              type="button"
              className="button quiet small"
              disabled={refreshing}
              onClick={() => void runCheck()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {refreshing ? "Checking…" : "Run a fresh check"}
            </button>
          )}
        </footer>
        <p className={caption}>
          Provider catalog checks measure connectivity with a four-second timeout. They do not
          send billable requests.
        </p>
        {(error || refreshError) && <p className={caption}>{error || refreshError}</p>}
      </section>

      <section className="cor-terms" aria-labelledby="status-notes">
        <header>
          <span>Reading this page</span>
          <h2 id="status-notes">Notes on checks</h2>
        </header>
        <div>
          <article>
            <h3>Incident history</h3>
            <p>
              This board reports live checks only; it does not yet publish an incident timeline.
              Scheduled inference alerts flag request errors, high latency, and pending billing
              recovery for operators, who review open and resolved incidents in the operations
              console.
            </p>
            <p>
              If a check you depend on looks wrong, include the state you see and the approximate
              time in a support request.
            </p>
            <a className={textLink} href="/contact">
              Report a problem <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </article>
          <article>
            <h3>Configuration, not outage</h3>
            <p>
              Workspace checks cover the account store, inference routing, payment configuration,
              and deposit recovery. A deployment can intentionally disable providers or payment
              recovery, so a disabled state reflects configuration rather than a failure.
            </p>
            <p>
              Your browser receives updates over a live stream while this page is open. Reloading
              the page shows the most recent stored report.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
