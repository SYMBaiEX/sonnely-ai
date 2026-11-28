import { ShieldCheck } from "lucide-react";
import { cn } from "@repo/ui";
import { WorkspaceHeading } from "../console/bits.tsx";
import { adminAreas, adminHref, type AdminArea } from "./areas.ts";
import { navBadges, useAdminJoin, type AdminJoin } from "./data.ts";
import { AdminAnalytics } from "./analytics.tsx";
import { AdminCustomers } from "./customers.tsx";
import { AdminLogs } from "./logs.tsx";
import { AdminOperators } from "./operators.tsx";
import { AdminOverview } from "./overview.tsx";
import { AdminPayouts } from "./payouts.tsx";
import { AdminSupport } from "./support.tsx";
import { AdminTraces } from "./traces.tsx";
import { AdminError, AdminLoading, Panel } from "./ui.tsx";

function badgeFor(id: AdminArea, badges: { openTickets: number; overdueTasks: number }) {
  if (id === "support") return badges.openTickets;
  if (id === "overview") return badges.overdueTasks;
  return 0;
}

function AdminTabs({ area, badges }: { area: AdminArea; badges: { openTickets: number; overdueTasks: number } }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px" aria-label="Admin sections">
      {adminAreas.map(({ id, label, Icon }) => {
        const badge = badgeFor(id, badges);
        const active = area === id;
        return (
          <a
            key={id}
            href={adminHref(id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-ui font-medium transition-colors",
              active ? "border-primary bg-secondary text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
            {badge > 0 && <span className="text-micro text-muted-foreground">{badge > 99 ? "99+" : badge}</span>}
          </a>
        );
      })}
    </nav>
  );
}

function areaContent(area: AdminArea, wallet: string, join: AdminJoin) {
  if (area === "customers") return <AdminCustomers join={join} wallet={wallet} />;
  if (area === "support") return <AdminSupport join={join} wallet={wallet} full />;
  if (area === "traces") return <AdminTraces join={join} />;
  if (area === "operators") return <AdminOperators join={join} />;
  if (area === "payouts") return <AdminPayouts />;
  if (area === "analytics") return <AdminAnalytics join={join} />;
  if (area === "logs") return <AdminLogs join={join} />;
  return <AdminOverview join={join} wallet={wallet} />;
}

export function AdminWorkspace({ area, wallet, role }: { area: AdminArea; wallet: string; role: string }) {
  const remote = useAdminJoin();
  const info = adminAreas.find((item) => item.id === area) ?? adminAreas[0];
  const badges = navBadges(remote.data, remote.fetchedAt ?? 0);

  if (role === "support" || role === "finance") {
    return (
      <>
        <WorkspaceHeading
          icon={ShieldCheck}
          title={role === "support" ? "Support workspace" : "Finance workspace"}
          description={role === "support" ? "Review and assign support requests." : "Prepare and verify treasury payouts from ledger-derived margin."}
        />
        {remote.error ? <AdminError message={remote.error} retry={() => void remote.refresh()} /> : !remote.data ? <AdminLoading /> : role === "support" ? (
          <AdminSupport join={remote.data} wallet={wallet} full={false} />
        ) : (
          <AdminPayouts />
        )}
      </>
    );
  }

  if (role !== "admin") {
    return (
      <>
        <WorkspaceHeading icon={ShieldCheck} title="Admin" description="Manage customers, support, request traces, and treasury operations." />
        <Panel className="px-6 py-10 text-center">
          <ShieldCheck size={21} aria-hidden="true" className="mx-auto text-muted-foreground" />
          <h2 className="mt-3 text-heading font-medium tracking-heading">Administrator access required</h2>
          <p className="mt-2 text-ui text-muted-foreground">Connect an authorized Solana wallet to view this workspace.</p>
        </Panel>
      </>
    );
  }

  return (
    <>
      <WorkspaceHeading icon={info.Icon} title={info.label} description={info.description} />
      <AdminTabs area={area} badges={badges} />
      <div className="mt-5 min-w-0">
        {remote.error ? <AdminError message={remote.error} retry={() => void remote.refresh()} /> : !remote.data ? <AdminLoading /> : areaContent(area, wallet, remote.data)}
      </div>
    </>
  );
}
