// spec/app/docs/index.md — the docs area renders the catalog pages.
import type { Page } from "../../../../gen/app__nav.ts";
import { isDoc } from "../../../docs.ts";
import { DocsPage } from "./page.tsx";
import "./docs.css";

export function render(page: Page): React.ReactNode {
  if (page.tag === "Docs") return <DocsPage slug="index" />;
  if (page.tag === "Doc" && isDoc(page.slug)) return <DocsPage slug={page.slug} />;
  return null;
}
