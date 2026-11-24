import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  LayoutDashboard,
  LifeBuoy,
  ListTree,
  ScrollText,
  ServerCog,
  Shield,
  UserCog,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AdminArea } from "@/lib/admin-areas";
import { AdminAnalytics } from "./admin-analytics";
import { AdminCrm } from "./admin-crm";
import { AdminGateway } from "./admin-gateway";
import { AdminLogs } from "./admin-logs";
import { AdminOperators } from "./admin-operators";
import { AdminPrivacyRings } from "./admin-privacy-rings";

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
    id: "gateway",
    label: "Inference ops",
    group: "Operations",
    Icon: ServerCog,
    render: (wallet) => <AdminGateway key={wallet} />,
  },
  {
    id: "operators",
    label: "Operators",
    group: "Operations",
    Icon: UserCog,
    render: (wallet) => <AdminOperators key={wallet} />,
  },
  {
    id: "privacy-rings",
    label: "Privacy Rings",
    group: "Operations",
    Icon: Shield,
    render: (wallet) => <AdminPrivacyRings key={wallet} />,
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

export const adminNavGroups: { label?: string; tabs: AdminTab[] }[] = adminTabs.reduce(
  (groups, tab) => {
    const found = groups.find((group) => group.label === tab.group);
    if (found) found.tabs.push(tab);
    else groups.push({ label: tab.group, tabs: [tab] });
    return groups;
  },
  [] as { label?: string; tabs: AdminTab[] }[],
);
