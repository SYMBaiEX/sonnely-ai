// spec/app/admin/operators.md, "Story: Grant and revoke access": the operator roster,
// the grant form and the revoke the rules allow.
import { useState } from "react";
import type { Role } from "../../../../gen/app__admin__operators.ts";
import type { AreaProps } from "./overview.tsx";
import { Button, EmptyState, Input, Panel, Pill, Select, Table, shortWallet } from "./ui.tsx";

const roleLabel: Record<Role, string> = { Admin: "Admin", Support: "Support", Finance: "Finance", Member: "Member" };

export function AdminOperators({ admin, wallet, send }: AreaProps) {
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<Role>("Admin");
  const [busy, setBusy] = useState(false);
  const roster = admin.ops.roster;
  const lastOne = roster.length <= 1;

  const act = async (event: unknown) => {
    setBusy(true);
    await send(event);
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel label="Operator directory">
        <h2 className="mb-3 text-sm font-medium">Operators</h2>
        {roster.length === 0 ? (
          <EmptyState title="No operators configured" hint="Grant access below to open the admin workspace." />
        ) : (
          <Table head={["Wallet", "Role", ""]}>
            {roster.map((o) => (
              <tr key={o.wallet} className="border-b border-border last:border-0">
                <td className="px-2 py-2 font-mono text-xs" title={o.wallet}>
                  {shortWallet(o.wallet)}
                  {o.wallet === wallet ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                </td>
                <td className="px-2 py-2">
                  <Pill tone={o.role === "Admin" ? "info" : "neutral"}>{roleLabel[o.role]}</Pill>
                </td>
                <td className="px-2 py-2 text-right">
                  <Button
                    quiet
                    disabled={busy || lastOne}
                    title={lastOne ? "The last operator cannot be revoked" : "Revoke access"}
                    onClick={() => void act({ type: "revoke", wallet: o.wallet, at: Date.now(), by: wallet })}
                  >
                    Revoke
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <Panel label="Grant access">
        <h2 className="mb-3 text-sm font-medium">Grant access</h2>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void act({ type: "grant", wallet: target, role, at: Date.now(), by: wallet }).then(() => setTarget(""));
          }}
        >
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Operator wallet"
            aria-label="Operator wallet"
            className="w-80 font-mono"
          />
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Operator role">
            {(Object.keys(roleLabel) as Role[]).map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </Select>
          <Button disabled={busy || target.trim() === ""}>Grant</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Only a listed operator can grant, and the last operator cannot be revoked. Every grant and revoke is recorded in the audit log.
        </p>
      </Panel>
    </div>
  );
}
