import type { ComponentProps } from "react";
import { cn, fieldFocus } from "../lib/cn.ts";
import { chevronDownIcon } from "../lib/icons.tsx";

export type SelectProps = Omit<ComponentProps<"select">, "children"> & {
  /** Marks the value as refused, visibly and through `aria-invalid`. */
  invalid?: boolean;
  /** Classes for the positioning wrapper when the control needs layout-level sizing. */
  wrapperClassName?: string;
  /** The `option` elements a person chooses from. */
  children?: ComponentProps<"select">["children"];
};

/** A native single-choice field with the system control treatment. Name it with a `Label`, `Field` or `aria-label`. */
export function Select({ invalid = false, wrapperClassName, className, children, ...props }: SelectProps) {
  return (
    <span className={cn("relative inline-flex w-full", wrapperClassName)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          fieldFocus,
          "h-9 w-full appearance-none rounded-md border border-input bg-background pr-9 pl-3 text-ui text-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {chevronDownIcon({ className: "pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" })}
    </span>
  );
}
