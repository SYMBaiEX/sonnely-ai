"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/models", "Models"],
  ["/pricing", "Pricing"],
  ["/docs", "Docs"],
  ["/blog", "Journal"],
  ["/contact", "Contact"],
];

export function SiteLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : path.startsWith(href + "/") ? "location" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
