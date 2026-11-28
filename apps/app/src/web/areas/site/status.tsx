// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight, CircleAlert, CircleCheck, Clock, RefreshCw, Activity } from "lucide-react";
import { useState } from "react";
import { Button, Card } from "@repo/ui";
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
    <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-4 pb-16 md:px-8 xl:px-12">
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

      <Card asChild className="gap-5" aria-labelledby="status-checks"><section>
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <span className="font-mono text-micro uppercase tracking-micro text-primary">Workspace checks</span>
            <h2 id="status-checks" className="mt-1 [font-family:var(--font-serif)] text-heading font-medium tracking-tight">What the board measures</h2>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/40 text-primary" aria-hidden="true"><Activity size={20} /></span>
        </header>
        <dl className="grid">
          {(report ? services(report) : []).map(([name, ok, ready, unavailable]) => (
            <div key={name} className="flex flex-wrap items-start justify-between gap-2 border-t border-border py-4 first:border-t-0">
              <dt className="max-w-xl text-ui font-medium">
                {name}
                <small className="mt-1 block text-meta font-regular text-muted-foreground">{checkExplanations[name]}</small>
              </dt>
              <dd className="inline-flex items-center gap-1.5 text-ui">
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
            <h3 className="pt-2 text-ui font-medium">Provider connectivity</h3>
            <ul className="flex flex-wrap gap-2" role="list" aria-label="Provider connectivity">
              {report.probes.map((probe) => (
                <li key={probe.provider} data-state={probe.state} className="inline-flex min-h-7 items-center rounded-full border border-border bg-secondary px-2.5 text-micro font-medium text-muted-foreground data-[state=Down]:border-warn/30 data-[state=Down]:bg-warn/10 data-[state=Down]:text-warn data-[state=Ok]:border-ok/30 data-[state=Ok]:bg-ok/10 data-[state=Ok]:text-ok">
                  {probe.label} · {probe.state === "Ok" ? "Reachable" : probe.state}
                </li>
              ))}
            </ul>
            <ul className="grid gap-3" role="list" aria-label="What the provider states mean">
              {(Object.keys(stateExplanations) as ProbeState[]).map((state) => (
                <li key={state} className="grid gap-2 sm:grid-cols-[max-content_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <span data-state={state} className="inline-flex min-h-7 items-center rounded-full border border-border bg-secondary px-2.5 text-micro font-medium text-muted-foreground data-[state=Down]:border-warn/30 data-[state=Down]:bg-warn/10 data-[state=Down]:text-warn data-[state=Ok]:border-ok/30 data-[state=Ok]:bg-ok/10 data-[state=Ok]:text-ok">
                    {stateExplanations[state][0]}
                  </span>
                  <p className="text-meta text-muted-foreground">{stateExplanations[state][1]}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className={caption}>
            <Clock size={13} aria-hidden="true" />
            {receivedAt
              ? "This report reached your browser at " +
                checkedAtFormat.format(new Date(receivedAt)) +
                ". The board shows the most recent check the gateway recorded."
              : "Waiting for the first report."}
          </p>
          {isOperator && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={refreshing}
              onClick={() => void runCheck()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {refreshing ? "Checking…" : "Run a fresh check"}
            </Button>
          )}
        </footer>
        <p className={caption}>
          Provider catalog checks measure connectivity with a four-second timeout. They do not
          send billable requests.
        </p>
        {(error || refreshError) && <p className={caption}>{error || refreshError}</p>}
      </section></Card>

      <section className="grid gap-6 border-t border-border pt-8" aria-labelledby="status-notes">
        <header>
          <span className="font-mono text-micro uppercase tracking-micro text-primary">Reading this page</span>
          <h2 id="status-notes" className="mt-1 [font-family:var(--font-serif)] text-heading font-medium tracking-tight">Notes on checks</h2>
        </header>
        <div className="grid gap-6 md:grid-cols-2">
          <article className="grid gap-3 text-body text-muted-foreground">
            <h3 className="text-ui font-medium text-foreground">Incident history</h3>
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
          <article className="grid gap-3 text-body text-muted-foreground">
            <h3 className="text-ui font-medium text-foreground">Configuration, not outage</h3>
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
