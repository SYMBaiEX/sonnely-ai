import type { ReactNode } from "react";
import { AdminAnalytics } from "./admin-analytics";
import { AdminCrm } from "./admin-crm";
import { AdminGateway } from "./admin-gateway";
import { AdminOperators } from "./admin-operators";

export type AdminTab = {
  id: string;
  label: string;
  render?: (wallet: string) => ReactNode;
};

export const adminTabs: AdminTab[] = [
  { id: "overview", label: "Overview" },
  {
    id: "customers",
    label: "Customers",
    render: (wallet) => <AdminCrm view="customers" key={wallet + ":customers"} />,
  },
  {
    id: "support",
    label: "Support",
    render: (wallet) => <AdminCrm view="support" key={wallet + ":support"} />,
  },
  {
    id: "traces",
    label: "Traces",
    render: (wallet) => <AdminCrm view="traces" key={wallet + ":traces"} />,
  },
  { id: "gateway", label: "Inference ops", render: (wallet) => <AdminGateway key={wallet} /> },
  { id: "operators", label: "Operators", render: (wallet) => <AdminOperators key={wallet} /> },
  { id: "analytics", label: "Analytics", render: (wallet) => <AdminAnalytics key={wallet} /> },
];
