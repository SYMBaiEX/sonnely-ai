// spec/app/admin/referrals.md, "Story: Invite a wallet": the wallet's personal invite link and the stage every
// referral it credited has reached.
import { Users } from "lucide-react";
import { useState } from "react";
import type { Console } from "../../../../gen/app__console.ts";
import type { Referrals, Signup } from "../../../../gen/app__admin__referrals.ts";
import { useSession } from "../../session.ts";
import { useRemote } from "../../remote.ts";
import { CopyButton, WorkspaceHeading, WorkspaceLegacy } from "../teams/legacy.tsx";

const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(time);

function Failure({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

function referralCode(wallet: string) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const random = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return wallet.slice(0, 4).toLowerCase() + "-" + random;
}

function InvitePanel({
  wallet,
  username,
  code,
  busy,
  create,
}: {
  wallet?: string;
  username: string;
  code?: string;
  busy: boolean;
  create: () => void;
}) {
  const url = wallet && code ? window.location.origin + "/console?ref=" + code : "";
  return (
    <section className="panel callout referral-invite">
      <div>
        <span className="empty-icon">
          <Users size={22} />
        </span>
        <h2>Your invite link</h2>
        {wallet && code ? (
          <>
            <p>{username ? "@" + username : "Add a username in Settings so referrals can recognize you."}</p>
            <code className="secret-code">{url}</code>
          </>
        ) : wallet ? (
          <p>No invite code yet.</p>
        ) : (
          <p>Connect a Solana wallet to get your personal invite link.</p>
        )}
      </div>
      {wallet && code ? (
        <div className="actions">
          <CopyButton value={url} label="Copy invite link" />
          <a href="/console/settings" className="button quiet">
            {username ? "Edit username" : "Set username"}
          </a>
        </div>
      ) : wallet ? (
        <div className="actions">
          <button type="button" className="button accent" disabled={busy} onClick={create}>
            {busy ? "Creating…" : "Create invite link"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function activity(rows: Signup[]) {
  return {
    funded: rows.filter((row) => row.stage !== "SignedUp").length,
    active: rows.filter((row) => row.stage === "Active").length,
  };
}

function ReferralBoard({ wallet, reload }: { wallet: string; reload: () => void }) {
  const referrals = useRemote<Referrals>("admin-referrals");
  const settings = useRemote<Console>("console");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const code = referrals.state?.codes.find((entry) => entry.owner === wallet)?.code;
  const rows = referrals.state?.signups.filter((signup) => signup.code === code) ?? [];
  const loading = !referrals.state && !referrals.error;
  const counts = activity(rows);

  async function create() {
    setBusy(true);
    setFailure("");
    try {
      const ok = await referrals.send({ type: "issueCode", wallet, code: referralCode(wallet) });
      if (!ok) setFailure("Could not create the invite link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Failure message={failure || referrals.error || ""} />
      <InvitePanel wallet={wallet} username={settings.state?.username ?? ""} code={code} busy={busy} create={() => void create()} />
      <section className="panel breakdown">
        <div className="between">
          <h2>Referral activity</h2>
          <button className="button quiet small" disabled={loading} onClick={reload}>
            Refresh
          </button>
        </div>
        {!!rows.length && (
          <>
            <p className="caption">
              Showing {rows.length} sign-ups · {counts.funded} funded · {counts.active} active
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
                  {rows.map((item, index) => (
                    <tr key={item.joined + ":" + item.wallet + ":" + index}>
                      <th scope="row">{item.wallet}</th>
                      <td>{date(item.joined)}</td>
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
            {loading ? "Loading referrals…" : "No verified sign-ups yet."}
          </p>
        )}
        <p className="caption">An invite is recorded when a wallet signs in for the first time through your link.</p>
      </section>
    </>
  );
}

function ReferralSession() {
  const session = useSession();
  const [revision, setRevision] = useState(0);
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  return (
    <>
      <WorkspaceHeading
        icon={Users}
        title="Referrals"
        description="Track invitations from wallet sign-up through funding and first paid request."
      />
      {wallet ? (
        <ReferralBoard key={wallet + ":" + revision} wallet={wallet} reload={() => setRevision((current) => current + 1)} />
      ) : (
        <>
          <InvitePanel busy={false} username="" create={() => undefined} />
          <section className="panel breakdown">
            <div className="between">
              <h2>Referral activity</h2>
            </div>
            <p className="caption" role="status">
              Sign in to view referrals.
            </p>
            <p className="caption">An invite is recorded when a wallet signs in for the first time through your link.</p>
          </section>
        </>
      )}
    </>
  );
}

export function ReferralWorkspace() {
  return (
    <WorkspaceLegacy>
      <ReferralSession />
    </WorkspaceLegacy>
  );
}

export function ReferralsPage() {
  return <ReferralWorkspace />;
}
