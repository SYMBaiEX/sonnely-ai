// spec/app/admin/index.md, "What the admin reads elsewhere"
import { useSyncExternalStore } from "react";
import { z } from "zod";
import type { Account, Audit, Registry } from "../../../../gen/app__admin.ts";
import type { Crm, CustomerProfile, FollowUp } from "../../../../gen/app__admin__crm.ts";
import type { Deposits } from "../../../../gen/app__billing__deposits.ts";
import type { Ledger } from "../../../../gen/app__billing__ledger.ts";
import type { Keys } from "../../../../gen/app__keys.ts";
import type { Tickets } from "../../../../gen/app__support.ts";
import type { Teams } from "../../../../gen/app__teams.ts";
import type { Row as UsageRow, Usage } from "../../../../gen/app__usage.ts";
import { useSession as useCookieSession } from "../../session.ts";
import { useRemote } from "../../remote.ts";

export type { Account, Audit, Crm, CustomerProfile, Deposits, FollowUp, Keys, Ledger, Registry, Teams, Tickets, Usage, UsageRow };

const operatorSchema = z.object({ wallet: z.string(), role: z.enum(["Admin", "Support", "Finance", "Member"]) });
const accountSchema = z.object({ id: z.string(), subject: z.enum(["User", "Org"]), status: z.enum(["Active", "Suspended"]), usage: z.number() });
const auditSchema = z.object({ at: z.number(), actor: z.string(), act: z.string(), target: z.string(), summary: z.string() });
const registrySchema = z.object({ ops: z.object({ roster: z.array(operatorSchema) }), records: z.array(accountSchema), audit: z.array(auditSchema) });
const profileSchema = z.object({ wallet: z.string(), name: z.string(), username: z.string(), joined: z.number(), onboarding: z.string(), termsVersion: z.string(), termsAcceptedAt: z.number(), inviter: z.string(), updatedAt: z.number() });
const activitySchema = z.object({ id: z.string(), account: z.string(), actor: z.string(), ticket: z.string(), kind: z.string(), note: z.string(), time: z.number() });
const taskSchema = z.object({ id: z.string(), account: z.string(), assignee: z.string(), creator: z.string(), title: z.string(), dueAt: z.number(), doneAt: z.number(), createdAt: z.number() });
const flagSchema = z.object({ account: z.string(), flag: z.string(), note: z.string(), admin: z.string(), createdAt: z.number() });
const segmentSchema = z.object({ id: z.string(), admin: z.string(), name: z.string(), definition: z.string(), createdAt: z.number() });
const adjustmentSchema = z.object({ id: z.string(), account: z.string(), admin: z.string(), delta: z.number(), reason: z.string(), balanceAfter: z.number(), time: z.number() });
const crmSchema = z.object({ profiles: z.array(profileSchema), activities: z.array(activitySchema), tasks: z.array(taskSchema), flags: z.array(flagSchema), segments: z.array(segmentSchema), adjustments: z.array(adjustmentSchema) });
const keySchema = z.object({ id: z.string(), label: z.string(), prefix: z.string(), hash: z.string(), wallet: z.string(), project: z.string(), scopes: z.array(z.string()), cap: z.number(), dailyCap: z.number(), expiresAt: z.number(), status: z.enum(["Active", "Revoked"]), createdAt: z.number(), lastUsedAt: z.number(), spent: z.number(), dayKey: z.string(), daySpent: z.number() });
const keysSchema = z.object({ keys: z.array(keySchema), refundRefs: z.array(z.string()) });
const ledgerSchema = z.object({ balance: z.number(), entries: z.array(z.object({ wallet: z.string(), kind: z.enum(["Credit", "Reserve", "Charge", "Release", "Refund", "AdjustCredit", "AdjustDebit"]), detail: z.string(), amount: z.number() })) });
const usageSchema = z.object({ rows: z.array(z.object({ id: z.string(), time: z.number(), keyName: z.string(), keyId: z.string(), project: z.string(), wallet: z.string(), model: z.string(), provider: z.enum(["NearAI", "Phala", "Tinfoil"]), input: z.number(), output: z.number(), cached: z.number(), cost: z.number(), providerMs: z.number(), status: z.enum(["Pending", "Complete", "Failed", "Unreported"]) })) });
const replySchema = z.object({ author: z.enum(["Customer", "Staff"]), authorWallet: z.string(), visibility: z.enum(["Public", "Internal"]), body: z.string(), time: z.number() });
const supportSchema = z.object({ tickets: z.array(z.object({ id: z.string(), email: z.string(), topic: z.string(), message: z.string(), state: z.enum(["Open", "InProgress", "Resolved"]), openedAt: z.number(), updatedAt: z.number(), assignedTo: z.string(), wallet: z.string(), replies: z.array(replySchema) })) });
const teamsSchema = z.object({ teams: z.array(z.object({ id: z.string(), name: z.string(), members: z.array(z.object({ wallet: z.string(), role: z.enum(["Owner", "Admin", "Member"]) })), invites: z.array(z.object({ wallet: z.string(), role: z.enum(["Owner", "Admin", "Member"]), inviter: z.string(), expiresAt: z.number() })), projects: z.array(z.object({ id: z.string(), name: z.string(), budget: z.number(), spent: z.number(), archived: z.boolean() })) })), releaseRefs: z.array(z.string()) });
const depositStatusSchema = z.discriminatedUnion("tag", [z.object({ tag: z.literal("Pending") }), z.object({ tag: z.literal("Finalized"), signature: z.string() }), z.object({ tag: z.literal("Expired") })]);
const depositsSchema = z.object({ intents: z.array(z.object({ reference: z.string(), wallet: z.string(), asset: z.enum(["SOL", "USDC"]), amount: z.number(), atomic: z.number(), createdAt: z.number(), expiresAt: z.number(), status: depositStatusSchema })) });

