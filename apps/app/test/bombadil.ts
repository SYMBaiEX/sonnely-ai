// spec/app/nav.md, "Navigation starts on the home page with nowhere to go back to"
// What Bombadil checks on every state it reaches while it clicks, scrolls and reloads the page (SPEC.md,
// "Exploring the page"): its default properties, and that the page always renders a landmark.
import { always, now } from "@antithesishq/bombadil";
import { extract } from "@antithesishq/bombadil/browser";
export * from "@antithesishq/bombadil/browser/defaults";

const landmark = extract(({ document }) => document.querySelector("main, [role='main'], header, nav") !== null);

/** A page always shows a landmark element. */
export const alwaysShowsALandmark = always(now(() => landmark.current));
