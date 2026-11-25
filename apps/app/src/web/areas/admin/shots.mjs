import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const migration = process.env.MIGRATION_URL ?? "http://127.0.0.1:3104";
const legacy = process.env.LEGACY_URL ?? "http://127.0.0.1:3000";
const out = process.env.SHOTS_DIR ?? "shots/admin";
const areas = ["", "customers", "support", "traces", "gateway", "operators", "privacy-rings", "analytics", "logs"];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];
for (const [name, base] of [
  ["migration", migration],
  ["legacy", legacy],
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("/_next/hmr")) errors.push(message.text());
  });
  for (const area of areas) {
    const label = area || "overview";
    const path = "/console/admin" + (area ? "/" + area : "");
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: true });
  }
  if (errors.length) failures.push(name + ": " + [...new Set(errors)].join("\n"));
  await page.close();
}
await browser.close();
if (failures.length) throw new Error(failures.join("\n"));
