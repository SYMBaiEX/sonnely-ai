import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const results = [];
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: vp, colorScheme: "dark" });
  await context.addInitScript(() => { try { localStorage.setItem("sonnely.theme", "dark"); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://localhost:3119/docs/api", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  // 1. rows render as buttons, page does not navigate on click
  const rows = await page.locator(".docs-endpoint-row").count();
  const urlBefore = page.url();
  await page.locator(".docs-endpoint-row").first().click();
  await page.waitForTimeout(400);
  const urlAfter = page.url();
  results.push(`${vp.width}: ${rows} rows; click stays on page: ${urlBefore === urlAfter} (${urlAfter})`);

  // 2. panel opened for GET /models — send a real keyless request
  const panelVisible = await page.locator(".docs-tryit").isVisible();
  await page.locator(".docs-tryit-send").click();
  await page.waitForTimeout(2500);
  const status = await page.locator(".docs-tryit-status").textContent().catch(() => "no status");
  const bodyHead = await page.locator(".docs-tryit-result pre").textContent().catch(() => "");
  results.push(`${vp.width}: GET /models panel=${panelVisible} status="${status}" body=${JSON.stringify((bodyHead ?? "").slice(0, 80))}`);

  // 3. close, open chat/completions — check prefill, key field, send without key (expect 401 live response)
  await page.locator(".docs-endpoint-row").first().click();
  await page.waitForTimeout(250);
  await page.locator(".docs-endpoint-row").nth(3).click();
  await page.waitForTimeout(400);
  const prefill = await page.locator(".docs-tryit-body textarea").inputValue().catch(() => "");
  const keyVisible = await page.locator(".docs-tryit-key input").isVisible();
  await page.locator(".docs-tryit-send").click();
  await page.waitForTimeout(2500);
  const status2 = await page.locator(".docs-tryit-status").textContent().catch(() => "no status");
  const errBody = await page.locator(".docs-tryit-result pre").textContent().catch(() => "");
  results.push(`${vp.width}: POST /chat/completions prefill=${prefill.includes("deepseek")} keyfield=${keyVisible} status-nokey="${status2}" body=${JSON.stringify((errBody ?? "").slice(0, 70))}`);

  // 4. invalid JSON blocked client-side
  await page.locator(".docs-tryit-body textarea").fill("{not json");
  await page.locator(".docs-tryit-send").click();
  await page.waitForTimeout(400);
  const jsonErr = await page.locator(".docs-tryit-error").textContent().catch(() => "none");
  results.push(`${vp.width}: invalid json blocked: "${jsonErr}"`);

  // 5. key persists to localStorage
  await page.locator(".docs-tryit-body textarea").fill(JSON.stringify({ model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", messages: [{ role: "user", content: "hi" }], max_tokens: 8 }, null, 2));
  await page.locator(".docs-tryit-key input").fill("test-key-abc");
  const stored = await page.evaluate(() => localStorage.getItem("sonnely.docs.tryit.key"));
  results.push(`${vp.width}: key persisted: ${stored === "test-key-abc"}`);

  // 6. multipart endpoint shows guidance not send button
  await page.locator(".docs-endpoint-row").nth(3).click();
  await page.waitForTimeout(250);
  await page.locator(".docs-endpoint-row").nth(7).click(); // images/edits
  await page.waitForTimeout(400);
  const noteVisible = await page.locator(".docs-tryit-note").isVisible();
  const sendCount = await page.locator(".docs-tryit-send").count();
  results.push(`${vp.width}: images/edits guidance=${noteVisible} sendbutton=${sendCount}`);

  // 7. reference anchor link still present
  const refHref = await page.locator(".docs-tryit-link").first().getAttribute("href");
  results.push(`${vp.width}: reference link href=${refHref}`);

  results.push(`${vp.width}: console errors: ${errors.length ? errors.join("|") : "none"}`);

  // evidence shot
  await page.locator(".docs-endpoint-row").nth(3).click();
  await page.waitForTimeout(200);
  await page.locator(".docs-endpoint-row").nth(3).click();
  await page.waitForTimeout(500);
  await page.locator(".docs-endpoint").nth(3).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `../../../../../../shots/docs/tryit-${vp.width === 1440 ? "desktop" : "mobile"}-dark.png` });
  await context.close();
}
console.log(results.join("\n"));
await browser.close();
