// Drives real write paths through the admin UI and verifies they persist:
// support reply + status/assignment, CRM note, and a balance adjustment.
import { chromium } from "playwright";
import { generateKeyPairSigner } from "@solana/kit";
const base = "http://localhost:3117";
const signer = await generateKeyPairSigner();
const wallet = signer.address;
function cv(h, n) { return h?.split(";")[0]?.startsWith(`${n}=`) ? h.split(";")[0] : ""; }
async function machine(name, event) {
  const r = await fetch(`${base}/api/machines/${name}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(event) });
  return r.json().catch(() => ({}));
}
let cookie = "";
const now = Date.now(), dayMs = 86_400_000;
const cr = await fetch(`${base}/api/session/challenge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }) });
const challenge = await cr.json();
const cc = cv(cr.headers.get("set-cookie"), "sonnely_challenge");
const signed = await signer.signMessages([{ content: new TextEncoder().encode(challenge.message), signatures: {} }]);
const signature = [...Object.values(signed[0])[0]];
const vr = await fetch(`${base}/api/session/verify`, { method: "POST", headers: { "content-type": "application/json", cookie: cc }, body: JSON.stringify({ wallet, signature }) });
cookie = cv(vr.headers.get("set-cookie"), "sonnely_session");
await machine("console", { type: "saveProfile", name: "Mutation Op", username: "mut_op" });
await machine("admin-crm", { type: "saveProfile", wallet, name: "Mutation Op", username: "mut_op", joined: now - 60 * dayMs, onboarding: "later", termsVersion: "2026-11-21", termsAcceptedAt: now - 60 * dayMs, inviter: "", now });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const [cn, cvv] = cookie.split("=");
await context.addCookies([{ name: cn, value: cvv, domain: "localhost", path: "/" }]);
const page = await context.newPage();
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));
const results = [];

// 1. Support: open the first open ticket, send a public reply, move it to in_progress + claim.
await page.goto(base + "/console/admin/support", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator(".inbox-row-main").first().click();
await page.waitForTimeout(900);
const marker = "Mutation-test reply " + now;
await page.locator("textarea[name='body']").fill(marker);
await page.getByRole("button", { name: "Send reply" }).click();
await page.waitForTimeout(1500);
const replyVisible = await page.getByText(marker).count();
results.push(["support reply posted", replyVisible > 0]);

await page.locator("select[name='state']").selectOption("in_progress");
await page.locator("select[name='assignment']").selectOption("claim");
await page.getByRole("button", { name: /Save|Update|Apply/i }).first().click().catch(() => {});
await page.waitForTimeout(1500);
const stateNow = await page.locator(".inbox-thread-head .pill, .inbox-thread .pill").first().textContent().catch(() => "");
results.push(["ticket now in progress", /progress/i.test(stateNow ?? "")]);
const assignedText = await page.locator(".inbox-thread-meta").textContent().catch(() => "");
results.push(["ticket claimed", /assigned to/i.test(assignedText ?? "")]);

// 2. CRM: open the customer linked from the thread, add a note.
await page.getByRole("button", { name: "Open customer" }).click().catch(() => {});
await page.waitForTimeout(1500);
const onCustomer = page.url().includes("customers") || (await page.locator(".crm-head, [class*=customer]").count()) > 0;
if (!onCustomer) {
  await page.goto(base + "/console/admin/customers", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /View/ }).first().click();
  await page.waitForTimeout(1500);
}
console.log("customer workspace headings:", await page.locator("h2,h3").allTextContents().then((t) => t.slice(0, 8).join(" | ")));
await page.locator("input[name='amount']").waitFor({ timeout: 10_000 });
await page.getByRole("tab", { name: /Notes/ }).first().click();
await page.waitForTimeout(900);
const noteMarker = "Mutation-test note " + now;
const noteField = page.locator("textarea[name='note']").first();
if (await noteField.count()) {
  await noteField.fill(noteMarker);
  await page.getByRole("button", { name: "Add note" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: /Activity/ }).first().click();
  await page.waitForTimeout(900);
  results.push(["crm note posted", (await page.getByText(noteMarker).count()) > 0]);
} else results.push(["crm note posted", false, "note field not found"]);

// 3. Balance adjustment through the customer panel.
const amountField = page.locator("input[name='amount']");
if (await amountField.count()) {
  await amountField.fill("12.50");
  const reasonMarker = "mutation-test-" + now;
  await page.locator("textarea[name='reason']").fill(reasonMarker);
  await page.getByRole("button", { name: /Apply audited adjustment/ }).click();
  await page.waitForTimeout(2500);
  const failure = await page.evaluate(() => {
    for (const el of document.querySelectorAll("p.error")) if (el.textContent?.trim()) return el.textContent;
    return "";
  });
  const notice = await page.evaluate(() => {
    for (const el of document.querySelectorAll("p.status")) if (el.textContent?.trim()) return el.textContent;
    return "";
  });
  const body = await page.locator("body").textContent();
  const timelineShows = body.includes("Balance adjusted") || body.includes(reasonMarker.slice(0, 18));
  results.push(["balance adjustment applied", /applied/i.test(notice ?? "") || timelineShows, ("notice:" + (notice ?? "").slice(0, 50) + " err:" + (failure ?? "").slice(0, 50) + " timeline:" + timelineShows)]);
} else results.push(["balance adjustment applied", false, "amount field not found"]);

for (const [name, ok, extra] of results) console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? " — " + extra : ""));
console.log("console errors:", errors.length);
for (const e of errors.slice(0, 5)) console.log("  err:", e.slice(0, 160));
await browser.close();
