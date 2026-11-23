import { ArrowUpRight } from "lucide-react";

export function SonnelySocialLink({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <a href="https://x.com/sonnelyai" className={className} aria-label="Sonnely on X">
      {compact ? "X" : "Sonnely on X"} <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}
