/* eslint-disable better-tailwindcss/no-unknown-classes -- playground migration preserves the original form markup, class names and screen structure */
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function PlaygroundCopyButton({ value, label = "Copy", text = label }: { value: string; label?: string; text?: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
  }
  return (
    <button type="button" className="button quiet small" onClick={() => void copy()} aria-label={status || label}>
      {status === "Copied" ? <Check size={15} /> : <Copy size={15} />}
      <span className={status ? "playground-copy-status" : undefined} onAnimationEnd={() => setStatus("")}>
        {status || text}
      </span>
    </button>
  );
}
