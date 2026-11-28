// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { Badge, EmptyState as UiEmptyState, Skeleton as UiSkeleton, Spinner as UiSpinner } from "@repo/ui";
import { SearchX } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Pill({
  tone = "muted",
  children,
}: {
  tone?: "ok" | "warn" | "error" | "info" | "muted";
  children: ReactNode;
}) {
  return <Badge variant={tone === "error" ? "destructive" : tone} className={"pill" + (tone === "muted" ? "" : " pill-" + tone)}>{children}</Badge>;
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <UiEmptyState title={title} description={hint} icon={<SearchX size={20} aria-hidden="true" />} className="empty-state">
      {action}
    </UiEmptyState>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <UiSkeleton key={index} className="skeleton-row" />
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="loading-row">
      <UiSpinner size="sm" label={label} className="spin" /> <span aria-hidden="true">{label}</span>
    </p>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="admin-toolbar">{children}</div>;
}

export function usePolling(refresh: () => void, ms: number, enabled = true) {
  const saved = useRef(refresh);
  saved.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => saved.current(), ms);
    return () => clearInterval(timer);
  }, [ms, enabled]);
}
