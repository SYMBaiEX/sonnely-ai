// spec/app/admin/crm.md, "Story: Read the audit log": the audit trail the admin machine
// records, filtered by action and actor.
import { useState } from "react";
import type { AreaProps } from "./overview.tsx";
import { EmptyState, Panel, Select, Table, when, shortWallet } from "./ui.tsx";

export function AdminLogs({ admin }: AreaProps) {
  const [act, setAct] = useState("");
  const [actor, setActor] = useState("");
  const entries = [...admin.audit].sort((a, b) => b.at - a.at);
  const rows = entries.filter((e) => (act === "" || e.act === act) && (actor === "" || e.actor === actor));
  const actions = [...new Set(entries.map((e) => e.act))];
  const actors = [...new Set(entries.map((e) => e.actor))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Select value={act} onChange={(e) => setAct(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filter by actor">
          <option value="">All actors</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {shortWallet(a)}
            </option>
          ))}
        </Select>
      </div>
      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="No audit entries" hint="Privileged changes record who acted, what changed, and when." />
        </Panel>
      ) : (
        <Panel className="p-0">
          <Table head={["Time", "Actor", "Action", "Target", "Summary"]}>
            {rows.map((e, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{when(e.at)}</td>
                <td className="px-2 py-2 font-mono text-xs" title={e.actor}>
                  {shortWallet(e.actor)}
                </td>
                <td className="px-2 py-2 font-mono text-xs">{e.act}</td>
                <td className="px-2 py-2 font-mono text-xs" title={e.target}>
                  {shortWallet(e.target)}
                </td>
                <td className="px-2 py-2 text-xs">{e.summary}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}
