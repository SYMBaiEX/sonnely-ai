import type { ComponentProps } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn, focusRing } from "../lib/cn.ts";

export type SegmentedControlProps = Omit<ComponentProps<typeof RadioGroupPrimitive.Root>, "disabled">;
export type SegmentedControlItemProps = Omit<ComponentProps<typeof RadioGroupPrimitive.Item>, "children"> & {
  /** The choice text. */
  children?: ComponentProps<typeof RadioGroupPrimitive.Item>["children"];
};

/** Chooses one value from a small visible set. Use it for view or grouping choices, not for navigation. */
export function SegmentedControl({ className, ...props }: SegmentedControlProps) {
  return <RadioGroupPrimitive.Root className={cn("inline-flex w-fit items-center gap-1 rounded-md bg-muted p-1", className)} {...props} />;
}

/** One choice in a `SegmentedControl`; arrow keys move between choices. */
export function SegmentedControlItem({ className, children, ...props }: SegmentedControlItemProps) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        focusRing,
        "inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-ui font-medium whitespace-nowrap text-muted-foreground transition-colors duration-fast ease-standard disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}
