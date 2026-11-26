// spec/app/nav.md, "Pages and console sections"
import type { Page, Section } from "../gen/app__nav.ts";

type ComputeProduct = "blackboxes" | "dry-docks";

const computeProductSurfaces = {
  blackboxes: {
    consoleSection: "Consoles",
    pageTag: "Blackboxes",
    publicPath: "/blackboxes",
    consolePath: "/console/blackboxes",
    docsPath: "/docs/blackboxes",
  },
  "dry-docks": {
    consoleSection: "Docks",
    pageTag: "DryDocks",
    publicPath: "/dry-docks",
    consolePath: "/console/dry-docks",
    docsPath: "/docs/dry-docks",
  },
} as const satisfies Record<
  ComputeProduct,
  { consoleSection: Section; pageTag: Page["tag"]; publicPath: string; consolePath: string; docsPath: string }
>;

const unreleasedComputeProducts: readonly ComputeProduct[] = ["blackboxes", "dry-docks"];

const unreleasedSections: ReadonlySet<Section> = new Set(
  unreleasedComputeProducts.map((product) => computeProductSurfaces[product].consoleSection),
);

const unreleasedPageTags: ReadonlySet<Page["tag"]> = new Set([
  ...unreleasedComputeProducts.map((product) => computeProductSurfaces[product].pageTag),
  ...(unreleasedComputeProducts.length === 0 ? [] : ["Compute" as const]),
]);

const unreleasedPublicPaths: ReadonlySet<string> = new Set([
  ...unreleasedComputeProducts.map((product) => computeProductSurfaces[product].publicPath),
  ...unreleasedComputeProducts.map((product) => computeProductSurfaces[product].consolePath),
  ...unreleasedComputeProducts.map((product) => computeProductSurfaces[product].docsPath),
  ...(unreleasedComputeProducts.length === 0 ? [] : ["/compute"]),
]);

export function sectionReleased(section: Section): boolean {
  return !unreleasedSections.has(section);
}

export function publicHrefReleased(href: string): boolean {
  const path = href.split("#", 1)[0].split("?", 1)[0];
  return !unreleasedPublicPaths.has(path);
}

export function publicPageReleased(page: Page): boolean {
  if (page.tag === "Doc") return publicHrefReleased("/docs/" + page.slug);
  return !unreleasedPageTags.has(page.tag);
}

export function docReleased(slug: string): boolean {
  return publicHrefReleased("/docs/" + slug);
}

export function computeProductsReleased(): boolean {
  return unreleasedComputeProducts.length === 0;
}
