// spec/app/admin/referrals.md, "Story: Invite a wallet": the Referrals console section —
// the wallet's personal invite link and the stage every referral it credited has reached.
import { useState } from "react";
import { useReferrals, useSession } from "./data.ts";
import { Button, EmptyState, Panel, Pill, Table, WorkspaceHeading, when } from "./ui.tsx";

const stageTone: Record<string, "neutral" | "warn" | "good"> = { SignedUp: "neutral", Funded: "warn", Active: "good" };
const stageLabel: Record<string, string> = { SignedUp: "Signed up", Funded: "Funded", Active: "Active" };

export function ReferralsPage() {
  const session = useSession();
  const referrals = useReferrals();
  const [busy, setBusy] = useState(false);
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;

  const code = referrals.state?.codes.find((c) => c.owner === wallet);
  const link = code ? `${location.origin}/?ref=${code.code}` : undefined;
  const mine = referrals.state?.signups.filter((s) => s.code === code?.code) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <WorkspaceHeading title="Referrals" description="Invite wallets and earn when they fund and activate." />
      {!session.state || !referrals.state ? null : wallet === undefined ? (
        <Panel>
          <EmptyState title="Sign in for your link" hint="Connect a Solana wallet to get your personal invite link." />
        </Panel>
      ) : (
        <>
          <Panel label="Your invite link">
            <h2 className="mb-3 text-sm font-medium">Your invite link</h2>
            {link ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">{link}</code>
                <Button quiet onClick={() => void navigator.clipboard.writeText(link)}>
                  Copy
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">No invite code yet.</p>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void referrals
                      .send({ type: "issueCode", wallet, code: wallet.slice(0, 8) })
                      .then(() => setBusy(false));
                  }}
                >
                  Create invite link
                </Button>
              </div>
            )}
          </Panel>
          <Panel label="Referral activity">
            <h2 className="mb-3 text-sm font-medium">Referral activity</h2>
            {mine.length === 0 ? (
              <EmptyState title="No referrals yet" hint="Wallets that sign up through your link appear here." />
            ) : (
              <Table head={["Wallet", "Stage", "Joined"]}>
                {mine.map((s) => (
                  <tr key={s.wallet} className="border-b border-border last:border-0">
                    <td className="px-2 py-2 font-mono text-xs">{s.wallet}</td>
                    <td className="px-2 py-2">
                      <Pill tone={stageTone[s.stage] ?? "neutral"}>{stageLabel[s.stage] ?? s.stage}</Pill>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{when(s.joined)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
