import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { checkIcon, copyIcon } from "../lib/icons.tsx";
import { Button, type ButtonProps } from "./Button.tsx";

export type CopyButtonProps = Omit<ButtonProps, "asChild" | "children" | "loading" | "onClick" | "onBlur" | "onPointerLeave" | "type" | "value"> & {
  /** The exact text placed on the clipboard. */
  value: string;
  /** The action's accessible name before it is copied. */
  label?: string;
  /** The visible text while idle; omit it for an icon-only button. */
  text?: ReactNode;
  /** The temporary label after copying succeeds. */
  copiedLabel?: string;
  /** The temporary label when the clipboard refuses the write. */
  failedLabel?: string;
};

/** Copies text and reports whether the clipboard accepted it, then returns to its idle label. */
export function CopyButton({ value, label = "Copy", text, copiedLabel = "Copied", failedLabel = "Copy failed", variant = "ghost", size = "sm", className, ...props }: CopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const statusLabel = status === "copied" ? copiedLabel : status === "failed" ? failedLabel : null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  const reset = () => setStatus("idle");
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={statusLabel ?? label}
      className={cn("gap-1.5", className)}
      onBlur={reset}
      onPointerLeave={reset}
      onClick={() => void copy()}
      {...props}
    >
      {status === "copied" ? checkIcon() : copyIcon()}
      {statusLabel ?? text ?? label}
    </Button>
  );
}
