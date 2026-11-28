import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.ts";

const badgeVariants = cva("inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-micro font-medium whitespace-nowrap", {
  variants: {
    variant: {
      muted: "border-border bg-secondary text-secondary-foreground",
      primary: "border-primary bg-primary text-primary-foreground",
      ok: "border-ok/40 bg-ok/10 text-foreground",
      warn: "border-warn/40 bg-warn/10 text-foreground",
      destructive: "border-destructive/40 bg-destructive/10 text-foreground",
      info: "border-info/40 bg-info/10 text-foreground",
    },
  },
  defaultVariants: { variant: "muted" },
});

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

/** A short status or category. Use the semantic variant that matches the meaning, never color alone. */
export function Badge({ variant, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
