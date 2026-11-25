/* eslint-disable better-tailwindcss/no-unknown-classes -- these controls intentionally use the migrated observability class names */
// spec/app/console/index.md, "Story: Open the console"
import { Check, Copy, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

export const providerIds = ["near-ai", "phala", "tinfoil"] as const;
export type ProviderId = (typeof providerIds)[number];
export const providerNames: Record<string, string> = { "near-ai": "NEAR AI", phala: "Phala", tinfoil: "Tinfoil" };

const scale = 1_000_000;
const scaleBig = BigInt(scale);

export function creditDecimal(micros: number, minimumDecimals = 0) {
  const units = BigInt(micros);
  const whole = units / scaleBig;
  const fraction = (units % scaleBig).toString().padStart(6, "0").replace(/0+$/, "").padEnd(minimumDecimals, "0");
  return whole.toString() + (fraction ? "." + fraction : "");
}

export const creditBalance = (micros: number) => "$" + creditDecimal(micros, 2);

export function parseCreditAmount(value: string): number | null {
  const decimal = /^(\d{1,10})(?:\.(\d{1,6}))?$/.exec(value.trim().replace(/^\./, "0."));
  if (!decimal) return null;
  const total = BigInt(decimal[1]) * scaleBig + BigInt((decimal[2] ?? "").padEnd(6, "0"));
  return total > 0n && total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

export const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(time);
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
          <Icon size={21} aria-hidden="true" />
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

export function CopyButton({ value, label = "Copy", text = label }: { value: string; label?: string; text?: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
  }
  return (
    <button type="button" className="button quiet small" onClick={() => void copy()} aria-label={status || label}>
      {status === "Copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      <span>{status || text}</span>
    </button>
  );
}

export function Empty({ title, children, icon }: { title: string; children: ReactNode; icon: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

export function Failure({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
