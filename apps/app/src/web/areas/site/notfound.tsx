// spec/app/nav.md, "Story: Move around"
import { ArrowUpRight } from "lucide-react";
import { SiteLead } from "./chrome.tsx";
import { ProductIcon } from "./icons.tsx";
import { PlatformLinks } from "./products.tsx";
import { textLink, wrap } from "./ui.ts";

const recoveryLinks = [
  ["/console/chat", "Open the console", "Try a sample request in the playground.", "Terminal"],
  ["/models", "Compare models", "Rates, context windows, and privacy routes.", "Boxes"],
  ["/docs", "Read the documentation", "Quickstart, API reference, and guides.", "Code2"],
  ["/status", "Check service status", "Gateway, recovery, and provider checks.", "Activity"],
] as const;

export function NotFound() {
  return (
    <div className={wrap + " inner-page market-page"}>
      <SiteLead
        title="Page not found"
        description="Nothing is at this address. The link may be old, or the page may have moved."
        back={["/", "Sonnely home"]}
      />
      <ul className="product-linkList notfound-recovery" role="list" aria-label="Where to go next">
        {recoveryLinks.map(([href, label, description, icon]) => (
          <li key={href}>
            <a href={href}>
              <ProductIcon name={icon} size={20} />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="notfound-contact">
        Looking for something specific?{" "}
        <a className={textLink} href="/contact">
          Contact Sonnely <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </p>
      <PlatformLinks compact />
    </div>
  );
}

