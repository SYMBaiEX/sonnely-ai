"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { shorten } from "@/lib/models";
import { request } from "../wallet";

export type CrmView = "customers" | "support" | "traces";
export type Customer = FunctionReturnType<typeof api.crm.customers>["page"][number];
export type CustomerDetail = NonNullable<FunctionReturnType<typeof api.crm.customer>>;
export type Ticket = FunctionReturnType<typeof api.crm.tickets>["page"][number];
export type Thread = NonNullable<FunctionReturnType<typeof api.crm.ticketThread>>;
export type Trace = FunctionReturnType<typeof api.crm.traces>["page"][number];
export type OperatorOption = FunctionReturnType<typeof api.operators.operators>[number];
export type Task = CustomerDetail["tasks"][number];
export type CrmPage = {
  page: (Customer | Ticket | Trace)[];
  isDone: boolean;
  continueCursor: string;
};
export type Segment = { id: string; name: string; definition: string };

export const localTime = (date: number) => new Date(date).toLocaleString();
export const ticketStates = { open: "Open", in_progress: "In progress", resolved: "Resolved" } as const;
export const traceStates = {
  pending: "Pending",
  complete: "Completed",
  failed: "Failed",
  unreported: "Unreported",
} as const;
export const outcomes: Record<string, string> = {
  complete: "Completed",
  upstream_http: "Provider HTTP error",
  upstream_transport: "Provider transport error",
  invalid_usage: "Invalid provider response",
  stream_incomplete: "Stream ended without terminal usage",
  phala_unavailable: "Phala receipt unavailable",
  phala_payload_mismatch: "Phala receipt payload mismatch",
  phala_route_mismatch: "Phala serving route mismatch",
};

export function useCrm<T>(route: string, revision: number) {
  const [state, setState] = useState<{ route: string; revision: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!route) return;
    let active = true;
    void request<T>(route)
      .then((data) => {
        if (active) setState({ route, revision, data });
      })
      .catch((error: Error) => {
        if (active) setState({ route, revision, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [route, revision]);
  return route !== "" && state?.route === route && state.revision === revision ? state : undefined;
}

export function Identity({
  customer,
}: {
  customer: { name: string; username?: string; wallet: string };
}) {
  return (
    <span className="crm-identity">
      <strong>
        {customer.name || (customer.username ? "@" + customer.username : shorten(customer.wallet))}
      </strong>
      <span className="caption">
        {customer.name && customer.username ? "@" + customer.username + " · " : ""}
        {shorten(customer.wallet)}
      </span>
    </span>
  );
}

export function CrmSection({
  title,
  children,
  open = true,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="panel stack-panel" open={open}>
      <summary className="crm-section-head">
        <h2>{title}</h2>
      </summary>
      {children}
    </details>
  );
}
