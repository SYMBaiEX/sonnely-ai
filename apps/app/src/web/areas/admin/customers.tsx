// spec/app/admin/index.md, "Story: Moderate accounts" + spec/app/admin/crm.md: the customer
// directory — search, flag and funded filters, and the account actions an operator can run.
import { useState } from "react";
import { customerRows, type Customer } from "./data.ts";
import type { AreaProps } from "./overview.tsx";
import { Button, EmptyState, Input, Panel, Pill, Select, Stat, Table, Toolbar, shortWallet } from "./ui.tsx";

export function AdminCustomers({ admin, wallet, overview, send }: AreaProps) {
  const [search, setSearch] = useState("");
  const [flag, setFlag] = useState("");
  const [funded, setFunded] = useState("any");
  const [activeOnly, setActiveOnly] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);

  const all = customerRows(admin, overview);
  const matches = (c: Customer) =>
    search === "" ||
    c.wallet === search ||
    c.username === search ||
    c.name === search ||
    c.wallet.includes(search) ||
    c.username.includes(search) ||
    c.name.toLowerCase().includes(search.toLowerCase());
  const rows = all.filter(
    (c) => matches(c) && (flag === "" || c.flags.includes(flag)) && (funded === "any" || (funded === "funded") === c.funded) && (!activeOnly || c.active),
  );
  const flags = [...new Set(all.flatMap((c) => c.flags))];
  const current = selected ? admin.records.find((r) => r.id === selected) : undefined;

  const moderate = async (event: unknown) => {
    setBusy(true);
    await send(event);
    setBusy(false);
  };

  if (current) {
    const suspended = current.status === "Suspended";
    return (
      <div className="flex flex-col gap-6">
        <Button quiet onClick={() => setSelected(undefined)} className="self-start">
          ← All customers
        </Button>
        <Panel label="Customer workspace">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-mono text-lg">{shortWallet(current.id)}</h2>
              <p className="text-sm text-muted-foreground">{current.subject === "Org" ? "Organization" : "User"}</p>
            </div>
            <Pill tone={suspended ? "warn" : "good"}>{suspended ? "Suspended" : "Active"}</Pill>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Credit balance" value={customerRows(admin, overview).find((c) => c.id === current.id)?.balance ?? "—"} />
            <Stat label="Usage accrued" value={current.usage} />
            <Stat label="Subject" value={current.subject} />
            <Stat label="Flags" value={suspended ? "suspended" : (customerRows(admin, overview).find((c) => c.id === current.id)?.flags.join(", ") || "—")} />
          </div>
        </Panel>
        <Panel label="Account actions">
          <h3 className="mb-2 text-sm font-medium">Account actions</h3>
          {suspended ? (
            <Button disabled={busy} onClick={() => void moderate({ type: "reinstate", id: current.id, at: Date.now(), by: wallet })}>
              Restore inference access
            </Button>
          ) : (
            <Button quiet disabled={busy} onClick={() => void moderate({ type: "suspend", id: current.id, at: Date.now(), by: wallet })}>
              Suspend inference
            </Button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Suspending stops inference for the account; the record and its usage stay. The change is recorded in the audit log.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search wallet, username, or name"
          aria-label="Search customers"
          className="w-64"
        />
        <Select value={flag} onChange={(e) => setFlag(e.target.value)} aria-label="Filter by flag">
          <option value="">All flags</option>
          {flags.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Select value={funded} onChange={(e) => setFunded(e.target.value)} aria-label="Filter by funding">
          <option value="any">Any funding</option>
          <option value="funded">Funded</option>
          <option value="unfunded">Not funded</option>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Active only
        </label>
      </Toolbar>
      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="No customers yet" hint="Customers appear here once a workspace is registered." />
        </Panel>
      ) : (
        <Panel className="p-0">
          <Table head={["Customer", "Status", "Usage", "Balance", "Role", ""]}>
            {rows.map((c) => {
              const record = admin.records.find((r) => r.id === c.id);
              const suspended = record?.status === "Suspended";
              return (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-2">
                    <button type="button" className="font-mono text-xs underline" onClick={() => setSelected(c.id)}>
                      {shortWallet(c.wallet)}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <Pill tone={suspended ? "warn" : "good"}>{suspended ? "Suspended" : "Active"}</Pill>
                    {c.flags.filter((f) => f !== "suspended").map((f) => (
                      <Pill key={f}>{f}</Pill>
                    ))}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{record?.usage ?? 0}</td>
                  <td className="px-2 py-2 font-mono text-xs">{c.balance}</td>
                  <td className="px-2 py-2 text-xs">{c.role}</td>
                  <td className="px-2 py-2">
                    {suspended ? (
                      <Button quiet disabled={busy} onClick={() => void moderate({ type: "reinstate", id: c.id, at: Date.now(), by: wallet })}>
                        Reinstate
                      </Button>
                    ) : (
                      <Button quiet disabled={busy} onClick={() => void moderate({ type: "suspend", id: c.id, at: Date.now(), by: wallet })}>
                        Suspend
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      )}
    </div>
  );
}
