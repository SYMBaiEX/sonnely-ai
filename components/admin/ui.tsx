"use client";

import { Loader2, SearchX } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Pill({
  tone = "muted",
  children,
}: {
  tone?: "ok" | "warn" | "error" | "info" | "muted";
  children: ReactNode;
}) {
  return <span className={"pill" + (tone === "muted" ? "" : " pill-" + tone)}>{children}</span>;
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
    <div className="empty-state">
      <SearchX size={20} aria-hidden="true" />
      <p className="empty-title">{title}</p>
      {hint && <p className="caption">{hint}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-row" />
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="loading-row" role="status">
      <Loader2 size={15} className="spin" aria-hidden="true" /> {label}
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
