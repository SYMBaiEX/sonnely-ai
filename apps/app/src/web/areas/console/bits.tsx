/* eslint-disable better-tailwindcss/no-unknown-classes -- shared console controls intentionally use the migrated console class names */
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { CopyButton as UiCopyButton, EmptyState } from "@repo/ui";
import "./data-rows.css";

export const shorten = (wallet: string) => wallet.slice(0, 4) + "…" + wallet.slice(-4);

export function creditDecimal(micros: number, minimumDecimals = 0) {
  const units = BigInt(Math.trunc(Math.abs(micros)));
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(minimumDecimals, "0");
  return (micros < 0 ? "-" : "") + whole + (fraction ? "." + fraction : "");
}

export const creditBalance = (micros: number) => "$" + creditDecimal(micros, 2);

export function parseCreditAmount(value: string) {
  const decimal = /^(\d{1,10})(?:\.(\d{1,6}))?$/.exec(value.trim().replace(/^\./, "0."));
  if (!decimal) return null;
  const total = BigInt(decimal[1]) * 1_000_000n + BigInt((decimal[2] ?? "").padEnd(6, "0"));
  return total > 0n && total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

export function formatRate(micros: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(micros / 1_000_000);
}

export const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(time);
export const dateTime = (time: number) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(time) + " UTC";
export const shortDate = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(time);
export const day = (time: number) => new Date(time).toISOString().slice(0, 10);
export const amount = (value: number | undefined) => value?.toLocaleString("en");
export const milliseconds = (value: number | undefined) => (value === undefined ? undefined : amount(value) + " ms");

export function WorkspaceHeading({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="console-title">
      <div className="console-title-identity">
        <span className="console-title-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children ? <div className="console-title-actions">{children}</div> : null}
    </header>
  );
}

export function CopyButton({ value, label = "Copy", quiet = true, className = "" }: { value: string; label?: string; quiet?: boolean; className?: string }) {
  return <UiCopyButton value={value} label={label} text={label} className={`button ${quiet ? "quiet" : ""} small ${className}`} />;
}

export function Empty({ title, children, icon }: { title: string; children: ReactNode; icon: ReactNode }) {
  return <EmptyState title={title} icon={icon} className="empty">{children}</EmptyState>;
}

export function Failure({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

export function Detail({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{children}</dd>
    </div>
  );
}

const narrowViewport = "(width <= 720px)";

export function FilterPanel({
  label,
  active = 0,
  className = "",
  children,
}: {
  label: string;
  active?: number;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || !window.matchMedia(narrowViewport).matches,
  );
  return (
    <div className={`filter-panel ${className}`}>
      <button
        type="button"
        className="filter-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="filter-toggle-label">
          <SlidersHorizontal size={15} aria-hidden="true" />
          {label}
          {active > 0 && <span className="filter-active-count">{active}</span>}
        </span>
        <ChevronDown size={15} aria-hidden="true" className="filter-chevron" />
      </button>
      <div className="filter-body" data-open={open}>
        {children}
      </div>
    </div>
  );
}
