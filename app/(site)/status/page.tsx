import Link from "next/link";
import { serviceHealth } from "@/lib/health";

export const metadata = { title: "Service status" };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const health = await serviceHealth();
  return (
    <div className="wrap inner-page">
      <header className="page-lead">
        <h1>Service status</h1>
        <p>
          {health.status === "ok"
            ? "Configured services are responding."
            : "One or more service checks need attention."}
        </p>
      </header>
      <section className="panel stack-panel">
        <h2>Solana inference workspace</h2>
        <dl className="admin-metrics">
          <div>
            <dt>Access mode</dt>
            <dd>{health.mode}</dd>
          </div>
          <div>
            <dt>Account service</dt>
            <dd>{health.checks.accountService ? "Connected" : "Unavailable"}</dd>
          </div>
          <div>
            <dt>NEAR AI</dt>
            <dd>{health.checks.providerConfigured ? "Configured" : "Unavailable"}</dd>
          </div>
          <div>
            <dt>Phala</dt>
            <dd>{health.checks.phalaConfigured ? "Configured" : "Unavailable"}</dd>
          </div>
          <div>
            <dt>Tinfoil</dt>
            <dd>{health.checks.tinfoilConfigured ? "Configured" : "Unavailable"}</dd>
          </div>
          <div>
            <dt>Mainnet USDC</dt>
            <dd>{health.checks.mainnetPaymentsConfigured ? "Configured" : "Unavailable"}</dd>
          </div>
          <div>
            <dt>Deposit recovery</dt>
            <dd>{health.checks.depositRecovery ? "Running" : "Check pending"}</dd>
          </div>
        </dl>
        <p className="caption">
          Provider configuration is checked without sending a prompt or making a billable request.
        </p>
        <div className="actions">
          <Link className="text-link" href="/api/health">
            Health endpoint
          </Link>
          <Link className="text-link" href="/observability#alerts">
            How inference alerts work
          </Link>
        </div>
      </section>
    </div>
  );
}
