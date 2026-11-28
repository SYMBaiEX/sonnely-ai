import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";
import { Spinner, type SpinnerProps } from "./Spinner.tsx";

export type LoadingStateProps = Omit<ComponentProps<"div">, "children"> & {
  /** What is loading, for assistive technology and the visible label. */
  label?: string;
  /** The spinner size. */
  size?: SpinnerProps["size"];
};

/** Stands where content is still loading and its duration is unknown. */
export function LoadingState({ label = "Loading", size = "md", className, ...props }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 p-8 text-center", className)} {...props}>
      <Spinner size={size} label={label} />
      <p aria-hidden className="text-ui text-muted-foreground">{label}</p>
    </div>
  );
}
