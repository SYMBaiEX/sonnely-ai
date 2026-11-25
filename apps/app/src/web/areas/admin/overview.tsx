// spec/app/admin/index.md: the admin Overview — headline numbers and what needs attention.
import type { Admin, Overview } from "./data.ts";
import { EmptyState, Panel, Pill, Stat, when } from "./ui.tsx";

export interface AreaProps {
  admin: Admin;
  wallet: string;
  overview: Overview | undefined;
  send: (input: unknown) => Promise<boolean>;
}

export function AdminOverview({ admin, overview }: AreaProps) {
  const suspended = admin.records.filter((r) => r.status === "Suspended").length;
  const usage = admin.records.reduce((total, r) => total + r.usage, 0);
  const operators = admin.ops.roster.length;
  const audit = admin.audit.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registered accounts" value={admin.records.length} hint={`${suspended} suspended`} />
        <Stat label="Usage accrued" value={usage} hint="Across the registry" />
        <Stat label="Operators" value={operators} hint={`${admin.ops.roster.filter((o) => o.role === "Admin").length} admins`} />
        <Stat label="Audit entries" value={audit} hint="Privileged changes recorded" />
      </div>

      <Panel label="Needs attention">
        <h2 className="mb-3 text-sm font-medium">Needs attention</h2>
        {suspended === 0 && admin.records.length === 0 ? (
          <EmptyState title="Nothing needs attention" hint="Suspended accounts and unanswered work show up here." />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {suspended > 0 && (
              <li className="flex items-center justify-between">
                <span>
                  {suspended} suspended account{suspended === 1 ? "" : "s"}
                </span>
                <a href="/console/admin/customers" className="text-muted-foreground underline">
                  Review
                </a>
              </li>
            )}
            {admin.records
              .filter((r) => r.status === "Suspended")
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span className="font-mono text-xs">{r.id}</span>
                  <Pill tone="warn">Suspended</Pill>
                </li>
              ))}
          </ul>
        )}
      </Panel>

      <Panel label="Recent activity">
        <h2 className="mb-3 text-sm font-medium">Recent activity</h2>
        {admin.audit.length === 0 ? (
          <EmptyState title="No traffic yet" hint="Privileged changes are recorded here as they happen." />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {[...admin.audit]
              .sort((a, b) => b.at - a.at)
              .slice(0, 8)
              .map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4">
                  <span className="truncate">
                    <span className="font-mono text-xs">{e.act}</span> <span className="text-muted-foreground">{e.summary}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{when(e.at)}</span>
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
