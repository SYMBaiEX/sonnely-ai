import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { page } from "vitest/browser";
import "../src/web/areas/site/site.css";
import { ModelsPage } from "../src/web/areas/site/models.tsx";

it('recovers from a search with no matches without losing the selected list or sort (spec/app/models.md, "Story: Filter the catalog")', async () => {
  await page.viewport(390, 844);
  const container = document.createElement("main");
  container.className = "site";
  document.body.append(container);
  const root = createRoot(container);
  try {
    root.render(<ModelsPage />);
    const search = page.getByRole("searchbox");
    const status = page.getByRole("status");
    const filters = page.getByRole("button", { name: /filter & sort/i });
    const providerOnly = page.getByRole("button", { name: /provider only/i });
    const provider = page.getByRole("combobox", { name: "Provider" });
    const workload = page.getByRole("combobox", { name: "Workload" });
    const sort = page.getByRole("combobox", { name: "Sort by" });
    await providerOnly.click();
    await expect.element(providerOnly).toHaveAttribute("aria-pressed", "true");
    const firstResult = page.getByRole("article").first();
    await expect.element(firstResult).toBeVisible();
    const liveRegion = status.element();
    const initialStatus = liveRegion.textContent;
    await expect.element(filters).toHaveAttribute("aria-expanded", "false");
    await filters.click();
    await provider.selectOptions("NearAI");
    await workload.selectOptions("ChatCompletions");
    await sort.selectOptions("ByName");
    await filters.click();
    await search.fill("not-a-model-test-12345");
    const clearFilters = page.getByRole("button", { name: "Clear search and filters" });
    await expect.element(clearFilters).toBeVisible();
    expect(status.element()).toBe(liveRegion);
    expect(liveRegion.textContent).not.toBe(initialStatus);
    await clearFilters.click();
    await expect.element(search).toHaveValue("");
    await expect.element(search).toHaveFocus();
    await expect.element(providerOnly).toHaveAttribute("aria-pressed", "true");
    await expect.element(firstResult).toBeVisible();
    expect(status.element()).toBe(liveRegion);
    expect(liveRegion.textContent).toBe(initialStatus);
    await filters.click();
    await expect.element(provider).toHaveValue("");
    await expect.element(workload).toHaveValue("");
    await expect.element(sort).toHaveValue("ByName");
  } finally {
    root.unmount();
    container.remove();
  }
});
