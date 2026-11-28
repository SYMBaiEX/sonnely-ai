import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button, CopyButton as UiCopyButton, EmptyState } from "@repo/ui";
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
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-1 inline-flex text-muted-foreground">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-heading font-medium tracking-heading text-foreground">{title}</h1>
          <p className="mt-1 max-w-3xl text-meta text-muted-foreground">{description}</p>
        </div>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function CopyButton({ value, label = "Copy", quiet = true, className = "" }: { value: string; label?: string; quiet?: boolean; className?: string }) {
  return <UiCopyButton value={value} label={label} text={label} variant={quiet ? "outline" : "primary"} className={className} />;
}

export function Empty({ title, children, icon }: { title: string; children: ReactNode; icon: ReactNode }) {
  return <EmptyState title={title} icon={icon}>{children}</EmptyState>;
}

export function Failure({ message }: { message: string }) {
  return message ? (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-ui text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

export function Detail({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-1">
      <dt className="text-micro font-medium uppercase tracking-micro text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-ui text-foreground" : "text-ui text-foreground"}>{children}</dd>
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
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between md:hidden"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal size={15} aria-hidden="true" />
          {label}
          {active > 0 && <span className="inline-grid min-w-5 place-items-center rounded-xl bg-primary/10 px-1.5 text-micro font-medium text-primary">{active}</span>}
        </span>
        <ChevronDown size={15} aria-hidden="true" className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </Button>
      <div className={open ? "mt-3 grid gap-3 md:mt-0" : "mt-3 hidden gap-3 md:mt-0 md:grid"}>
        {children}
      </div>
    </div>
  );
}
