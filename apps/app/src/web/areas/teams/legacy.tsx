import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Copy } from "lucide-react";
import "../site/site.css";
import "./workspace-legacy.css";

export const shorten = (wallet: string) => wallet.slice(0, 4) + "…" + wallet.slice(-4);

export function creditDecimal(micros: number, minimumDecimals = 0) {
  const units = BigInt(micros);
  const scale = 1_000_000n;
  const whole = units / scale;
  const fraction = (units % scale).toString().padStart(6, "0").replace(/0+$/, "").padEnd(minimumDecimals, "0");
  return whole + (fraction ? "." + fraction : "");
}

export const creditBalance = (micros: number) => "$" + creditDecimal(micros, 2);

export function parseCreditAmount(value: string) {
  const decimal = /^(\d{1,10})(?:\.(\d{1,6}))?$/.exec(value.trim().replace(/^\./, "0."));
  if (!decimal) return null;
  const total = BigInt(decimal[1]) * 1_000_000n + BigInt((decimal[2] ?? "").padEnd(6, "0"));
  return total > 0n && total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

export function WorkspaceLegacy({ children }: { children: ReactNode }) {
  return <div className="workspace-legacy">{children}</div>;
}

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
      {children && <div className="console-title-actions">{children}</div>}
    </header>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  text = label,
}: {
  value: string;
  label?: string;
  text?: string;
}) {
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
    <button
      type="button"
      className="button quiet small"
      onClick={() => void copy()}
      onBlur={() => setStatus("")}
      onPointerLeave={() => setStatus("")}
      aria-label={status || label}
    >
      {status === "Copied" ? <Check size={15} /> : <Copy size={15} />}
      <span>{status || text}</span>
    </button>
  );
}
