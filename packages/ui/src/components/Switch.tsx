import type { ComponentProps } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn, focusRing } from "../lib/cn.ts";

export type SwitchProps = Omit<ComponentProps<typeof SwitchPrimitive.Root>, "children">;

/** A two-state setting that takes effect immediately. Name it with a `Label`, `Field` or `aria-label`. */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        focusRing,
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform duration-fast ease-standard data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}
