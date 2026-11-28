// spec/app/admin/referrals.md, "Story: Invite a wallet"
import { Users } from "lucide-react";
import { Button, Card, CardTitle, EmptyState } from "@repo/ui";
import { useConsoleShell } from "./frame.tsx";
import { CopyButton, WorkspaceHeading, dateTime, shorten } from "./bits.tsx";

const codeChars = "abcdefghijklmnopqrstuvwxyz0123456789";
const metaClass = "text-meta text-muted-foreground";
const pillClass = "inline-flex items-center rounded-xl border px-2 py-0.5 text-micro font-medium";
const tableHeadClass = "border-b border-border px-3 py-2 text-left text-micro font-medium uppercase tracking-micro text-muted-foreground";
const tableCellClass = "border-b border-border px-3 py-3 align-top text-ui text-foreground last:border-b-0";

function inviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => codeChars[byte % codeChars.length]).join("");
}

function stagePill(active: boolean, label: string) {
  return (
    <span className={active ? `${pillClass} border-ok/40 bg-ok/10 text-ok` : `${pillClass} border-border bg-background text-muted-foreground`}>
      {label}
    </span>
  );
}

export function Referrals() {
  const shell = useConsoleShell();
  const wallet = shell.session.state?.tag === "SignedIn" ? shell.session.state.wallet : "";
  const owned = wallet ? shell.referrals.state?.codes.filter((code) => code.owner === wallet) ?? [] : [];
  const send = (input: unknown) => shell.referrals.send(input);
  const code = owned[0]?.code ?? "";
  const url = code ? `${window.location.origin}/console?ref=${code}` : "";
  const rows = code ? shell.referrals.state?.signups.filter((signup) => signup.code === code) ?? [] : [];
  const error = shell.referrals.error;

  return (
    <>
      <WorkspaceHeading icon={Users} title="Referrals" description="Share your link and track funded, active sign-ups." />
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-ui text-destructive" role="alert">
          {error}
        </p>
      )}
      <Card className="gap-4 p-4 shadow-none">
        <div className="grid gap-2">
          <CardTitle className="text-lead tracking-heading">Your invite link</CardTitle>
          {wallet && code ? (
            <>
              <p className={metaClass}>{shell.profile?.username ? "@" + shell.profile.username : "Add a username in Settings so referrals can recognize you."}</p>
              <code className="break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-meta text-foreground">{url}</code>
            </>
          ) : wallet ? (
            <p className={metaClass}>Create your personal invite link. Each wallet issues one code.</p>
          ) : (
            <p className={metaClass}>Connect a Solana wallet to get your personal invite link.</p>
          )}
        </div>
        {wallet && !code && (
          <div>
            <Button onClick={() => void send({ type: "issueCode", wallet, code: inviteCode() })}>Create invite link</Button>
          </div>
        )}
        {wallet && code && (
          <div className="flex flex-wrap gap-2">
            <CopyButton value={url} label="Copy invite link" />
            <Button variant="outline" asChild>
              <a href="/console/settings">{shell.profile?.username ? "Edit username" : "Set username"}</a>
            </Button>
          </div>
        )}
      </Card>
      <Card className="gap-4 p-4 shadow-none">
        <CardTitle className="text-lead tracking-heading">Referral activity</CardTitle>
        {!!rows.length && (
          <>
            <p className={metaClass}>
              Showing {rows.length} sign-ups · {rows.filter((row) => row.stage !== "SignedUp").length} funded · {rows.filter((row) => row.stage === "Active").length} active
            </p>
            <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label="Referral activity table" tabIndex={0}>
              <table className="w-full min-w-160 border-collapse bg-card">
                <thead>
                  <tr>
                    <th className={tableHeadClass}>Account</th>
                    <th className={tableHeadClass}>Joined (UTC)</th>
                    <th className={tableHeadClass}>Mainnet funding</th>
                    <th className={tableHeadClass}>Paid inference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.joined + ":" + item.wallet}>
                      <th scope="row" className={`${tableCellClass} font-medium`}>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono" title={item.wallet}>{shorten(item.wallet)}</span>
                          <CopyButton value={item.wallet} label="Copy wallet" />
                        </span>
                      </th>
                      <td className={tableCellClass}>{dateTime(item.joined)}</td>
                      <td className={tableCellClass}>{stagePill(item.stage !== "SignedUp", item.stage === "SignedUp" ? "Pending" : "Funded")}</td>
                      <td className={tableCellClass}>{stagePill(item.stage === "Active", item.stage === "Active" ? "Active" : "Pending")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!rows.length && (
          <EmptyState title={!wallet ? "Sign in to view referrals." : "No verified sign-ups yet."} icon={<Users size={22} aria-hidden />} />
        )}
        <p className={metaClass}>An invite is recorded when a wallet signs in for the first time through your link.</p>
      </Card>
    </>
  );
}
