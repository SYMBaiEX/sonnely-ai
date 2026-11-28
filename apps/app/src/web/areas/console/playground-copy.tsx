import { CopyButton } from "@repo/ui";

export function PlaygroundCopyButton({ value, label = "Copy", text = label }: { value: string; label?: string; text?: string }) {
  return <CopyButton value={value} label={label} text={text} variant="outline" size="sm" />;
}
