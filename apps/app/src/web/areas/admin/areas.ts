import { Activity, BarChart3, ClipboardList, CreditCard, LifeBuoy, ReceiptText, ShieldCheck, Users } from "lucide-react";

export const adminAreas = [
  { id: "overview", label: "Overview", Icon: ShieldCheck, description: "What needs action first, then platform activity, treasury, and inference." },
  { id: "customers", label: "Customers", Icon: Users, description: "Find a wallet and review its account, payments, requests, and support history." },
  { id: "support", label: "Support", Icon: LifeBuoy, description: "Triage the queue, assign ownership, and reply without losing your place." },
  { id: "traces", label: "Traces", Icon: Activity, description: "Inspect request metadata, provider outcomes, and settlement amounts." },
  { id: "operators", label: "Operators", Icon: ClipboardList, description: "Admin, support, and finance wallets for this deployment." },
  { id: "payouts", label: "Payouts", Icon: CreditCard, description: "Ledger-derived margin, unsigned treasury payout preparation, and execution verification." },
  { id: "analytics", label: "Analytics", Icon: BarChart3, description: "Platform requests, spend, signups, and deposits by UTC day." },
  { id: "logs", label: "Logs", Icon: ReceiptText, description: "Privileged admin actions recorded across the workspace." },
] as const;

export type AdminArea = (typeof adminAreas)[number]["id"];

export function adminArea(id: string): AdminArea {
  return adminAreas.some((area) => area.id === id) ? id as AdminArea : "overview";
}

export function adminHref(id: AdminArea) {
  return id === "overview" ? "/console/admin" : "/console/admin/" + id;
}
