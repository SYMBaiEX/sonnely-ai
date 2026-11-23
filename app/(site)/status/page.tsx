import Link from "next/link";
import { ArrowUpRight, CircleCheck, CircleAlert } from "lucide-react";
import { SiteLead } from "@/components/site-lead";
import { serviceHealth } from "@/lib/health";

export const metadata = { title: "Service status" };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const health = await serviceHealth();
  const probeStates = Object.values(health.probes);
  const routingLabel = probeStates.every((state) => state === "ok")
    ? "Operational"
    : probeStates.some((state) => state === "ok")
      ? "Degraded"
      : probeStates.some((state) => state === "unavailable")
        ? "Unavailable"
        : probeStates.some((state) => state === "disabled")
          ? "Disabled"
          : "Check pending";
  const services = [
    ["Account service", health.checks.accountService, "Connected", "Unavailable"],
    ["Inference routing", probeStates.every((state) => state === "ok"), "Operational", routingLabel],
    ["Mainnet USDC", health.checks.mainnetPaymentsConfigured, "Configured", "Unavailable"],
    ["Deposit recovery", health.checks.depositRecovery, "Running", "Check pending"],
  ] as const;
  return (
    <div className="wrap inner-page market-page">
      <SiteLead
        title="Service status"
        status={health.status === "ok" ? "Checks passed" : "Check needs attention"}
        description={
          health.status === "ok"
            ? "Account and payment recovery checks passed."
            : "One or more service checks need attention."
        }
      />
      <section className="panel status-board" aria-labelledby="status-checks">
        <header>
          <h2 id="status-checks">Workspace checks</h2>
          <span className="market-status">Access mode · {health.mode}</span>
        </header>
        <dl>
          {services.map(([name, ok, ready, unavailable]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                {ok ? (
                  <CircleCheck size={17} aria-hidden="true" />
                ) : (
                  <CircleAlert size={17} aria-hidden="true" />
                )}
                {ok ? ready : unavailable}
              </dd>
            </div>
          ))}
        </dl>
        <p className="caption">
          Provider catalog checks measure connectivity. They do not send billable requests.
        </p>
        <div className="actions">
          <Link className="text-link" href="/api/health">
            Health endpoint <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <Link className="text-link" href="/observability#alerts">
            How inference alerts work <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
