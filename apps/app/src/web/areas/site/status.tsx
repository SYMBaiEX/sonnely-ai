// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight, CircleAlert, CircleCheck } from "lucide-react";
import { overall, routingUp } from "../../../../gen/app__site.effect.vibe";
import type { Board, Report } from "../../../../gen/app__site.ts";
import { useRemote } from "../../remote.ts";
import { SiteLead } from "./chrome.tsx";
import { caption, panel, pill, textLink, wrap } from "./ui.ts";

function services(report: Report) {
  const probes = report.probes.map((probe) => probe.state);
  const allOk = probes.length > 0 && probes.every((state) => state === "Ok");
  const routingLabel = allOk
    ? "Operational"
    : probes.some((state) => state === "Ok")
      ? "Degraded"
      : probes.some((state) => state === "Down")
        ? "Unavailable"
        : probes.some((state) => state === "Disabled")
          ? "Disabled"
          : "Check pending";
  return [
    ["Account service", report.accountUp, "Connected", "Unavailable"],
    ["Inference routing", routingUp(report) && allOk, "Operational", routingLabel],
    ["Mainnet USDC", report.mainnetUp, "Configured", "Unavailable"],
    ["Deposit recovery", report.recoveryUp, "Running", "Check pending"],
  ] as const;
}

const probeColors: Record<string, string> = {
  Ok: "border-ok/40 bg-ok/10 text-ok",
  Down: "border-warn/40 bg-warn/10 text-warn",
  Pending: "border-border bg-secondary text-muted-foreground",
  Disabled: "border-border bg-secondary text-muted-foreground",
};

export function StatusPage() {
  const { state, error } = useRemote<Board>("site");
  const report = state?.tag === "Live" ? state.report : undefined;
  const healthy = report ? overall(report) === "Healthy" : undefined;
  return (
    <div className={wrap + " inner-page market-page"}>
      <SiteLead
        title="Service status"
        status={
          healthy === undefined
            ? "Check pending"
            : healthy
              ? "Checks passed"
              : "Check needs attention"
        }
        description={
          healthy === undefined
            ? "Waiting for the first report from the status board."
            : healthy
              ? "Account and payment recovery checks passed."
              : "One or more service checks need attention."
        }
      />
      <section className={panel + " grid gap-5"} aria-labelledby="status-checks">
        <header className="flex items-center justify-between gap-4">
          <h2 id="status-checks" className="text-lg font-medium">
            Workspace checks
          </h2>
          <span className={pill}>Access mode · public</span>
        </header>
        <dl className="grid gap-2.5">
          {(report ? services(report) : []).map(([name, ok, ready, unavailable]) => (
            <div key={name} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{name}</dt>
              <dd className="inline-flex items-center gap-1.5">
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
          <ul className="flex flex-wrap gap-2" role="list" aria-label="Provider connectivity">
            {report.probes.map((probe) => (
              <li
                key={probe.provider}
                data-state={probe.state}
                className={
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium " +
                  (probeColors[probe.state] ?? probeColors.Pending)
                }
              >
                {probe.label} · {probe.state === "Ok" ? "Reachable" : probe.state}
              </li>
            ))}
          </ul>
        )}
        <p className={caption}>
          Provider catalog checks measure connectivity. They do not send billable requests.
        </p>
        {error && <p className={caption}>{error}</p>}
        <div className="flex flex-wrap gap-4">
          <a className={textLink} href="/api/health">
            Health endpoint <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <a className={textLink} href="/observability#alerts">
            How inference alerts work <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
