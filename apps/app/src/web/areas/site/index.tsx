// spec/app/site/index.md, "Story: Check the service status"
import type { Page } from "../../../../gen/app__nav.ts";
import { ThemeSurface } from "./chrome.tsx";
import { Home } from "./home.tsx";
import { ProductPage } from "./products.tsx";
import { ModelsPage } from "./models.tsx";
import { ModelPage } from "./model.tsx";
import { StatusPage } from "./status.tsx";
import { PostPage } from "./post.tsx";
import { PrivacyPage, TermsPage } from "./legal.tsx";
import { VerifyPage } from "./verify.tsx";
import { ContactPage } from "./contact.tsx";
import { wrap, caption, serif } from "./ui.ts";
import "./site.css";

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
    case "Compute":
      body = <ProductPage page="compute" />;
      break;
    case "Blackboxes":
      body = <ProductPage page="blackboxes" />;
      break;
    case "DryDocks":
      body = <ProductPage page="dry-docks" />;
      break;
    case "Models":
      body = <ModelsPage />;
      break;
    case "Model":
      body = <ModelPage provider={page.provider} model={page.model} />;
      break;
    case "Status":
      body = <StatusPage />;
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
      body = (
        <div className={wrap + " pt-6"}>
          <h1 style={serif} className="text-[clamp(34px,5vw,56px)] leading-[1.05] font-normal">
            Page not found
          </h1>
          <p className={caption}>Nothing is at this address.</p>
        </div>
      );
      break;
    default:
      return null;
  }
  if (body === undefined) return null;
  return <ThemeSurface>{body}</ThemeSurface>;
}
