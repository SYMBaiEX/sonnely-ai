// spec/app/admin/referrals.md, "Story: Invite a wallet"
import { Users } from "lucide-react";
import { useConsoleShell } from "./frame.tsx";
import { CopyButton, WorkspaceHeading } from "./bits.tsx";

const joinedDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function Referrals() {
  const shell = useConsoleShell();
  const wallet = shell.session.state?.tag === "SignedIn" ? shell.session.state.wallet : "";
  const owned = wallet ? shell.referrals.state?.codes.filter((code) => code.owner === wallet) ?? [] : [];
  const code = owned[0]?.code ?? "";
  const url = code ? `${window.location.origin}/console?ref=${code}` : "";
  const rows = code ? shell.referrals.state?.signups.filter((signup) => signup.code === code) ?? [] : [];
  const error = shell.referrals.error;

  return (
    <>
      <WorkspaceHeading icon={Users} title="Referrals" description="Track invitations from wallet sign-up through funding and first paid request." />
      {error && <p className="error">{error}</p>}
      <section className="panel callout referral-invite">
        <div>
          <span className="empty-icon">
            <Users size={22} />
          </span>
          <h2>Your invite link</h2>
          {wallet && code ? (
            <>
              <p>{shell.profile?.username ? "@" + shell.profile.username : "Add a username in Settings so referrals can recognize you."}</p>
              <code className="secret-code">{url}</code>
            </>
          ) : wallet ? (
            <p>Your invite link is being prepared. Referral code issuance is not connected to this deployment yet.</p>
          ) : (
            <p>Connect a Solana wallet to get your personal invite link.</p>
          )}
        </div>
        {wallet && code && (
          <div className="actions">
            <CopyButton text={url} label="Copy invite link" />
            <a href="/console/settings" className="button quiet">
              {shell.profile?.username ? "Edit username" : "Set username"}
            </a>
          </div>
        )}
      </section>
      <section className="panel breakdown">
        <div className="between">
          <h2>Referral activity</h2>
        </div>
        {!!rows.length && (
          <>
            <p className="caption">
              Showing {rows.length} sign-ups · {rows.filter((row) => row.stage !== "SignedUp").length} funded ·{" "}
              {rows.filter((row) => row.stage === "Active").length} active
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Joined (UTC)</th>
                    <th>Mainnet funding</th>
                    <th>Paid inference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.joined + ":" + item.wallet}>
                      <th scope="row">{item.wallet}</th>
                      <td>{joinedDate.format(item.joined)}</td>
                      <td>{item.stage === "SignedUp" ? "Pending" : "Funded"}</td>
                      <td>{item.stage === "Active" ? "Active" : "Pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!rows.length && (
          <p className="caption" role="status">
            {!wallet ? "Sign in to view referrals." : "No verified sign-ups yet."}
          </p>
        )}
        <p className="caption">An invite is recorded when a wallet signs in for the first time through your link.</p>
      </section>
    </>
  );
}
