import type { ComponentProps, ReactNode } from "react";
import { Button, Dialog, DialogContent, DialogTitle, Input, cn } from "@repo/ui";

export const panelClass = "rounded-lg border border-border bg-card p-4";
export const actionRowClass = "flex flex-wrap items-center justify-end gap-2.5";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-ui text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn("grid min-w-0 gap-1.5 text-meta font-medium text-muted-foreground", className)}>{children}</label>;
}

export function TextInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} />;
}

export type TableColumn<Row> = {
  label: string;
  value: (row: Row) => ReactNode;
  header?: boolean;
  span?: boolean;
  className?: string;
};

export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  ariaLabel,
  labelledBy,
  className,
}: {
  rows: readonly Row[];
  columns: readonly TableColumn<Row>[];
  rowKey: (row: Row) => string;
  ariaLabel?: string;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} role="region" aria-labelledby={labelledBy} aria-label={ariaLabel} tabIndex={0}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-ui">
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column.label} data-ops-cell className="border-b border-border px-3 py-2.5 whitespace-nowrap text-micro font-medium uppercase tracking-micro text-muted-foreground">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => {
                  const content = column.value(row);
                  const classes = cn(
                    "border-b border-border px-3 py-2.5 align-middle whitespace-nowrap",
                    column.header && "font-medium",
                    column.className,
                  );
                  if (column.header) {
                    return (
                      <th scope="row" key={column.label} data-ops-cell className={classes}>
                        {content}
                      </th>
                    );
                  }
                  return <td key={column.label} data-ops-cell className={classes}>{content}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <article key={rowKey(row)} className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-4">
            {columns.map((column) => {
              const content = column.value(row);
              return (
                <div key={column.label} className={cn("min-w-0 content-start gap-1 wrap-anywhere", column.header ? "col-span-2 font-medium" : "grid", column.span && "col-span-2")}>
                  {!column.header && <span className="text-micro font-medium uppercase tracking-micro text-muted-foreground">{column.label}</span>}
                  {content}
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </div>
  );
}

const statusTones = {
  neutral: "border-border bg-secondary text-muted-foreground",
  ok: "border-ok/40 bg-ok/10 text-ok",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-info/40 bg-info/10 text-info",
  warn: "border-warn/40 bg-warn/10 text-warn",
} as const;

export function StatusPill({ tone = "neutral", children, className }: { tone?: keyof typeof statusTones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex w-max items-center whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-micro font-medium", statusTones[tone], className)}>
      {children}
    </span>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-card p-1" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-sm px-2.5 py-1.5 text-micro whitespace-nowrap text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            option.value === value && "bg-secondary font-medium text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5 rounded-md border border-border bg-card p-4">
      <span className="font-mono text-micro font-medium uppercase tracking-micro text-muted-foreground">{label}</span>
      <strong className="text-heading leading-heading font-strong tracking-heading wrap-anywhere">{value}</strong>
      {detail && <small className="text-meta text-muted-foreground wrap-anywhere">{detail}</small>}
    </div>
  );
}

export function DetailRows({ fields }: { fields: readonly [string, string | number | undefined][] }) {
  return (
    <dl className="grid">
      {fields.map(([name, value]) =>
        value === undefined ? null : (
          <div key={name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3 border-b border-border py-2.5 last:border-b-0">
            <dt className="text-ui text-muted-foreground">{name}</dt>
            <dd className="min-w-0 wrap-anywhere text-ui">{value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

export function SideDrawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-3 right-3 bottom-3 left-auto max-h-none w-full max-w-xl translate-none overflow-y-auto rounded-lg p-0">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-popover px-5 py-4">
          <DialogTitle asChild>
            <div>{title}</div>
          </DialogTitle>
          <span className="w-6" />
        </div>
        <div className="px-5 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function LinkButton({ children, href, variant = "outline" }: { children: ReactNode; href: string; variant?: "primary" | "secondary" | "outline" | "ghost" }) {
  return (
    <Button asChild variant={variant} size="sm">
      <a href={href}>{children}</a>
    </Button>
  );
}
