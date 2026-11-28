import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

export type VisuallyHiddenProps = ComponentProps<"span">;

/** Content for assistive technology that must not appear visually. */
export function VisuallyHidden({ className, ...props }: VisuallyHiddenProps) {
  return <span className={cn("sr-only", className)} {...props} />;
}
