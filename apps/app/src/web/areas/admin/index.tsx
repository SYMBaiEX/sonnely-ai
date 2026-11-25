// spec/app/admin/index.md
import "../site/site.css";
import "./admin.css";
import type { Page } from "../../../../gen/app__nav.ts";
import { useAdmin, useSession } from "./data.ts";
import { ReferralsPage } from "./referrals.tsx";
import { Admin } from "./legacy/admin.tsx";
import { ConsoleFrame } from "../console/frame.tsx";

export function AdminPage({ area }: { area: string }) {
  const session = useSession();
  const admin = useAdmin();
  if (area === "referrals")
    return (
      <ConsoleFrame section="Admin">
        <ReferralsPage />
      </ConsoleFrame>
    );
  const signedIn = session.state?.tag === "SignedIn" ? session.state : undefined;
  const wallet = signedIn?.wallet ?? "";
  const roster = admin.state?.ops.roster ?? [];
  const operator = roster.find((row) => row.wallet === wallet);
  const bootstrapOperator = Boolean(wallet && roster.length === 0);
  const role = operator ? operator.role.toLowerCase() : bootstrapOperator ? "admin" : "member";

  return (
    <ConsoleFrame section="Admin">
      <div className="admin-legacy-scope" data-motion="on">
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
    </ConsoleFrame>
  );
}

export function render(page: Page) {
  if (page.tag !== "Console" || page.section !== "Admin") return null;
  return <AdminPage area={page.area} />;
}
