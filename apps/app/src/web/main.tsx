import { Layer, ManagedRuntime } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Machine } from "../../gen/app__nav.effect.vibe";
import { App } from "./App.tsx";
import "./index.css";
import { nav } from "./nav.vibe";

const runtime: ManagedRuntime.ManagedRuntime<Machine, unknown> = ManagedRuntime.make(
  Layer.provide(nav, KeyValueStore.layerStorage(() => localStorage)),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App runtime={runtime} path={location.pathname} />
  </StrictMode>,
);
