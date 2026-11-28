// spec/app/nav.md, "Story: Move around"
// @vitest-environment happy-dom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
import { expect, it } from "vitest";
import { Layer, ManagedRuntime } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Machine } from "../gen/app__nav.effect.vibe";
import { App, navigate } from "../src/web/App.tsx";
import { nav } from "../src/web/nav.vibe";

function renderApp() {
  const runtime: ManagedRuntime.ManagedRuntime<Machine, unknown> = ManagedRuntime.make(
    Layer.provide(nav, KeyValueStore.layerMemory),
  );
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(<App runtime={runtime} path="/" />);
  });
  return { el, runtime };
}

// spec/app/nav.md, "Story: Move around"
it("highlights the route just opened, not the one before", async () => {
  const { el, runtime } = renderApp();
  await act(async () => {
    await navigate(runtime, { tag: "Pricing" });
    await navigate(runtime, { tag: "Models" });
  });
  const current = el.querySelector(".site-nav nav a[aria-current='page']");
  expect(current?.getAttribute("href")).toBe("/models");
});

// spec/app/nav.md, "Story: Move around"
it("keeps the hash of a cross-page link and scrolls to its element", async () => {
  const { el, runtime } = renderApp();
  const anchor = document.createElement("a");
  anchor.href = "/inference#evidence";
  el.appendChild(anchor);
  let scrolled = "";
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () {
    scrolled = (this as Element).id;
  };
  try {
    await act(async () => {
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect([location.pathname, location.hash, scrolled]).toEqual(["/inference", "#evidence", "evidence"]);
  } finally {
    Element.prototype.scrollIntoView = original;
  }
});

// spec/app/nav.md, "Story: Move around"
it("drops the hash when navigating without one", async () => {
  const { runtime } = renderApp();
  await act(async () => {
    await navigate(runtime, { tag: "Inference" }, "#evidence");
    await navigate(runtime, { tag: "Pricing" });
  });
  expect(location.pathname + location.hash).toBe("/pricing");
});

// spec/app/nav.md, "Story: Move around"
it("jumps between pricing sections without leaving the page", async () => {
  const { el, runtime } = renderApp();
  await act(async () => {
    await navigate(runtime, { tag: "Pricing" });
  });
  const historyLength = history.length;
  act(() => {
    el.querySelector<HTMLAnchorElement>('.pricing-hero a[href="#estimate"]')?.click();
  });
  expect([location.pathname, location.hash, document.activeElement?.id, history.length]).toEqual([
    "/pricing", "#estimate", "estimate", historyLength,
  ]);
  act(() => {
    el.querySelector<HTMLAnchorElement>('#estimate a[href="#inference-rates"]')?.click();
  });
  expect([location.pathname, location.hash, document.activeElement?.id, history.length]).toEqual([
    "/pricing", "#inference-rates", "inference-rates", historyLength,
  ]);
});
