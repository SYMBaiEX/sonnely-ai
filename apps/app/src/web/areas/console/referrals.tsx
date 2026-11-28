// spec/app/admin/referrals.md, "Story: Invite a wallet"
import { Users } from "lucide-react";
import { useEffect, useRef } from "react";
import { useConsoleShell } from "./frame.tsx";
import { CopyButton, WorkspaceHeading, dateTime, shorten } from "./bits.tsx";

const codeChars = "abcdefghijklmnopqrstuvwxyz0123456789";

function inviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => codeChars[byte % codeChars.length]).join("");
}

export function Referrals() {
  const shell = useConsoleShell();
  const wallet = shell.session.state?.tag === "SignedIn" ? shell.session.state.wallet : "";
  const owned = wallet ? shell.referrals.state?.codes.filter((code) => code.owner === wallet) ?? [] : [];
  const issuing = useRef(false);

  // spec/app/admin/referrals.md, "Each wallet issues one code"
  // eslint-disable-next-line @typescript-eslint/unbound-method -- send is a stable useCallback closure held on the remote, not a this-bound method
  const send = shell.referrals.send;
  const loaded = shell.referrals.state !== undefined;
  useEffect(() => {
    if (!wallet || !loaded || owned.length > 0 || issuing.current) return;
    issuing.current = true;
    void send({ type: "issueCode", wallet, code: inviteCode() }).then(() => {
      issuing.current = false;
    });
  }, [wallet, loaded, owned.length, send]);

  const code = owned[0]?.code ?? "";
  const url = code ? `${window.location.origin}/console?ref=${code}` : "";
  const rows = code ? shell.referrals.state?.signups.filter((signup) => signup.code === code) ?? [] : [];
  const error = shell.referrals.error;

  return (
    <>
      <WorkspaceHeading icon={Users} title="Referrals" description="Share your link and track funded, active sign-ups." />
      {error && <p className="error">{error}</p>}
      <section className="panel referral-invite">
        <div>
          <h2>Your invite link</h2>
          {wallet && code ? (
            <>
              <p>{shell.profile?.username ? "@" + shell.profile.username : "Add a username in Settings so referrals can recognize you."}</p>
              <code className="secret-code">{url}</code>
            </>
          ) : wallet ? (
            <p role="status">Your invite link is being prepared…</p>
          ) : (
            <p>Connect a Solana wallet to get your personal invite link.</p>
          )}
        </div>
        {wallet && code && (
          <div className="actions">
            <CopyButton value={url} label="Copy invite link" />
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
            <div className="table-wrap data-rows">
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
                      <th scope="row">
                        <span className="referral-wallet">
                          <span className="mono" title={item.wallet}>{shorten(item.wallet)}</span>
                          <CopyButton value={item.wallet} label="Copy wallet" />
                        </span>
                      </th>
                      <td data-label="Joined (UTC)">{dateTime(item.joined)}</td>
                      <td data-label="Mainnet funding">
                        <span className="pill referral-stage" data-complete={item.stage !== "SignedUp" || undefined}>
                          {item.stage === "SignedUp" ? "Pending" : "Funded"}
                        </span>
                      </td>
                      <td data-label="Paid inference">
                        <span className="pill referral-stage" data-complete={item.stage === "Active" || undefined}>
                          {item.stage === "Active" ? "Active" : "Pending"}
                        </span>
                      </td>
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
