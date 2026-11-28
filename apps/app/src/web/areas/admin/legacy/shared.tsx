import { CopyButton as UiCopyButton } from "@repo/ui";

export function CopyButton({
  value,
  label = "Copy",
  text = label,
}: {
  value: string;
  label?: string;
  text?: string;
}) {
  return <UiCopyButton value={value} label={label} text={text} className="button quiet small" />;
}
