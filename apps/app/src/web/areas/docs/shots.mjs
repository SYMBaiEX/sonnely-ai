// After-shots for docs pages: index / guide / reference × desktop|mobile × light|dark,
// plus interaction evidence (nav disclosure, mini-toc, table scroll region).
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DOCS_URL ?? "http://localhost:3119";
const out = process.env.SHOTS_DIR ?? "../../../../../../shots/docs";
await mkdir(out, { recursive: true });

const routes = [
  ["index", "/docs"],
  ["quickstart", "/docs/quickstart"],
  ["api", "/docs/api"],
  ["sdks", "/docs/sdks"],
];
const variants = [
  ["desktop", "light", { width: 1440, height: 900 }],
  ["desktop", "dark", { width: 1440, height: 900 }],
  ["mobile", "light", { width: 390, height: 844 }],
  ["mobile", "dark", { width: 390, height: 844 }],
];

const browser = await chromium.launch({ headless: true });
const failures = [];
for (const [viewportName, theme, viewport] of variants) {
  for (const [name, path] of routes) {
    const context = await browser.newContext({ viewport, colorScheme: theme });
    await context.addInitScript((t) => {
      try { localStorage.setItem("sonnely.theme", t); } catch {}
    }, theme);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}-${viewportName}-${theme}.png`, fullPage: true });
    if (errors.length) failures.push(`${name}-${viewportName}-${theme}: ${[...new Set(errors)].join(" | ")}`);
    await context.close();
  }
}

// Interaction evidence on mobile light
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
await context.addInitScript(() => {
  try { localStorage.setItem("sonnely.theme", "light"); } catch {}
});
const page = await context.newPage();

// 1. Nav disclosure open on quickstart
await page.goto(base + "/docs/quickstart", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.click(".docs-nav-toggle");
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/interaction-nav-open-mobile-light.png` });
await page.click(".docs-nav-toggle");
await page.waitForTimeout(250);

// 2. Mini-toc open on the API reference
await page.goto(base + "/docs/api", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.click(".docs-minitoc summary");
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/interaction-minitoc-open-mobile-light.png` });

// 3. Table scroll region mid-scroll on providers
await page.goto(base + "/docs/providers", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const scrolled = await page.evaluate(() => {
  const w = document.querySelector('[data-streamdown="table-wrapper"] > div:has(> table)');
  if (!w) return "no-wrapper";
  w.scrollLeft = 120;
  w.scrollIntoView({ block: "center" });
  return { scrollable: w.scrollWidth > w.clientWidth, scrollWidth: w.scrollWidth, clientWidth: w.clientWidth };
});
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/interaction-table-scroll-mobile-light.png` });
console.log("table scroll region:", JSON.stringify(scrolled));

// 4. Code block scroll region on quickstart
await page.goto(base + "/docs/quickstart", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const codeScroll = await page.evaluate(() => {
  const pre = document.querySelector('[data-streamdown="code-block-body"] pre');
  const body = document.querySelector('[data-streamdown="code-block-body"]');
  if (!pre || !body) return "none";
  const el = pre.scrollWidth > pre.clientWidth ? pre : body;
  el.scrollLeft = 80;
  el.scrollIntoView({ block: "center" });
  return { preScrolls: pre.scrollWidth > pre.clientWidth, bodyScrolls: body.scrollWidth > body.clientWidth, preSW: pre.scrollWidth, preCW: pre.clientWidth };
});
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/interaction-code-scroll-mobile-light.png` });
console.log("code scroll region:", JSON.stringify(codeScroll));

// 5. Anchor jump lands below the header
await page.goto(base + "/docs/api", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.click(".docs-minitoc summary");
await page.waitForTimeout(200);
const link = await page.$(".docs-minitoc nav a");
const href = await link?.getAttribute("href");
await link?.click();
await page.waitForTimeout(600);
const anchorCheck = await page.evaluate((h) => {
  const target = document.querySelector(h);
  if (!target) return "missing";
  const top = target.getBoundingClientRect().top;
  return { hash: h, top: Math.round(top), visible: top > 0 && top < window.innerHeight };
}, href ?? "");
console.log("anchor jump:", JSON.stringify(anchorCheck));
await page.screenshot({ path: `${out}/interaction-anchor-jump-mobile-light.png` });

// 6. Nav collapse state on a fresh page: article near top
await page.goto(base + "/docs/sdks", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const preamble = await page.evaluate(() => {
  const article = document.querySelector(".docs-article-header");
  const nav = document.querySelector(".docs-sidebar-nav");
  const toggle = document.querySelector(".docs-nav-toggle");
  return {
    articleTop: Math.round(article?.getBoundingClientRect().top ?? -1),
    navVisible: nav ? getComputedStyle(nav).display !== "none" : null,
    toggleVisible: toggle ? getComputedStyle(toggle).display !== "none" : null,
  };
});
console.log("mobile preamble:", JSON.stringify(preamble));

await context.close();
await browser.close();
if (failures.length) {
  console.error("CONSOLE ERRORS:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("shots captured, zero console errors");
