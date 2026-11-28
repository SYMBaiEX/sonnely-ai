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
import { current, nav } from "../src/web/nav.vibe";

function makeRuntime(): ManagedRuntime.ManagedRuntime<Machine, unknown> {
  return ManagedRuntime.make(Layer.provide(nav, KeyValueStore.layerMemory));
}

function renderApp() {
  const runtime = makeRuntime();
  history.replaceState(null, "", "/");
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

it('returns focus to the mobile navigation trigger on Escape (spec/app/nav.md, "Story: Move around")', () => {
  const { el } = renderApp();
  const trigger = el.querySelector<HTMLButtonElement>(".mobile-menu-control")!;
  const link = el.querySelector<HTMLAnchorElement>("#site-navigation a")!;
  act(() => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  link.focus();
  act(() => {
    link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect([trigger.getAttribute("aria-expanded"), document.activeElement]).toEqual(["false", trigger]);
});

it('dismisses the mobile menu on route changes and when selecting the current home link (spec/app/nav.md, "Story: Move around")', async () => {
  const { el, runtime } = renderApp();
  const trigger = el.querySelector<HTMLButtonElement>(".mobile-menu-control")!;
  const brand = el.querySelector<HTMLAnchorElement>(".site-header .brand")!;
  act(() => trigger.click());
  await act(async () => { await navigate(runtime, { tag: "Models" }); });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await act(async () => { await navigate(runtime, { tag: "Home" }); });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  act(() => trigger.click());
  act(() => brand.click());
  expect([trigger.getAttribute("aria-expanded"), el.querySelector(".nav-dismiss")]).toEqual(["false", null]);
});

it('dismisses the mobile menu from the header theme control on Escape (spec/app/nav.md, "Story: Move around")', () => {
  const { el } = renderApp();
  const trigger = el.querySelector<HTMLButtonElement>(".mobile-menu-control")!;
  const theme = el.querySelector<HTMLButtonElement>(".site-actions button")!;
  act(() => trigger.click());
  theme.focus();
  act(() => {
    theme.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect([trigger.getAttribute("aria-expanded"), document.activeElement]).toEqual(["false", trigger]);
});

it('cycles the public header theme through system, light and dark (spec/app/nav.md, "Story: Move around")', () => {
  const { el } = renderApp();
  const theme = el.querySelector<HTMLButtonElement>(".site-actions button")!;
  expect(theme.textContent).toBe("dark");
  for (const next of ["system", "light", "dark"]) {
    act(() => theme.click());
    expect([theme.textContent, localStorage.getItem("sonnely.theme")]).toEqual([next, next]);
  }
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
it("jumps to an Inference topic without adding a page to browser history", async () => {
  const { el, runtime } = renderApp();
  await act(async () => {
    await navigate(runtime, { tag: "Inference" });
  });
  const link = el.querySelector<HTMLAnchorElement>('nav[aria-label="On this page"] a[href="#traces"]');
  const historyLength = history.length;
  act(() => {
    link?.click();
  });
  expect([location.pathname, location.hash, document.activeElement?.id, history.length]).toEqual([
    "/inference", "#traces", "traces", historyLength,
  ]);
});

// spec/app/nav.md, "Story: Move around"
it("keeps the page open when a same-page hash entry appears", async () => {
  const { el, runtime } = renderApp();
  await act(async () => {
    await navigate(runtime, { tag: "Inference" });
  });
  history.pushState(null, "", "/inference#evidence");
  act(() => {
    window.dispatchEvent(new Event("popstate"));
  });
  const current = el.querySelector(".site-nav nav a[aria-current='page']");
  expect([current?.getAttribute("href"), location.hash]).toEqual(["/inference", "#evidence"]);
});

// spec/app/nav.md, "Story: Move around"
it("does not reopen the current page", async () => {
  const runtime = makeRuntime();
  history.replaceState(null, "", "/");
  await navigate(runtime, { tag: "Inference" });
  const before = await runtime.runPromise(current());
  await navigate(runtime, { tag: "Inference" });
  const after = await runtime.runPromise(current());
  expect(after).toEqual(before);
});

// spec/app/nav.md, "Story: Move around"
it("moves focus to a same-page hash target without adding history", async () => {
  const runtime = makeRuntime();
  history.replaceState(null, "", "/");
  await navigate(runtime, { tag: "Inference" });
  const target = document.createElement("section");
  target.id = "focus-target";
  document.body.appendChild(target);
  const historyLength = history.length;
  try {
    await navigate(runtime, { tag: "Inference" }, "#focus-target");
    expect([location.hash, document.activeElement, history.length]).toEqual(["#focus-target", target, historyLength]);
  } finally {
    target.remove();
  }
});

// spec/app/nav.md, "Story: Move around"
it("treats a trailing slash as the current page", async () => {
  const runtime = makeRuntime();
  history.replaceState(null, "", "/docs/quickstart/");
  const historyLength = history.length;
  await navigate(runtime, { tag: "Doc", slug: "quickstart" }, "#set-up-your-workspace");
  expect([location.pathname, location.hash, history.length]).toEqual([
    "/docs/quickstart", "#set-up-your-workspace", historyLength,
  ]);
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
