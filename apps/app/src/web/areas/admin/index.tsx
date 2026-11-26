// spec/app/admin/index.md
import "../site/site.css";
import "./admin.css";
import type { Page } from "../../../../gen/app__nav.ts";
import { useAdmin, useSession } from "./data.ts";
import { adminAreas, type AdminArea } from "./legacy/admin-areas.ts";
import { AdminWorkspace } from "./shell.tsx";
import { ConsoleFrame } from "../console/frame.tsx";

/**
 * `/console/admin/referrals` was an orphan duplicate of the personal referrals page.
 * The personal page at `/console/referrals` is the canonical surface; this sends
 * operators there with a declarative refresh and a visible fallback link.
 */
function ReferralRedirect() {
  return (
    <ConsoleFrame section="Admin">
      <meta httpEquiv="refresh" content="0;url=/console/referrals" />
      <section className="panel stack-panel">
        <h2>Referrals moved</h2>
        <p className="caption">
          Referral tracking is a personal workspace surface, not an admin operations page.
        </p>
        <a className="button quiet" href="/console/referrals">
          Open referrals
        </a>
      </section>
    </ConsoleFrame>
  );
}

export function AdminPage({ area }: { area: string }) {
  const session = useSession();
  const admin = useAdmin();
  if (area === "referrals") return <ReferralRedirect />;
  const section: AdminArea = (adminAreas as readonly string[]).includes(area) ? (area as AdminArea) : "overview";
  const signedIn = session.state?.tag === "SignedIn" ? session.state : undefined;
  const wallet = signedIn?.wallet ?? "";
  const roster = admin.state?.ops.roster ?? [];
  const operator = roster.find((row) => row.wallet === wallet);
  const bootstrapOperator = Boolean(wallet && roster.length === 0);
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