export interface AdminJoin {
  keys: Keys | null;
  billing: Ledger | null;
  usage: Usage | null;
  support: Tickets | null;
  teams: Teams | null;
  deposits: Deposits | null;
  crm: Crm | null;
  registry: Registry;
}

type Snapshot = { data?: AdminJoin; error?: string; fetchedAt?: number };

function parseWith<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseJoin(raw: unknown): AdminJoin | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const input = raw as Record<string, unknown>;
  const registry = parseWith(registrySchema, input.registry);
  if (!registry) return undefined;
  return {
    keys: input.keys === null ? null : parseWith(keysSchema, input.keys),
    billing: input.billing === null ? null : parseWith(ledgerSchema, input.billing),
    usage: input.usage === null ? null : parseWith(usageSchema, input.usage),
    support: input.support === null ? null : parseWith(supportSchema, input.support),
    teams: input.teams === null ? null : parseWith(teamsSchema, input.teams),
    deposits: input.deposits === null ? null : parseWith(depositsSchema, input.deposits),
    crm: input.crm === null ? null : parseWith(crmSchema, input.crm),
    registry,
  };
}

let snapshot: Snapshot = {};
const listeners = new Set<() => void>();
let loading: Promise<boolean> | undefined;

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export async function refreshAdminJoin() {
  loading ??= (async () => {
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!response.ok) throw new Error(`operator read failed (HTTP ${response.status})`);
      const data = parseJoin(await response.json());
      if (!data) throw new Error("operator read was malformed");
      publish({ data, fetchedAt: Date.now() });
      return true;
    } catch (cause) {
      publish({ ...snapshot, error: cause instanceof Error ? cause.message : "operator read failed" });
      return false;
    } finally {
      loading = undefined;
    }
  })();
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!snapshot.data && !snapshot.error) void refreshAdminJoin();
  return () => listeners.delete(listener);
}

export function useAdminJoin() {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  return { ...current, refresh: refreshAdminJoin };
}

export function useSession() {
  return useCookieSession();
}

export function useAdmin() {
  return useRemote<Registry>("admin");
}

