import type { ComponentProps } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, focusRing } from "../lib/cn.ts";
import { xIcon } from "../lib/icons.tsx";

const drawerContentVariants = cva("fixed z-50 flex w-full flex-col gap-4 bg-popover p-6 text-popover-foreground shadow-lg outline-none", {
  variants: {
    side: {
      right: "inset-y-0 right-0 h-full max-w-md border-l border-border",
      left: "inset-y-0 left-0 h-full max-w-md border-r border-border",
    },
  },
  defaultVariants: { side: "right" },
});

export type DrawerProps = ComponentProps<typeof DialogPrimitive.Root>;
export type DrawerContentProps = ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof drawerContentVariants> & {
    /** The accessible name of the close button. */
    closeLabel?: string;
  };
export type DrawerTitleProps = ComponentProps<typeof DialogPrimitive.Title>;

/** A modal details panel beside the page. Holds a `DrawerTrigger` and a `DrawerContent`. */
export function Drawer(props: DrawerProps) {
  return <DialogPrimitive.Root {...props} />;
}

/** Opens the drawer; pass `asChild` to use a `Button`. */
export const DrawerTrigger = DialogPrimitive.Trigger;

/** Closes the drawer; pass `asChild` to use a `Button`. */
export const DrawerClose = DialogPrimitive.Close;

/** The panel beside a dimmed page. Needs a `DrawerTitle`; Escape and the close button dismiss it. */
export function DrawerContent({ side, closeLabel = "Close", className, children, ...props }: DrawerContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/50 dark:bg-background/75" />
      <DialogPrimitive.Content aria-describedby={undefined} className={cn(drawerContentVariants({ side }), className)} {...props}>
        {children}
        <DialogPrimitive.Close aria-label={closeLabel} className={cn(focusRing, "absolute top-4 right-4 rounded-sm text-muted-foreground hover:text-foreground")}>
          {xIcon()}
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** The drawer's heading and accessible name. */
export function DrawerTitle({ className, ...props }: DrawerTitleProps) {
  return <DialogPrimitive.Title className={cn("text-body leading-tight font-strong", className)} {...props} />;
}
