// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  LayoutDashboard,
  Landmark,
  LifeBuoy,
  ListTree,
  ScrollText,
  UserCog,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AdminArea } from "./admin-areas.ts";
import { AdminAnalytics } from "./admin-analytics.tsx";
import { AdminCrm } from "./admin-crm.tsx";
import { AdminLogs } from "./admin-logs.tsx";
import { AdminOperators } from "./admin-operators.tsx";
import { AdminPayouts } from "../payouts.tsx";

export type AdminTab = {
  id: AdminArea;
  label: string;
  group?: "Customers" | "Operations" | "Insights";
  Icon: LucideIcon;
  render?: (wallet: string) => ReactNode;
};

export const adminTabs: AdminTab[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  {
    id: "customers",
    label: "Customers",
    group: "Customers",
    Icon: Users,
    render: (wallet) => <AdminCrm view="customers" key={wallet + ":customers"} />,
  },
  {
    id: "support",
    label: "Support",
    group: "Customers",
    Icon: LifeBuoy,
    render: (wallet) => <AdminCrm view="support" key={wallet + ":support"} />,
  },
  {
    id: "traces",
    label: "Traces",
    group: "Customers",
    Icon: ListTree,
    render: (wallet) => <AdminCrm view="traces" key={wallet + ":traces"} />,
  },
  {
    id: "operators",
    label: "Operators",
    group: "Operations",
    Icon: UserCog,
    render: (wallet) => <AdminOperators key={wallet} />,
  },
  {
    id: "payouts",
    label: "Payouts",
    group: "Operations",
    Icon: Landmark,
    render: () => <AdminPayouts />,
  },
  {
    id: "analytics",
    label: "Analytics",
    group: "Insights",
    Icon: BarChart3,
    render: (wallet) => <AdminAnalytics key={wallet} />,
  },
  {
    id: "logs",
    label: "Logs",
    group: "Insights",
    Icon: ScrollText,
    render: (wallet) => <AdminLogs key={wallet} />,
  },
];

