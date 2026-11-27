// spec/app/site/index.md, "Story: Check the service status"
import type { Page } from "../../../../gen/app__nav.ts";
import { pathOf } from "../../routes.ts";
import { ThemeSurface } from "./chrome.tsx";
import { Home } from "./home.tsx";
import { InferencePage } from "./products.tsx";
import { ModelsPage } from "./models.tsx";
import { PricingPage } from "./pricing.tsx";
import { ModelPage } from "./model.tsx";
import { StatusPage } from "./status.tsx";
import { PostPage } from "./post.tsx";
import { NotFound } from "./notfound.tsx";
import { JournalPage } from "./journal-index.tsx";
import { PrivacyPage, TermsPage } from "./legal.tsx";
import { VerifyPage } from "./verify.tsx";
import { ContactPage } from "./contact.tsx";
import "./site.css";
import "./contactx.css";
import "./correspondence.css";

export function render(page: Page): React.ReactNode {
  let body: React.ReactNode;
  switch (page.tag) {
    case "Home":
      body = <Home />;
      break;
    case "Inference":
      body = <InferencePage />;
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
    case "Unknown":
      body = <NotFound />;
      break;
    default:
      return null;
  }
  if (body === undefined) return null;
  return <ThemeSurface current={pathOf(page)}>{body}</ThemeSurface>;
}
