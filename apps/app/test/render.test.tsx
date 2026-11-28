// spec/app/docs/index.md, "Story: Read the documentation" — every guide's page renders a landmark.
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { act } from "react";
import { docs } from "../gen/app__docs.ts";
import { DocsPage } from "../src/web/areas/docs/page.tsx";

for (const d of docs) {
  it(`renders ${d.slug} with a landmark`, () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    flushSync(() => createRoot(el).render(<DocsPage slug={d.slug} />));
    if (!el.querySelector("main,header,nav")) throw new Error(`no landmark for ${d.slug}`);
  });
}

describe("Docs wayfinding", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(() => vi.unstubAllGlobals());

  it("offers the quickstart on the overview without a redundant contents rail", () => {
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => root.render(<DocsPage slug="index" />));

    const quickstart = [...el.querySelectorAll("main a")].find((link) => link.textContent?.includes("Send your first request"));
    expect(quickstart?.getAttribute("href")).toBe("/docs/quickstart");
    expect(el.querySelector('[aria-label="On this page"]')).toBeNull();
    expect(el.querySelector('nav[aria-label="Documentation"] [aria-current="page"]')?.textContent).toBe("Overview");
    act(() => root.unmount());
  });

  it("keeps section navigation for the API reference", () => {
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => root.render(<DocsPage slug="api" />));

    const contents = el.querySelector('nav[aria-label="On this page"]');
    const anchor = contents?.querySelector("a")?.hash;
    expect(anchor).toBeTruthy();
    expect(el.querySelector(anchor ?? "#missing")).not.toBeNull();
    act(() => root.unmount());
  });

  it("keeps the single desktop section link on the migration guide", () => {
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => root.render(<DocsPage slug="migration" />));

    const link = el.querySelector('aside[aria-label="On this page"] a');
    expect(link?.textContent).toBe("Move your integration");
    expect(link?.getAttribute("href")).toBe("#move-your-integration");
    expect(el.querySelector("#move-your-integration")).not.toBeNull();
    act(() => root.unmount());
  });
});
