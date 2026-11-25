// spec/app/nav.md, "Story: Move around"
import { Exit, type ManagedRuntime } from "effect";
import { useEffect } from "react";
import type { Machine } from "../../gen/app__nav.effect.vibe";
import { useMachine } from "../../gen/app__nav.react.ts";
import type { Page } from "../../gen/app__nav.ts";
import { back, open } from "./nav.vibe";
import { pageOf, pathOf } from "./routes.ts";
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

/**
 * The shell: every address opens a Page, links and the console's own navigation open pages through the navigator,
 * and the browser's back button speaks for its `back`.
 * @model spec/app/nav.md
 */
export function App({ runtime, path }: AppProps) {
  const { state } = useMachine(runtime);

  useEffect(() => {
    void runtime.runPromiseExit(open(pageOf(path)));
  }, [runtime, path]);

  useEffect(() => {
    const onPop = () => void runtime.runPromiseExit(back());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
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
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground">Nothing is at this address.</p>
        </main>
      )}
    </>
  );
}

export async function navigate(runtime: ManagedRuntime.ManagedRuntime<Machine, unknown>, page: Page) {
  const exit = await runtime.runPromiseExit(open(page));
  if (Exit.isSuccess(exit)) history.pushState(null, "", pathOf(page));
  return exit;
}
export function navigateWith(runtime: ManagedRuntime.ManagedRuntime<Machine, unknown>) {
  return (page: Page) => navigate(runtime, page);
}
