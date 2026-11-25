// spec/app/admin/index.md, "What the admin reads elsewhere": Privacy Rings —
// the Solana Privacy-Cash ring registry the deployment runs against.
import type { AreaProps } from "./overview.tsx";
import { EmptyState, Panel } from "./ui.tsx";

export function AdminPrivacyRings(_props: AreaProps) {
  return (
    <Panel label="Privacy Rings">
      <h2 className="mb-3 text-sm font-medium">Privacy Rings</h2>
      <EmptyState
        title="No rings configured"
        hint="Solana Privacy-Cash ring registrations show up here when the deployment reports them."
      />
    </Panel>
  );
}
