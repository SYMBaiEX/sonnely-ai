import type { ReactNode } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  SegmentedControl,
  SegmentedControlItem,
  Table,
  TableContainer,
  cn,
} from "@repo/ui";

export function AdminLoading() {
  return <LoadingState label="Loading admin data" />;
}

export function AdminError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <ErrorState title="Admin data unavailable" message={message}>
      <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
    </ErrorState>
  );
}

export function Panel({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("min-w-0 gap-0 overflow-hidden p-0", className)}>
      {Boolean(title || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          {title && <CardTitle className="text-ui font-medium">{title}</CardTitle>}
          {aside}
        </div>
      )}
      <div className="min-w-0">{children}</div>
    </Card>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <EmptyState title={title} className="py-10">{children}</EmptyState>;
}

export function ChoiceGroup<T extends string>({ label, value, choices, onChange }: {
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <SegmentedControl value={value} aria-label={label} onValueChange={(next) => onChange(next as T)}>
      {choices.map((choice) => <SegmentedControlItem key={choice.value} value={choice.value}>{choice.label}</SegmentedControlItem>)}
    </SegmentedControl>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="gap-1 px-4 py-3">
      <p className="text-micro font-medium uppercase tracking-micro text-muted-foreground">{label}</p>
      <p className="text-heading font-medium tracking-heading text-foreground">{value}</p>
      {hint === undefined ? null : <p className="text-meta text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function StatusMark({ tone, children }: { tone: "ok" | "warn" | "error" | "info" | "muted"; children: ReactNode }) {
  return <Badge variant={tone === "error" ? "destructive" : tone}>{children}</Badge>;
}

export function stateTone(state: string): "ok" | "warn" | "error" | "info" | "muted" {
  if (["Active", "Complete", "Resolved", "Finalized", "done"].includes(state)) return "ok";
  if (["Pending", "Open", "Unreported"].includes(state)) return "warn";
  if (["Failed", "Suspended", "Revoked", "Expired"].includes(state)) return "error";
  if (["InProgress"].includes(state)) return "info";
  return "muted";
}

export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <TableContainer className="rounded-none border-0" label="Admin data">
      <Table responsive>{children}</Table>
    </TableContainer>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <Alert variant="destructive" className="mt-3">{message}</Alert>;
}
