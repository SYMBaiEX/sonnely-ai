import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const errors = [];
function watch(page, tag) {
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text().slice(0, 120)}`); });
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${String(e).slice(0, 120)}`));
}
const shots = "../../../../../../shots/docs";
const pages = ["", "/quickstart", "/sdks", "/api-keys", "/credits", "/workspaces", "/teams", "/api", "/models", "/streaming", "/batch", "/confidentiality", "/usage", "/blackboxes", "/dry-docks", "/errors", "/migrate"];

// all-pages width sweep: expanded + collapsed, desktop + mobile
for (const collapsed of [false, true]) {
  for (const [vp, vn] of [[{ width: 1440, height: 900 }, "desktop"], [{ width: 390, height: 844 }, "mobile"]]) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript((c) => { try { localStorage.setItem("sonnely.docs.sidebar", c ? "collapsed" : "expanded"); } catch {} }, collapsed);
    const page = await ctx.newPage();
    watch(page, `${vn}-${collapsed ? "col" : "exp"}`);
    const bad = [];
    for (const p of pages) {
      await page.goto(`http://localhost:3119/docs${p}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (m.sw !== m.iw) bad.push(`${p}: ${m.sw}vs${m.iw}`);
    }
    console.log(`${vn} collapsed=${collapsed}:`, bad.length === 0 ? "all exact" : bad.join(", "));
    await ctx.close();
  }
}

// light theme recapture with final pill size
let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
await ctx.addInitScript(() => { try { localStorage.setItem("sonnely.theme", "light"); localStorage.setItem("sonnely.docs.sidebar", "collapsed"); } catch {} });
let page = await ctx.newPage();
watch(page, "light");
await page.goto("http://localhost:3119/docs/quickstart", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/collapse-6-collapsed-desktop-light.png` });
await page.locator(".docs-sidebar-pill button").nth(0).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${shots}/collapse-7-expanded-desktop-light.png` });
await ctx.close();

// mobile regression with inner wrapper: disclosure, minitoc, widths
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
await ctx.addInitScript(() => { try { localStorage.setItem("sonnely.theme", "dark"); localStorage.setItem("sonnely.docs.sidebar", "collapsed"); } catch {} });
page = await ctx.newPage();
watch(page, "mobile");
await page.goto("http://localhost:3119/docs/quickstart", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/collapse-8-mobile-dark.png` });
const mob = await page.evaluate(() => ({
  pillDisplay: getComputedStyle(document.querySelector(".docs-sidebar-pill")).display,
  articleTop: Math.round(document.querySelector(".docs-article").getBoundingClientRect().top),
  toggleVisible: getComputedStyle(document.querySelector(".docs-nav-toggle")).display,
}));
console.log("mobile-collapsed-persisted:", JSON.stringify(mob));
await page.locator(".docs-nav-toggle").click();
await page.waitForTimeout(250);
const navOpen = await page.evaluate(() => getComputedStyle(document.querySelector(".docs-sidebar-nav")).display);
console.log("mobile-nav-toggle-opens:", navOpen);
await page.screenshot({ path: `${shots}/collapse-9-mobile-navopen-dark.png` });
// minitoc exists and opens
await page.locator(".docs-nav-toggle").click();
const minitocCount = await page.locator(".docs-minitoc").count();
await page.locator(".docs-minitoc summary").click();
await page.waitForTimeout(250);
const minitocOpen = await page.evaluate(() => document.querySelector(".docs-minitoc").open);
console.log("minitoc:", minitocCount, "opens:", minitocOpen);
// link nav still works inside disclosure
await page.locator(".docs-nav-toggle").click();
await page.waitForTimeout(200);
await page.locator(".docs-sidebar-nav a").nth(2).click();
await page.waitForTimeout(600);
console.log("mobile-nav-navigation:", page.url());
await ctx.close();

// light mobile
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
await ctx.addInitScript(() => { try { localStorage.setItem("sonnely.theme", "light"); } catch {} });
page = await ctx.newPage();
watch(page, "mobile-light");
await page.goto("http://localhost:3119/docs/quickstart", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/collapse-10-mobile-light.png` });
await ctx.close();

console.log("console-errors:", errors.length === 0 ? "none" : errors.slice(0, 6).join(" | "));
await browser.close();
