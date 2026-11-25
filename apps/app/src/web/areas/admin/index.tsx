// spec/app/admin/index.md: the Admin console section, gated on the operator directory the
// admin machine keeps, plus the Referrals console section.
import { ShieldCheck } from "lucide-react";
import type { Page } from "../../../../gen/app__nav.ts";
import { useAdmin, useOverview, useSession } from "./data.ts";
import { AdminAnalytics } from "./analytics.tsx";
import { AdminCustomers } from "./customers.tsx";
import { AdminGateway } from "./gateway.tsx";
import { AdminLogs } from "./logs.tsx";
import { AdminOperators } from "./operators.tsx";
import { AdminOverview } from "./overview.tsx";
import { AdminPrivacyRings } from "./privacy-rings.tsx";
import { AdminSupport } from "./support.tsx";
import { AdminTraces } from "./traces.tsx";
import { ReferralsPage } from "./referrals.tsx";
import { Skeleton, WorkspaceHeading } from "./ui.tsx";

export const adminAreas = [
  "overview",
  "customers",
  "support",
  "traces",
  "gateway",
  "operators",
  "privacy-rings",
  "analytics",
  "logs",
] as const;

type AdminArea = (typeof adminAreas)[number];

const adminNavGroups: { label?: string; tabs: { id: AdminArea; label: string }[] }[] = [
  { tabs: [{ id: "overview", label: "Overview" }] },
  {
    label: "Customers",
    tabs: [
      { id: "customers", label: "Customers" },
      { id: "support", label: "Support" },
      { id: "traces", label: "Traces" },
    ],
  },
  {
    label: "Operations",
    tabs: [
      { id: "gateway", label: "Inference ops" },
      { id: "operators", label: "Operators" },
      { id: "privacy-rings", label: "Privacy Rings" },
    ],
  },
  {
    label: "Insights",
    tabs: [
      { id: "analytics", label: "Analytics" },
      { id: "logs", label: "Logs" },
    ],
  },
];

function choose(area: AdminArea) {
  location.href = `/console/admin/${area}`;
}

function AdminWorkspace({ area }: { area: AdminArea }) {
  const session = useSession();
  const admin = useAdmin();
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const isOperator =
    wallet !== undefined && admin.state !== undefined && admin.state.ops.roster.some((o) => o.wallet === wallet);
  const { overview } = useOverview(wallet, isOperator);

  if (!session.state || !admin.state) {
    return <Skeleton label="Loading administrator workspace" />;
  }
  if (!isOperator) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-md border border-border bg-card p-10 text-center">
        <ShieldCheck size={21} aria-hidden="true" />
        <h2 className="text-lg font-medium">Administrator access required</h2>
        <p className="text-sm text-muted-foreground">Connect an authorized Solana wallet to view this workspace.</p>
      </section>
    );
  }

  const props = { admin: admin.state, wallet, overview, send: admin.send };
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="lg:hidden">
        <label htmlFor="admin-area-select" className="text-xs text-muted-foreground">
          Section
        </label>
        <select
          id="admin-area-select"
          value={area}
          onChange={(event) => choose(event.target.value as AdminArea)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          {adminNavGroups.map((group) =>
            group.label ? (
              <optgroup key={group.label} label={group.label}>
                {group.tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              group.tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))
            ),
          )}
        </select>
      </div>
      <nav aria-label="Admin workspace" className="hidden w-52 shrink-0 flex-col gap-4 lg:flex">
        {adminNavGroups.map((group) => (
          <div key={group.label ?? "workspace"} className="flex flex-col gap-1">
            {group.label && <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>}
            {group.tabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-current={area === id ? "page" : undefined}
                onClick={() => choose(id)}
                className={`rounded-md px-2 py-1.5 text-left text-sm ${
                  area === id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {area === "overview" && <AdminOverview {...props} />}
        {area === "customers" && <AdminCustomers {...props} />}
        {area === "support" && <AdminSupport {...props} />}
        {area === "traces" && <AdminTraces {...props} />}
        {area === "gateway" && <AdminGateway {...props} />}
        {area === "operators" && <AdminOperators {...props} />}
        {area === "privacy-rings" && <AdminPrivacyRings {...props} />}
        {area === "analytics" && <AdminAnalytics {...props} />}
        {area === "logs" && <AdminLogs {...props} />}
      </div>
    </div>
  );
}

export function render(page: Page): React.ReactNode {
  if (page.tag !== "Console") return null;
  if (page.section === "Referrals") return <ReferralsPage />;
  if (page.section !== "Admin") return null;
  const area = (adminAreas as readonly string[]).includes(page.area) ? (page.area as AdminArea) : "overview";
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <WorkspaceHeading title="Admin" description="Manage customers, support, request traces, and treasury operations." />
      <AdminWorkspace area={area} />
    </main>
  );
}
