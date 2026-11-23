"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Box, ChevronDown, Container, Fingerprint, Radio, Terminal } from "lucide-react";
import { isComputeProduct, type ComputeFeatures } from "@/lib/compute-features";
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
  { href: "/dry-docks", label: "Dry Docks", detail: "Isolated build sandboxes", icon: Terminal },
] as const;

const links = [
  ["/models", "Models"],
  ["/pricing", "Pricing"],
  ["/docs", "Docs"],
  ["/blog", "Journal"],
  ["/contact", "Contact"],
] as const;

export function SiteLinks({
  fromDocs = false,
  features,
  themeSwitch,
  consoleAction,
}: {
  fromDocs?: boolean;
  features: ComputeFeatures;
  themeSwitch: ReactNode;
  consoleAction: ReactNode;
}) {
  const path = usePathname();
  const navigationId = useId();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const mobileOpen = openPath === path;
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);
  const currentProduct = isProductPage(path.slice(1));
  const ProductLink = fromDocs ? "a" : Link;

  function closeMobile() {
    setOpenPath(null);
    if (menu.current) menu.current.open = false;
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || !mobileOpen) return;
    closeMobile();
    mobileToggle.current?.focus();
  }

  function closeOnFocusExit(event: FocusEvent) {
    if (
      mobileOpen &&
      event.relatedTarget &&
      !mobileToggle.current?.closest(".site-nav")?.contains(event.relatedTarget)
    ) {
      closeMobile();
    }
  }

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const details = menu.current;
      if (!(event.target instanceof Node)) return;
      if (details?.open && !details.contains(event.target)) details.open = false;
      if (mobileOpen && !mobileToggle.current?.closest(".site-nav")?.contains(event.target)) {
        closeMobile();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [mobileOpen]);

  useEffect(() => {
    const mobile = matchMedia("(max-width: 820px)");
    mobile.addEventListener("change", closeMobile);
    window.addEventListener("popstate", closeMobile);
    return () => {
      mobile.removeEventListener("change", closeMobile);
      window.removeEventListener("popstate", closeMobile);
    };
  }, []);

  return (
    <>
      <nav
        id={navigationId}
        ref={navigation}
        aria-label="Main navigation"
        data-mobile-open={mobileOpen || undefined}
        onBlur={closeOnFocusExit}
        onKeyDown={handleEscape}
      >
        <details
          ref={menu}
          className={styles.products}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !menu.current?.open) return;
            event.stopPropagation();
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
            {products
              .filter(({ href }) => {
                const id = href.slice(1);
                return !isComputeProduct(id) || features[id];
              })
              .map(({ href, label, detail, icon: Icon }) => (
                <li key={href}>
                  <ProductLink
                    href={href}
                    aria-current={path === href ? "page" : undefined}
                    onClick={closeMobile}
                  >
                    <span className={styles.icon}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>{detail}</small>
                    </span>
                    <ArrowUpRight size={14} className={styles.arrow} aria-hidden="true" />
                  </ProductLink>
                </li>
              ))}
          </ul>
        </details>
        {links.map(([href, label]) => {
          const NavLink = fromDocs && href !== "/docs" ? "a" : Link;
          return (
            <NavLink
              key={href}
              href={href}
              aria-current={path === href ? "page" : path.startsWith(href + "/") ? "location" : undefined}
              onClick={closeMobile}
            >
              {label}
            </NavLink>
          );
        })}
        <div className={styles.mobileConsole} onClick={closeMobile}>
          {consoleAction}
        </div>
      </nav>
      <div className="site-actions" onBlur={closeOnFocusExit} onKeyDown={handleEscape}>
        {themeSwitch}
        {consoleAction}
        <button
          ref={mobileToggle}
          className="mobile-menu-control"
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-controls={navigationId}
          aria-expanded={mobileOpen}
          onClick={() => {
            if (mobileOpen) closeMobile();
            else {
              setOpenPath(path);
              requestAnimationFrame(() => navigation.current?.querySelector("summary")?.focus());
            }
          }}
        >
          <span className="mobile-menu-glyph" aria-hidden="true">
            <span />
          </span>
        </button>
      </div>
    </>
  );
}
