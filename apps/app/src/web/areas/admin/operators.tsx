import { useState, type FormEvent } from "react";
import { Button, Field, Input, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { postMachine, shortWallet, type AdminJoin } from "./data.ts";
import { ChoiceGroup, Empty, FormError, Panel, StatusMark, TableFrame } from "./ui.tsx";

type Role = "Admin" | "Support" | "Finance" | "Member";
const roles = [
  { value: "Admin", label: "Admin" },
  { value: "Support", label: "Support" },
  { value: "Finance", label: "Finance" },
  { value: "Member", label: "Member" },
] as const;

export function AdminOperators({ join }: { join: AdminJoin }) {
  const [wallet, setWallet] = useState("");
  const [role, setRole] = useState<Role>("Support");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const roster = join.registry.ops.roster;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "operator update failed");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!wallet.trim()) return;
    void run(async () => {
      await postMachine("admin", { type: "grant", wallet: wallet.trim(), role, at: Date.now() });
      setWallet("");
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel title="Operator roster">
        {roster.length === 0 ? <Empty title="No operators listed" /> : (
          <TableFrame>
            <TableHeader><TableRow><TableHead>Wallet</TableHead><TableHead>Role</TableHead><TableHead>Open tickets</TableHead><TableHead>Open follow-ups</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {roster.map((operator) => {
                const tickets = (join.support?.tickets ?? []).filter((row) => row.assignedTo === operator.wallet && row.state !== "Resolved").length;
                const tasks = (join.crm?.tasks ?? []).filter((row) => row.assignee === operator.wallet && row.doneAt === 0).length;
                return (
                  <TableRow key={operator.wallet}>
                    <TableCell className="font-mono text-meta" title={operator.wallet} label="Wallet">{shortWallet(operator.wallet)}</TableCell>
                    <TableCell label="Role"><StatusMark tone={operator.role === "Admin" ? "info" : "muted"}>{operator.role}</StatusMark></TableCell>
                    <TableCell label="Open tickets">{tickets}</TableCell>
                    <TableCell label="Open follow-ups">{tasks}</TableCell>
                    <TableCell label="Actions" wide>
                      <span className="flex w-full flex-wrap gap-2">
                        {roles.filter((choice) => choice.value !== operator.role).map((choice) => (
                          <Button key={choice.value} type="button" size="sm" variant="ghost" className="px-2" disabled={busy} onClick={() => void run(async () => postMachine("admin", { type: "grant", wallet: operator.wallet, role: choice.value, at: Date.now() }))}>{choice.label}</Button>
                        ))}
                        <Button type="button" size="sm" variant="destructive" className="px-2" disabled={busy} onClick={() => void run(async () => postMachine("admin", { type: "revoke", wallet: operator.wallet, at: Date.now() }))}>Revoke</Button>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </TableFrame>
        )}
      </Panel>

      <Panel title="Grant access">
        <form onSubmit={submit} className="grid gap-3 px-4 py-4">
          <Field label="Wallet" control={(props) => <Input {...props} value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="Solana wallet" />} />
          <ChoiceGroup label="Role" value={role} choices={roles} onChange={setRole} />
          <Button type="submit" disabled={busy || !wallet.trim()} className="justify-self-start">Grant role</Button>
          <FormError message={error} />
        </form>
        <div className="border-t border-border px-4 py-4 text-meta text-muted-foreground">
          <p>Roles come from this deployment’s roster. Initial production access is provisioned with `ADMIN_WALLETS`; support and finance wallets can be added here after bootstrap.</p>
          <p className="mt-2">Ledger actions are audited. Last active time is not retained by the roster.</p>
        </div>
      </Panel>
    </div>
  );
}
