// spec/app/admin/index.md, "What the admin reads elsewhere": the support inbox,
// reading whatever the shared "support" store keeps.
import type { AreaProps } from "./overview.tsx";
import { EmptyState, Panel, Pill, Table } from "./ui.tsx";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  account: string;
}

function tickets(overview: AreaProps["overview"]): Ticket[] {
  const support = overview?.support;
  if (typeof support !== "object" || support === null) return [];
  const rows = (support as Record<string, unknown>)["tickets"];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Record<string, unknown>;
    const id = typeof r["id"] === "string" ? r["id"] : undefined;
    const subject = typeof r["subject"] === "string" ? r["subject"] : "";
    const status = typeof r["status"] === "string" ? r["status"] : "open";
    const account = typeof r["account"] === "string" ? r["account"] : typeof r["wallet"] === "string" ? (r["wallet"] as string) : "";
    return id ? [{ id, subject, status, account }] : [];
  });
}

export function AdminSupport({ overview }: AreaProps) {
  const rows = tickets(overview);
  return (
    <Panel label="Support inbox">
      <h2 className="mb-3 text-sm font-medium">Support inbox</h2>
      {rows.length === 0 ? (
        <EmptyState title="No support requests" hint="Requests from workspaces show up here when the support store holds them." />
      ) : (
        <Table head={["Request", "Account", "Status"]}>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <td className="px-2 py-2 text-sm">{t.subject || t.id}</td>
              <td className="px-2 py-2 font-mono text-xs">{t.account || "—"}</td>
              <td className="px-2 py-2">
                <Pill tone={t.status === "open" ? "warn" : "neutral"}>{t.status}</Pill>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
