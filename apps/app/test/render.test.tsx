// spec/app/docs/index.md, "Story: Read the documentation" — every guide's page renders a landmark.
// @vitest-environment happy-dom
import { it } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
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
