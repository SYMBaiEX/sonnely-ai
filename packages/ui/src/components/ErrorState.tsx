import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { alertIcon } from "../lib/icons.tsx";

export type ErrorStateProps = Omit<ComponentProps<"div">, "title"> & {
  /** What could not be shown, in a few words. */
  title: string;
  /** What the person can do next, when one sentence helps. */
  message?: string;
  /** The recovery control, usually a `Button`. */
  children?: ReactNode;
};

/** Stands where data or a view could not load. Announced immediately because it blocks the task. */
export function ErrorState({ title, message, className, children, ...props }: ErrorStateProps) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-4 p-8 text-center", className)} {...props}>
      {alertIcon({ className: "size-6 text-destructive" })}
      <div className="flex flex-col gap-1">
        <p className="text-ui font-medium text-foreground">{title}</p>
        {message ? <p className="text-meta text-muted-foreground">{message}</p> : null}
      </div>
      {children}
    </div>
  );
}
