// spec/app/admin/index.md, "What the admin reads elsewhere": inference ops —
// the provider and model fleet the gateway keeps, read defensively.
import type { AreaProps } from "./overview.tsx";
import { EmptyState, Panel, Stat } from "./ui.tsx";

export function AdminGateway({ admin }: AreaProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registered accounts" value={admin.records.length} />
        <Stat label="Suspended" value={admin.records.filter((r) => r.status === "Suspended").length} />
        <Stat label="Usage accrued" value={admin.records.reduce((t, r) => t + r.usage, 0)} />
        <Stat label="Audit entries" value={admin.audit.length} />
      </div>
      <Panel label="Inference ops">
        <h2 className="mb-3 text-sm font-medium">Inference ops</h2>
        <EmptyState
          title="No provider records"
          hint="Provider health and model capacity show up here when the gateway store holds them."
        />
      </Panel>
    </div>
  );
}
