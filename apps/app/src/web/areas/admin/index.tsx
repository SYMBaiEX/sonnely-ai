// spec/app/admin/index.md — the admin console uses the legacy operations shell, reading vibestack machines through the CRM adapter.
import "../site/site.css";
import "./admin.css";
import type { Page } from "../../../../gen/app__nav.ts";
import { useAdmin, useSession } from "./data.ts";
import { ReferralsPage } from "./referrals.tsx";
import { Admin } from "./legacy/admin.tsx";
import { ConsoleFrame } from "../console/frame.tsx";

export function AdminPage({ area }: { area: string }) {
  if (area === "referrals") return <ReferralsPage />;
  const session = useSession();
  const admin = useAdmin();
  const signedIn = session.state?.tag === "SignedIn" ? session.state : undefined;
  const wallet = signedIn?.wallet ?? "";
  const roster = admin.state?.ops.roster ?? [];
  const operator = roster.find((row) => row.wallet === wallet);
  const bootstrapOperator = Boolean(wallet && roster.length === 0);
  const role = operator ? operator.role.toLowerCase() : bootstrapOperator ? "admin" : "member";

  return (
    <ConsoleFrame section="Admin">
      <div className="theme-root site admin-legacy-scope">
        <div className="console-content admin-legacy-console">
          <Admin
            key={wallet || "signed-out"}
                       session={{
              profile: wallet
                ? {
                    wallet,
                    name: "",
                    username: "",
                    balance: 0,
                    referral: "",
                    role,
                    onboarding: "later",
                  }
                : null,
              enabled: true,
              termsRequired: false,
              billingEnabled: true,
              paymentVerificationEnabled: true,
              inferenceEnabled: true,
              cluster: "mainnet",
            }}
            features={{ blackboxes: true, "dry-docks": true }}
          />
        </div>
      </div>
    </ConsoleFrame>
  );
}

export function render(page: Page) {
  if (page.tag !== "Console" || page.section !== "Admin") return null;
  return <AdminPage area={page.area} />;
}
