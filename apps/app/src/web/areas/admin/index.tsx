// spec/app/admin/index.md, "The admin machine"
import type { Page } from "../../../../gen/app__nav.ts";
import { Button } from "@repo/ui";
import { useAdmin, useSession } from "./data.ts";
import { adminArea, type AdminArea } from "./areas.ts";
import { AdminWorkspace } from "./shell.tsx";
import { ConsoleFrame } from "../console/frame.tsx";
import { Panel } from "./ui.tsx";

function ReferralRedirect() {
  return (
    <ConsoleFrame section="Admin">
      <meta httpEquiv="refresh" content="0;url=/console/referrals" />
      <Panel className="px-6 py-10 text-center">
        <h2 className="text-heading font-medium tracking-heading">Referrals moved</h2>
        <p className="mt-2 text-ui text-muted-foreground">Referral tracking is a personal workspace surface.</p>
        <Button asChild className="mt-4"><a href="/console/referrals">Open referrals</a></Button>
      </Panel>
    </ConsoleFrame>
  );
}

export function AdminPage({ area }: { area: string }) {
  const session = useSession();
  const admin = useAdmin();
  if (area === "referrals") return <ReferralRedirect />;
  const section: AdminArea = adminArea(area);
  const signedIn = session.state?.tag === "SignedIn" ? session.state : undefined;
  const wallet = signedIn?.wallet ?? "";
  const roster = admin.state?.ops.roster;
  const operator = roster?.find((row) => row.wallet === wallet);
  const bootstrapOperator = Boolean(wallet && roster && roster.length === 0);
  const role = operator ? operator.role.toLowerCase() : bootstrapOperator ? "admin" : "member";

  return (
    <ConsoleFrame section="Admin">
      <AdminWorkspace key={wallet || "signed-out"} area={section} wallet={wallet} role={role} />
    </ConsoleFrame>
  );
}

export function render(page: Page) {
  if (page.tag !== "Console" || page.section !== "Admin") return null;
  return <AdminPage area={page.area} />;
}
