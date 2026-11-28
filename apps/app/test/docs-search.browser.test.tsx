import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
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
    const search = page.getByRole("combobox", { name: "Search documentation" });
    await search.fill("nonexistent-guide-123");
    await expect.element(page.getByRole("status")).toMatchTextContent(/Try a guide title or a shorter term\./);
    await search.fill("Teams and projects");
    const result = page.getByRole("option").first();
    await expect.element(result).toHaveAttribute("href", "/docs/teams");
    const link = result.element();
    const bounds = link.getBoundingClientRect();
    expect(link.contains(document.elementFromPoint(bounds.right - 6, bounds.top + bounds.height / 2))).toBe(true);
    const input = search.element();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await expect.element(search).toHaveAttribute("aria-activedescendant", "docs-search-option-0");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await expect.element(search).toHaveValue("Teams and projects");
  } finally {
    root.unmount();
    container.remove();
  }
});

it('moves focus at once to the control a collapsed-pill button targets (spec/app/docs/index.md, "Story: Read the documentation")', async () => {
  await page.viewport(1440, 900);
  localStorage.setItem("sonnely.docs.sidebar", "collapsed");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    root.render(<DocsPage slug="index" />);
    const openSidebar = page.getByRole("button", { name: "Open sidebar" });
    const collapse = page.getByRole("button", { name: "Collapse sidebar" });
    const searchPill = page.getByRole("button", { name: "Search documentation" });
    const search = page.getByRole("combobox", { name: "Search documentation" });
    await expect.element(openSidebar).toBeVisible();

    await openSidebar.click();
    expect(document.activeElement).toBe(collapse.element());

    await collapse.click();
    await expect.element(openSidebar).toBeVisible();
    await searchPill.click();
    expect(document.activeElement).toBe(search.element());
    await userEvent.keyboard("t");
    await expect.element(search).toHaveValue("t");

    await collapse.click();
    await expect.element(openSidebar).toBeVisible();
    openSidebar.element().focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(collapse.element());
  } finally {
    root.unmount();
    container.remove();
    localStorage.removeItem("sonnely.docs.sidebar");
  }
});
