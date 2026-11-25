// spec/app/admin/index.md: analytics — the usage the registry accrued, by account and status.
import type { AreaProps } from "./overview.tsx";
import { EmptyState, Panel, Stat, Table } from "./ui.tsx";

export function AdminAnalytics({ admin }: AreaProps) {
  const usage = admin.records.reduce((t, r) => t + r.usage, 0);
  const top = [...admin.records].sort((a, b) => b.usage - a.usage).slice(0, 8);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Accounts" value={admin.records.length} />
        <Stat label="Usage accrued" value={usage} />
        <Stat label="Users" value={admin.records.filter((r) => r.subject === "User").length} />
        <Stat label="Orgs" value={admin.records.filter((r) => r.subject === "Org").length} />
      </div>
      <Panel label="Top accounts by usage">
        <h2 className="mb-3 text-sm font-medium">Top accounts by usage</h2>
        {top.length === 0 ? (
          <EmptyState title="No usage yet" hint="Accounts accrue usage here as they run inference." />
        ) : (
          <Table head={["Account", "Subject", "Status", "Usage"]}>
            {top.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-2 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-2 py-2 text-xs">{r.subject}</td>
                <td className="px-2 py-2 text-xs">{r.status}</td>
                <td className="px-2 py-2 font-mono text-xs">{r.usage}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
