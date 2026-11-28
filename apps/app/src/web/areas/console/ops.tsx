import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Drawer,
  DrawerContent,
  DrawerTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@repo/ui";

export const panelClass = "rounded-lg border border-border bg-card p-4";
export const actionRowClass = "flex flex-wrap items-center justify-end gap-2.5";

export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn("grid min-w-0 gap-1.5 text-meta font-medium text-muted-foreground", className)}>{children}</label>;
}

export type TableColumn<Row> = {
  label: string;
  value: (row: Row) => ReactNode;
  header?: boolean;
  span?: boolean;
  className?: string;
  optional?: boolean;
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
  const visibleColumns = columns.filter((column) => !column.optional || rows.some((row) => {
    const content = column.value(row);
    return content !== null && content !== undefined && content !== false && content !== "";
  }));
  return (
    <TableContainer className={cn("border-0 bg-transparent", className)} aria-labelledby={labelledBy} aria-label={ariaLabel}>
      <Table responsive className="text-left">
        <TableHeader>
          <TableRow>
            {visibleColumns.map((column) => (
              <TableHead key={column.label} data-ops-cell className="px-3 py-2.5 whitespace-nowrap text-micro font-medium uppercase tracking-micro">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {visibleColumns.map((column) => {
                const content = column.value(row);
                const classes = cn("px-3 py-2.5 align-middle whitespace-nowrap max-md:whitespace-normal max-md:wrap-anywhere", column.header && "font-medium", column.className);
                if (column.header) {
                  return (
                    <TableHead scope="row" key={column.label} data-ops-cell className={classes}>
                      {content}
                    </TableHead>
                  );
                }
                return <TableCell key={column.label} label={column.label} wide={column.span} data-ops-cell className={classes}>{content}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function StatusPill({ tone = "muted", children, className }: { tone?: "muted" | "ok" | "destructive" | "info" | "warn"; children: ReactNode; className?: string }) {
  return <Badge variant={tone} className={cn("font-mono", className)}>{children}</Badge>;
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="right" className="max-w-xl gap-0 overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 border-b border-border bg-popover px-5 py-4">
          <DrawerTitle asChild>
            <div>{title}</div>
          </DrawerTitle>
          <span className="w-6" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export function LinkButton({ children, href, variant = "outline" }: { children: ReactNode; href: string; variant?: "primary" | "secondary" | "outline" | "ghost" }) {
  return (
    <Button asChild variant={variant} size="sm">
      <a href={href}>{children}</a>
    </Button>
  );
}
