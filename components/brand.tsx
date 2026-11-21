import Link from "next/link";
import { Layers } from "lucide-react";

export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-icon">
        <Layers aria-hidden size={19} />
      </span>
      Sonnely
    </Link>
  );
}
