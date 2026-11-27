// spec/app/nav.md, "Story: Move around"
import { ArrowUpRight } from "lucide-react";
import { CorrespondenceHero } from "./chrome.tsx";
import { ProductIcon } from "./icons.tsx";
import { PlatformLinks } from "./products.tsx";
import { textLink } from "./ui.ts";

const recoveryLinks = [
  ["/console/chat", "Open the console", "Try a sample request in the playground.", "Terminal"],
  ["/models", "Compare models", "Rates, context windows, and privacy routes.", "Boxes"],
  ["/docs", "Read the documentation", "Quickstart, API reference, and guides.", "Code2"],
  ["/status", "Check service status", "Gateway, recovery, and provider checks.", "Activity"],
] as const;

export function NotFound() {
  return (
    <div className="wrap cor-page cor-notfound-page">
      <CorrespondenceHero
        eyebrow="Lost correspondence · Sonnely"
        title="Nothing is at this address."
        description="The link may be old, or the page may have moved. These desks are still open."
        brief={{
          title: "Address",
          rows: [
            ["Status", "Not found"],
            ["Moved", "/observability → /inference"],
          ],
        }}
        actionsLabel="Recovery actions"
        asideLabel="Address"
      >
        <a href="/">
          Sonnely home <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </CorrespondenceHero>
      <section className="cor-terms" aria-labelledby="notfound-recovery">
        <header>
          <span>Where to go next</span>
          <h2 id="notfound-recovery">Open desks</h2>
        </header>
        <div>
          {recoveryLinks.map(([href, label, description, icon]) => (
            <article key={href}>
              <ProductIcon name={icon} size={19} />
              <h3>{label}</h3>
              <p>{description}</p>
              <a href={href}>
                {label} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </section>
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
