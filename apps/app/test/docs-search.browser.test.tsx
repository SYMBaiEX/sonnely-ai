import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { page } from "vitest/browser";
import "../src/web/areas/site/site.css";
import "../src/web/areas/docs/docs.css";
import { DocsPage } from "../src/web/areas/docs/page.tsx";

it('makes the search result clickable across its width (spec/app/docs/index.md, "Story: Read the documentation")', async () => {
  await page.viewport(1440, 900);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    root.render(<DocsPage slug="index" />);
    const search = page.getByRole("searchbox", { name: "Search documentation" });
    await search.fill("nonexistent-guide-123");
    await expect.element(page.getByRole("status")).toMatchTextContent(/Try a guide title or a shorter term\./);
    await search.fill("Teams and projects");
    const result = page.getByRole("option").first();
    await expect.element(result).toHaveAttribute("href", "/docs/teams");
    const link = result.element();
    const bounds = link.getBoundingClientRect();
    expect(link.contains(document.elementFromPoint(bounds.right - 6, bounds.top + bounds.height / 2))).toBe(true);
  } finally {
    root.unmount();
    container.remove();
  }
});