export async function postMachine(name: string, event: unknown) {
  const response = await fetch("/api/machines/" + name, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  const body = (await response.json().catch(() => undefined)) as { ok?: boolean; error?: string } | undefined;
  if (!response.ok || body?.ok === false) throw new Error(body?.error ?? `request failed (HTTP ${response.status})`);
  await refreshAdminJoin();
}

export async function postAdjustment(input: { account: string; delta: number; reason: string }) {
  const response = await fetch("/api/admin/adjust", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), activityId: crypto.randomUUID(), ...input }),
  });
  const body = (await response.json().catch(() => undefined)) as { ok?: boolean; error?: string } | undefined;
  if (!response.ok || body?.ok === false) throw new Error(body?.error ?? `adjustment failed (HTTP ${response.status})`);
  await refreshAdminJoin();
}

export interface CustomerRow {
  id: string;
  name: string;
  username: string;
  joined: number;
  balance: number;
  role: string;
  funded: boolean;
  active: boolean;
  flags: string[];
  usage: number;
  spend: number;
  requests: number;
  status: Account["status"];
  subject: Account["subject"];
  onboarding: string;
}

const emptyCrm: Crm = { profiles: [], activities: [], tasks: [], flags: [], segments: [], adjustments: [] };

export function balanceOf(ledger: Ledger | null, wallet: string) {
  return (ledger?.entries ?? []).reduce((sum, entry) => {
    if (entry.wallet !== wallet) return sum;
    return sum + (entry.kind === "Charge" || entry.kind === "AdjustDebit" ? -entry.amount : entry.amount);
  }, 0);
}

export function customersFrom(join: AdminJoin): CustomerRow[] {
  const crm = join.crm ?? emptyCrm;
  const records = [...join.registry.records];
  for (const profile of crm.profiles) {
    if (!records.some((row) => row.id === profile.wallet)) records.push({ id: profile.wallet, subject: "User", status: "Active", usage: 0 });
  }
  for (const row of join.usage?.rows ?? []) {
    if (row.wallet && !records.some((record) => record.id === row.wallet)) records.push({ id: row.wallet, subject: "User", status: "Active", usage: 0 });
  }
  return records.map((record) => {
    const profile = crm.profiles.find((row) => row.wallet === record.id);
    const usageRows = (join.usage?.rows ?? []).filter((row) => row.wallet === record.id);
    const balance = balanceOf(join.billing, record.id);
    const flags = new Set(crm.flags.filter((row) => row.account === record.id).map((row) => row.flag));
    if (record.status === "Suspended") flags.add("suspended");
    if (balance > 0) flags.add("funded");
    const complete = usageRows.filter((row) => row.status === "Complete");
    return {
      id: record.id,
      name: profile?.name ?? "",
      username: profile?.username ?? "",
      joined: profile?.joined ?? 0,
      balance,
      role: record.subject === "Org" ? "organization" : "owner",
      funded: balance > 0,
      active: complete.length > 0,
      flags: [...flags].sort(),
      usage: record.usage,
      spend: complete.reduce((sum, row) => sum + row.cost, 0),
      requests: usageRows.length,
      status: record.status,
      subject: record.subject,
      onboarding: profile?.onboarding ?? "",
    };
  }).sort((a, b) => b.joined - a.joined);
}

export function navBadges(join: AdminJoin | undefined, now: number) {
  return {
    openTickets: (join?.support?.tickets ?? []).filter((row) => row.state !== "Resolved").length,
    overdueTasks: (join?.crm?.tasks ?? []).filter((row) => row.doneAt === 0 && row.dueAt !== 0 && row.dueAt < now).length,
  };
}

export const emptyJoinCrm = emptyCrm;
export const shortWallet = (wallet: string) => wallet.length > 12 ? wallet.slice(0, 4) + "…" + wallet.slice(-4) : wallet;
export const money = (micros: number) => "$" + (micros / 1_000_000).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dateTime = (time: number) => time ? new Date(time).toLocaleString() : "—";
export const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);
