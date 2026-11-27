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
