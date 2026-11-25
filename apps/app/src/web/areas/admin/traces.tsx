// spec/app/admin/index.md, "What the admin reads elsewhere": the request traces,
// reading whatever the shared "usage" store keeps.
import type { AreaProps } from "./overview.tsx";
import { EmptyState, Panel, Pill, Table, when } from "./ui.tsx";

interface Trace {
  id: string;
  account: string;
  model: string;
  status: string;
  at: number;
}

function traces(overview: AreaProps["overview"]): Trace[] {
  const usage = overview?.usage;
  if (typeof usage !== "object" || usage === null) return [];
  const u = usage as Record<string, unknown>;
  const rows = Array.isArray(u["requests"]) ? u["requests"] : Array.isArray(u["traces"]) ? u["traces"] : [];
  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Record<string, unknown>;
    const id = typeof r["id"] === "string" ? r["id"] : undefined;
    const account = typeof r["account"] === "string" ? r["account"] : typeof r["wallet"] === "string" ? (r["wallet"] as string) : "";
    const model = typeof r["model"] === "string" ? r["model"] : "—";
    const status = typeof r["status"] === "string" ? r["status"] : "—";
    const at = typeof r["at"] === "number" ? r["at"] : 0;
    return id ? [{ id, account, model, status, at }] : [];
  });
}

export function AdminTraces({ overview }: AreaProps) {
  const rows = traces(overview);
  return (
    <Panel label="Request traces">
      <h2 className="mb-3 text-sm font-medium">Request traces</h2>
      {rows.length === 0 ? (
        <EmptyState title="No traces yet" hint="Requests through the gateway show up here when the usage store holds them." />
      ) : (
        <Table head={["Time", "Account", "Model", "Status"]}>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{when(t.at)}</td>
              <td className="px-2 py-2 font-mono text-xs">{t.account || "—"}</td>
              <td className="px-2 py-2 text-xs">{t.model}</td>
              <td className="px-2 py-2">
                <Pill tone={t.status === "ok" ? "good" : "neutral"}>{t.status}</Pill>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
