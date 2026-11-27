// spec/app/admin/index.md: the admin workspace chrome — one heading, one horizontal section
// navigation inside the modern console shell, and the area the operator opened.
import { ShieldCheck } from "lucide-react";
import { WorkspaceHeading } from "../console/bits.tsx";
import { adminTabs, type AdminTab } from "./legacy/admin-tabs.tsx";
import type { AdminArea } from "./legacy/admin-areas.ts";
import { AdminCrm } from "./legacy/admin-crm.tsx";
import { AdminPayouts } from "./payouts.tsx";
import { AdminOverview, useNavBadges } from "./overview.tsx";

const descriptions: Record<string, string> = {
  overview: "What needs action first, then platform activity, treasury, and inference.",
  customers: "Find a wallet and review its account, referrals, payments, requests, and support history.",
  support: "Triage the queue, assign ownership, and reply without losing your place.",
  traces: "Inspect request metadata, provider outcomes, and settlement amounts.",
  operators: "Admin, support, and finance wallets for this deployment.",
  payouts: "Ledger-derived margin, unsigned treasury payout preparation, and execution verification.",
  analytics: "Platform requests, spend, signups, and deposits by UTC day.",
  logs: "Privileged admin actions recorded across the workspace.",
};

function badgeFor(id: AdminArea, badges: { openTickets: number; overdueTasks: number } | undefined) {
  if (id === "support") return badges?.openTickets;
  if (id === "overview") return badges?.overdueTasks;
  return undefined;
}

function tabHref(id: AdminArea) {
  return id === "overview" ? "/console/admin" : "/console/admin/" + id;
}

export function AdminTabs({
  area,
  badges,
}: {
  area: AdminArea;
  badges: { openTickets: number; overdueTasks: number } | undefined;
}) {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {adminTabs.map(({ id, label, Icon }) => {
        const badge = badgeFor(id, badges);
        return (
          <a key={id} href={tabHref(id)} aria-current={area === id ? "page" : undefined}>
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
            {badge ? <span className="admin-tab-badge">{badge > 99 ? "99+" : badge}</span> : null}
          </a>
        );
      })}
    </nav>
  );
}

function areaContent(area: AdminArea, wallet: string, badges: { openTickets: number; overdueTasks: number } | undefined) {
  if (area === "overview") return <AdminOverview wallet={wallet} badges={badges} />;
  const tab: AdminTab | undefined = adminTabs.find((item) => item.id === area);
  return tab?.render?.(wallet) ?? null;
}

export function AdminWorkspace({ area, wallet, role }: { area: AdminArea; wallet: string; role: string }) {
  const authorized = role === "admin";
  const badges = useNavBadges(authorized);

  if (role === "support" || role === "finance") {
    return (
      <>
        <WorkspaceHeading
          icon={ShieldCheck}
          title={role === "support" ? "Support workspace" : "Finance workspace"}
          description={
            role === "support"
              ? "Review and assign support requests."
              : "Prepare and verify treasury payouts from ledger-derived margin."
          }
        />
        {role === "support" ? (
          <AdminCrm view="support" key={wallet} canOpenCustomer={false} />
        ) : (
          <AdminPayouts />
        )}
      </>
    );
  }

  if (!authorized) {
    return (
      <>
        <WorkspaceHeading
          icon={ShieldCheck}
          title="Admin"
          description="Manage customers, support, request traces, and treasury operations."
        />
        <section className="panel stack-panel admin-access">
          <ShieldCheck size={21} aria-hidden="true" />
          <h2>Administrator access required</h2>
          <p>Connect an authorized Solana wallet to view this workspace.</p>
        </section>
      </>
    );
  }

  const tab = adminTabs.find((item) => item.id === area);
  return (
    <>
      <WorkspaceHeading
        icon={tab?.Icon ?? ShieldCheck}
        title={tab?.label ?? "Admin"}
        description={descriptions[area] ?? "Manage customers, support, request traces, and treasury operations."}
      />
      <AdminTabs area={area} badges={badges} />
      <div className="admin-area">{areaContent(area, wallet, badges)}</div>
    </>
  );
}
