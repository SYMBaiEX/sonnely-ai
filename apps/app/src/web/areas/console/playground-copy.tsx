/* eslint-disable better-tailwindcss/no-unknown-classes -- playground migration preserves the original form markup, class names and screen structure */
import { CopyButton } from "@repo/ui";

export function PlaygroundCopyButton({ value, label = "Copy", text = label }: { value: string; label?: string; text?: string }) {
  return <CopyButton value={value} label={label} text={text} className="button quiet small" />;
}
