import type { ComponentProps } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn, focusRing } from "../lib/cn.ts";

export type TabsProps = ComponentProps<typeof TabsPrimitive.Root>;
export type TabsListProps = ComponentProps<typeof TabsPrimitive.List>;
export type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger>;
export type TabsContentProps = ComponentProps<typeof TabsPrimitive.Content>;

/** Switches between panels in the same view. Holds a `TabsList` and the `TabsContent` panels. */
export function Tabs({ className, ...props }: TabsProps) {
  return <TabsPrimitive.Root className={cn("flex flex-col", className)} {...props} />;
}

/** The row of tab controls. */
export function TabsList({ className, ...props }: TabsListProps) {
  return <TabsPrimitive.List className={cn("inline-flex w-fit items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground", className)} {...props} />;
}

/** Selects one panel. Arrow keys move between tabs. */
export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        focusRing,
        "inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-ui font-medium whitespace-nowrap transition-colors duration-fast ease-standard disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

/** The panel named by its matching `TabsTrigger`. */
export function TabsContent({ className, ...props }: TabsContentProps) {
  return <TabsPrimitive.Content className={cn("mt-4 outline-none", className)} {...props} />;
}
