"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isProductPage } from "@/lib/product-pages";

const links = [
  ["/inference", "Platform"],
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
          aria-current={
            path === href
              ? "page"
              : path.startsWith(href + "/") || (href === "/inference" && isProductPage(path.slice(1)))
                ? "location"
                : undefined
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
