// spec/app/nav.md, "Story: Move around": the fallback pages before an area claims them.
import type { Page } from "../../../../gen/app__nav.ts";

export function render(page: Page): React.ReactNode {
  if (page.tag === "Home") {
    return (
      <>
        <header className="mx-auto flex w-full max-w-5xl items-center gap-6 p-6">
          <a href="/" className="font-serif text-xl">Sonnely</a>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <a href="/inference">Inference</a>
            <a href="/models">Models</a>
            <a href="/docs">Docs</a>
            <a href="/console/chat">Console</a>
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 pt-24">
          <p className="text-sm font-medium text-muted-foreground">Confidential AI inference on Solana</p>
          <h1 className="font-serif text-5xl">Sonnely</h1>
          <p className="max-w-xl text-muted-foreground">
            Stream completions through an OpenAI-compatible API, set spending limits on API keys, and see
            token usage and exact charges in your workspace.
          </p>
        </main>
      </>
    );
  }
  return null;
}
