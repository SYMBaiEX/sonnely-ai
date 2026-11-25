// Shared pieces of the console pages: the section heading, a copy button and the money formatting the workspace uses.
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Copy } from "lucide-react";

/** A wallet or key id shortened for display, as the legacy console shows it. */
export const shorten = (wallet: string) => wallet.slice(0, 4) + "…" + wallet.slice(-4);

/** Micro-USD as "$w.ff" — the console's charge formatting. */
export function creditBalance(micros: number) {
  const whole = Math.floor(micros / 1_000_000);
  const fraction = (micros % 1_000_000).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return "$" + whole + (fraction ? "." + fraction : "");
}

/** Micro-USD per million tokens (or per request) as a price string. */
export function formatRate(micros: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(micros / 1_000_000);
}

/** A section's icon, name, one line on what it is for, and the actions beside them. */
export function WorkspaceHeading({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="workspace-heading">
      <div>
        <span className="workspace-heading-icon">
          <Icon size={21} aria-hidden="true" />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children && <div className="workspace-heading-actions">{children}</div>}
    </header>
  );
}

/** Copies `text` to the clipboard; confirms for a moment. */
export function CopyButton({ text, label = "Copy", quiet = true, className = "" }: { text: string; label?: string; quiet?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`button ${quiet ? "quiet" : ""} ${className}`}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

/** A small labeled value, as the console's detail grids show it. */
export function Detail({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{children}</dd>
    </div>
  );
}
