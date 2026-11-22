"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Box, ChevronDown, Container, Fingerprint, Radio, Terminal } from "lucide-react";
import { isProductPage } from "@/lib/product-pages";
import styles from "./site-links.module.css";

const products = [
  {
    href: "/inference",
    label: "Confidential inference",
    detail: "Models and provider routing",
    icon: Fingerprint,
  },
  { href: "/observability", label: "Observability", detail: "Traces and UsageMax", icon: Radio },
  { href: "/compute", label: "Compute", detail: "Explore compute products", icon: Box },
  { href: "/blackboxes", label: "Blackboxes", detail: "Attested VM rentals", icon: Container },
  { href: "/dry-docks", label: "Dry Docks", detail: "Build sandboxes · Coming soon", icon: Terminal },
] as const;

const links = [
  ["/models", "Models"],
  ["/pricing", "Pricing"],
  ["/docs", "Docs"],
  ["/blog", "Journal"],
  ["/contact", "Contact"],
] as const;

export function SiteLinks() {
  const path = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);
  const currentProduct = isProductPage(path.slice(1));

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const details = menu.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <nav aria-label="Main navigation">
      <details
        ref={menu}
        className={styles.products}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !menu.current?.open) return;
          menu.current.open = false;
          toggle.current?.focus();
        }}
        onBlur={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.open = false;
          }
        }}
      >
        <summary ref={toggle} className={styles.toggle} data-current={currentProduct || undefined}>
          Platform <ChevronDown size={13} aria-hidden="true" />
        </summary>
        <ul className={styles.panel} aria-label="Platform pages">
          {products.map(({ href, label, detail, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={path === href ? "page" : undefined}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                <span className={styles.icon}>
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <ArrowUpRight size={14} className={styles.arrow} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </details>
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
