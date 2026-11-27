// spec/app/site/index.md, "Story: Check the service status"
import type { Page } from "../../../../gen/app__nav.ts";
import { ArrowUpRight } from "lucide-react";
import { pathOf } from "../../routes.ts";
import { SiteLead, ThemeSurface } from "./chrome.tsx";
import { ProductIcon } from "./icons.tsx";
import { Home } from "./home.tsx";
import { PlatformLinks, ProductPage } from "./products.tsx";
import { ModelsPage } from "./models.tsx";
import { PricingPage } from "./pricing.tsx";
import { ModelPage } from "./model.tsx";
import { StatusPage } from "./status.tsx";
import { PostPage } from "./post.tsx";
import { JournalPage } from "./journal-index.tsx";
import { PrivacyPage, TermsPage } from "./legal.tsx";
import { VerifyPage } from "./verify.tsx";
import { ContactPage } from "./contact.tsx";
import { ContactEditorialPage } from "./contact-editorial.tsx";
import { ContactRoutingPage } from "./contact-routing.tsx";
import { ContactCorrespondencePage } from "./contact-correspondence.tsx";
import { ContactSignalPage } from "./contact-signal.tsx";
import { textLink, wrap } from "./ui.ts";
import "./site.css";
import "./contactx.css";
import "./correspondence.css";

const recoveryLinks = [
  ["/console/chat", "Open the console", "Try a sample request in the playground.", "Terminal"],
  ["/models", "Compare models", "Rates, context windows, and privacy routes.", "Boxes"],
  ["/docs", "Read the documentation", "Quickstart, API reference, and guides.", "Code2"],
  ["/status", "Check service status", "Gateway, recovery, and provider checks.", "Activity"],
] as const;

function NotFound() {
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

export function render(page: Page): React.ReactNode {
  let body: React.ReactNode;
  switch (page.tag) {
    case "Home":
      body = <Home />;
      break;
    case "Inference":
      body = <ProductPage page="inference" />;
      break;
    case "Observability":
      body = <ProductPage page="observability" />;
      break;
    case "Models":
      body = <ModelsPage />;
      break;
    case "Pricing":
      body = <PricingPage />;
      break;
    case "Model":
      body = <ModelPage provider={page.provider} model={page.model} />;
      break;
    case "Status":
      body = <StatusPage />;
      break;
    case "Journal":
      body = <JournalPage />;
      break;
    case "Post":
      body = <PostPage slug={page.slug} />;
      break;
    case "Privacy":
      body = <PrivacyPage />;
      break;
    case "Terms":
      body = <TermsPage />;
      break;
    case "Verify":
      body = <VerifyPage />;
      break;
    case "Contact":
      body = <ContactPage />;
      break;
    case "ContactOne":
      body = <ContactEditorialPage />;
      break;
    case "ContactTwo":
      body = <ContactRoutingPage />;
      break;
    case "ContactThree":
      body = <ContactCorrespondencePage />;
      break;
    case "ContactFour":
      body = <ContactSignalPage />;
      break;
    case "Unknown":
      body = <NotFound />;
      break;
    default:
      return null;
  }
  if (body === undefined) return null;
  return <ThemeSurface current={pathOf(page)}>{body}</ThemeSurface>;
}
