// spec/app/admin/index.md: the small pieces every admin view shares.
import type { ReactNode } from "react";

export function WorkspaceHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}

export function Panel({ label, children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={`rounded-md border border-border bg-card p-5 ${className}`}>
      {children}
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-12 text-center">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div aria-label={label} className="flex flex-col gap-3">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded bg-muted" />
    </div>
  );
}

const tones: Record<string, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  good: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  bad: "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400",
  info: "border-sky-600/30 bg-sky-600/10 text-sky-700 dark:text-sky-400",
};

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-9 rounded-md border border-border bg-background px-3 text-sm ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-9 rounded-md border border-border bg-background px-2 text-sm ${props.className ?? ""}`} />;
}

export function Button({ quiet, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { quiet?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`h-9 rounded-md border px-3 text-sm disabled:opacity-50 ${
        quiet ? "border-border bg-background text-foreground" : "border-primary bg-primary text-primary-foreground"
      } ${props.className ?? ""}`}
    />
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className="px-2 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xl">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function shortWallet(wallet: string) {
  return wallet.length > 12 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}

export function when(at: number) {
  return at > 0 ? new Date(at).toLocaleString() : "—";
}
