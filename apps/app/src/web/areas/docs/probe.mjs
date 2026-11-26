// Probe docs pages: scrollWidth at mobile/desktop widths + offending elements.
import { chromium } from "playwright";

const base = process.env.DOCS_URL ?? "http://localhost:3119";
const pages = process.argv[2] ? process.argv[2].split(",") : [
  "", "/quickstart", "/sdks", "/keys", "/billing", "/workspace", "/teams", "/api",
  "/providers", "/streaming", "/batch", "/attestation", "/observability",
  "/troubleshooting", "/migration",
];
const widths = [390, 1440];

const browser = await chromium.launch({ headless: true });
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  for (const p of pages) {
    errors.length = 0;
    await page.goto(base + "/docs" + p, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const offenders = [];
      if (docW > winW) {
        for (const el of document.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width > winW + 1 || r.right > winW + 1) {
            const cls = typeof el.className === "string" ? el.className.slice(0, 80) : "";
            offenders.push(`${el.tagName.toLowerCase()}.${cls} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
          }
        }
      }
      return { docW, winW, offenders: offenders.slice(0, 14), count: offenders.length };
    });
    const flag = info.docW > info.winW ? "OVERFLOW" : "ok";
    console.log(`[${width}] /docs${p || " (index)"}: scrollWidth=${info.docW} winW=${info.winW} ${flag}${errors.length ? " CONSOLE-ERRORS:" + [...new Set(errors)].join("|") : ""}`);
    for (const o of info.offenders) console.log(`    ${o}`);
  }
  await page.close();
}
await browser.close();
