// spec/app/admin/index.md, "What the admin reads elsewhere": the machines the admin
// views read, the joined overview the shell serves, and the customer shape they join into.
import { useEffect, useState } from "react";
import type { Registry, Account, Audit } from "../../../../gen/app__admin.ts";
import type { Referrals, Signup } from "../../../../gen/app__admin__referrals.ts";
import { useSession as useCookieSession, type WorkspaceSession as Session } from "../../session.ts";
import type { Customer } from "../../../../gen/app__admin__crm.ts";
import { useRemote } from "../../remote.ts";

export type { Account, Audit, Referrals, Signup, Session, Customer };
export type Admin = Registry;

/** The shared state the views join, as the shell's /api/admin/overview reads it. */
export type Overview = Record<"session" | "keys" | "billing" | "usage" | "support" | "teams", unknown>;

export function useAdmin() {
  return useRemote<Registry>("admin");
}

export function useSession() {
  return useCookieSession();
}

export function useReferrals() {
  return useRemote<Referrals>("admin-referrals");
}

/** The joined stores, held only for a listed operator. */
export function useOverview(wallet: string | undefined, isOperator: boolean) {
  const [overview, setOverview] = useState<Overview>();
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!isOperator || !wallet) {
      setOverview(undefined);
      return;
    }
    let cancelled = false;
    const load = () =>
      fetch(`/api/admin/overview?by=${encodeURIComponent(wallet)}`).then(async (r) => {
        if (cancelled) return;
        if (r.status === 403) {
          setDenied(true);
          return;
        }
        setOverview((await r.json()) as Overview);
      });
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [wallet, isOperator]);
  return { overview, denied };
}

const record = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const str = (x: unknown) => (typeof x === "string" ? x : undefined);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

/** A customer row joined from the registry plus whatever the shared stores hold. */
export function customerRows(a: Registry, overview: Overview | undefined): Customer[] {
  const balances = balancesByAccount(overview?.billing);
  return a.records.map((r) => {
    const balance = balances.get(r.id);
    return {
      id: r.id,
      wallet: r.id,
      name: "",
      username: "",
      joined: 0,
      balance: balance ?? 0,
      role: r.subject === "Org" ? "org" : "member",
      funded: (balance ?? 0) > 0,
      active: r.status === "Active" && r.usage > 0,
      flags: flagsOf(r, balance),
    };
  });
}

function flagsOf(r: Account, balance: number | undefined): string[] {
  const flags: string[] = [];
  if ((balance ?? 0) > 0) flags.push("funded");
  if (r.status === "Suspended") flags.push("suspended");
  return flags;
}

/** Whatever a billing state keeps of an account's balance, read defensively. */
function balancesByAccount(billing: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!record(billing)) return out;
  const accounts = record(billing["accounts"]) ? Object.values(billing["accounts"] as Record<string, unknown>) : undefined;
  const rows = Array.isArray(accounts) ? accounts : Array.isArray(billing["accounts"]) ? (billing["accounts"] as unknown[]) : [];
  for (const row of rows) {
    if (!record(row)) continue;
    const id = str(row["id"]) ?? str(row["account"]) ?? str(row["wallet"]);
    const balance = num(row["balance"]);
    if (id && balance !== undefined) out.set(id, balance);
  }
  return out;
}
