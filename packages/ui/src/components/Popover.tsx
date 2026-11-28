import type { ComponentProps } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../lib/cn.ts";

export type PopoverProps = ComponentProps<typeof PopoverPrimitive.Root>;
export type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Content>;

/** A small non-modal panel behind a trigger. Holds a `PopoverTrigger` and a `PopoverContent`. */
export function Popover(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

/** Opens the popover; pass `asChild` to use a `Button`. */
export const PopoverTrigger = PopoverPrimitive.Trigger;

/** Closes the popover; pass `asChild` to use a `Button`. */
export const PopoverClose = PopoverPrimitive.Close;

/** The panel. Escape closes it and focus returns to the trigger. */
export function PopoverContent({ sideOffset = 4, className, ...props }: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 w-72 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
