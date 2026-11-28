import type { ComponentProps } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn, focusRing } from "../lib/cn.ts";

export type DropdownMenuProps = ComponentProps<typeof DropdownMenuPrimitive.Root>;
export type DropdownMenuContentProps = ComponentProps<typeof DropdownMenuPrimitive.Content>;
export type DropdownMenuItemProps = ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  /** Uses the destructive semantic color for an irreversible or dangerous action. */
  destructive?: boolean;
};
export type DropdownMenuLabelProps = ComponentProps<typeof DropdownMenuPrimitive.Label>;
export type DropdownMenuSeparatorProps = ComponentProps<typeof DropdownMenuPrimitive.Separator>;

/** A menu of actions behind a trigger. Holds a `DropdownMenuTrigger` and a `DropdownMenuContent`. */
export function DropdownMenu(props: DropdownMenuProps) {
  return <DropdownMenuPrimitive.Root {...props} />;
}

/** Opens the menu; pass `asChild` to use a `Button`. */
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

/** The menu panel. Arrow keys move through its items and Escape closes it. */
export function DropdownMenuContent({ sideOffset = 4, className, ...props }: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg", className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

/** One action in a `DropdownMenuContent`. */
export function DropdownMenuItem({ destructive = false, className, ...props }: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        focusRing,
        "flex cursor-default items-center gap-2 rounded-sm px-3 py-2 text-ui outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

/** A group name inside a `DropdownMenuContent`. */
export function DropdownMenuLabel({ className, ...props }: DropdownMenuLabelProps) {
  return <DropdownMenuPrimitive.Label className={cn("px-3 py-2 text-micro font-medium tracking-micro text-muted-foreground uppercase", className)} {...props} />;
}

/** Separates groups inside a `DropdownMenuContent`. */
export function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
