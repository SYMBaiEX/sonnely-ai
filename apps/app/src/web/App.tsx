// spec/app/nav.md, "Story: Move around"
import { Exit, type ManagedRuntime } from "effect";
import { useEffect, useRef } from "react";
import type { Machine } from "../../gen/app__nav.effect.vibe";
import { useMachine } from "../../gen/app__nav.react.ts";
import type { Page } from "../../gen/app__nav.ts";
import { back, open } from "./nav.vibe";
import { pageOf, pathOf, redirectOf } from "./routes.ts";
import { titleOf } from "./titles.ts";

export interface AreaModule {
  /** The page this area renders, or null to leave it to another area. */
  render(page: Page): React.ReactNode;
}

const areas = import.meta.glob<AreaModule>("./areas/*/index.tsx", { eager: true });

export interface AppProps {
  /** Provides the navigator: `nav` of nav.vibe over a store. */
  runtime: ManagedRuntime.ManagedRuntime<Machine, unknown>;
  /** The path the page was opened with. */
  path: string;
}

let pendingScrollHash: string | null = null;

function scrollToHash(hash: string): boolean {
  const target = document.getElementById(hash.slice(1));
  if (!target) return false;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.scrollIntoView();
  return true;
}

function jumpToHash(path: string, hash: string) {
  history.replaceState(history.state, "", path + hash);
  scrollToHash(hash);
}

/**
 * The shell: every address opens a Page, links and the console's own navigation open pages through the navigator,
 * and the browser's back button speaks for its `back`. A hash rides alongside the machine's Page and scrolls
 * to its element once the page has rendered.
 * @model spec/app/nav.md
 */
export function App({ runtime, path }: AppProps) {
  const { state } = useMachine(runtime);
  const openedHash = useRef<string | null>(location.hash);

  useEffect(() => {
    if (!state) return;
    const opened = openedHash.current;
    openedHash.current = null;
    if (opened) {
      scrollToHash(opened);
      return;
    }
    if (pendingScrollHash !== null && scrollToHash(pendingScrollHash)) pendingScrollHash = null;
  }, [state]);

  useEffect(() => {
    const redirect = redirectOf(path);
    if (redirect !== null) {
      history.replaceState(null, "", redirect + location.hash);
    }
    void runtime.runPromiseExit(open(pageOf(path)));
  }, [runtime, path]);

  useEffect(() => {
    const onPop = () => {
      if (state && pathOf(state.page) === pathOf(pageOf(location.pathname))) {
        if (location.hash) {
          scrollToHash(location.hash);
        } else {
          scrollTo(0, 0);
        }
        return;
      }
      if (location.hash) {
        pendingScrollHash = location.hash;
      } else {
        scrollTo(0, 0);
      }
      void runtime.runPromiseExit(back());
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [runtime, state]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.search) return;
      event.preventDefault();
      void navigate(runtime, pageOf(url.pathname), url.hash);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [runtime]);

  if (!state) return null;
  let shown: React.ReactNode;
  for (const key of Object.keys(areas)) {
    const rendered = areas[key].render(state.page);
    if (rendered !== null && rendered !== undefined) {
      shown = rendered;
      break;
    }
  }
  return (
    <>
      <title>{titleOf(state.page)}</title>
      {shown ?? (
        <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
          <h1 className="text-heading font-strong">Page not found</h1>
          <p className="text-muted-foreground">Nothing is at this address.</p>
        </main>
      )}
    </>
  );
}

export async function navigate(runtime: ManagedRuntime.ManagedRuntime<Machine, unknown>, page: Page, hash = "") {
  const path = pathOf(page);
  if (path === pathOf(pageOf(location.pathname))) {
    if (hash) {
      jumpToHash(path, hash);
    } else {
      history.replaceState(history.state, "", path);
      scrollTo(0, 0);
    }
    return Exit.succeed(undefined);
  }
  pendingScrollHash = hash === "" ? null : hash;
  const exit = await runtime.runPromiseExit(open(page));
  if (Exit.isSuccess(exit)) {
    history.pushState(null, "", path + hash);
    if (!hash) scrollTo(0, 0);
  } else {
    pendingScrollHash = null;
  }
  return exit;
}
export function navigateWith(runtime: ManagedRuntime.ManagedRuntime<Machine, unknown>) {
  return (page: Page, hash = "") => navigate(runtime, page, hash);
}
