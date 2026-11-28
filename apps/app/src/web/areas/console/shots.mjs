import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { generateKeyPairSigner } from "@solana/kit";

const backend = process.env.BACKEND_URL ?? "http://localhost:3010";
const base = process.env.WEB_URL ?? "http://localhost:5173";
const out = process.env.SHOT_DIR ?? "shots/consolepolish";
const signer = await generateKeyPairSigner();
const wallet = signer.address;
let cookie = "";
const now = Date.now();
const runId = Math.random().toString(36).slice(2, 8);
const ticketId = "ticket-consolepolish-" + runId;

async function machine(name, event) {
  const response = await fetch(`${backend}/api/machines/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(event),
  });
  return response.json().catch(() => ({}));
}

function cookieValue(header, name) {
  return header?.split(";")[0]?.startsWith(`${name}=`) ? header.split(";")[0] : "";
}

async function signIn() {
  const challengeResponse = await fetch(`${backend}/api/session/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  const challenge = await challengeResponse.json();
  const challengeCookie = cookieValue(challengeResponse.headers.get("set-cookie"), "sonnely_challenge");
  const signed = await signer.signMessages([{ content: new TextEncoder().encode(challenge.message), signatures: {} }]);
  const signature = [...Object.values(signed[0])[0]];
  const verifyResponse = await fetch(`${backend}/api/session/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: challengeCookie },
    body: JSON.stringify({ wallet, signature }),
  });
  if (!verifyResponse.ok) throw new Error(`sign-in failed with HTTP ${verifyResponse.status}`);
  cookie = cookieValue(verifyResponse.headers.get("set-cookie"), "sonnely_session");
}

async function seed() {
  await signIn();
  await machine("console", { type: "saveProfile", name: "Ada Workspace", username: "ada_lovelace" });
  await machine("admin-crm", {
    type: "saveProfile",
    wallet,
    name: "Ada Workspace",
    username: "ada_lovelace",
    joined: now - 10 * 86_400_000,
    onboarding: "later",
    termsVersion: "2026-11-21",
    termsAcceptedAt: now - 9 * 86_400_000,
    inviter: "",
    now,
  });
  await machine("support", {
    type: "open",
    id: ticketId,
    wallet,
    email: "ada@example.com",
    topic: "Workspace support",
    message: "The project dashboard is missing a settled request.",
    now: now - 3_600_000,
  });
  await machine("support", {
    type: "staffReply",
    id: ticketId,
    body: "We are checking the settlement pipeline and will update the request here.",
    visibility: "Public",
    author: "staff",
    now: now - 1_800_000,
  });
  await machine("support", { type: "setState", id: ticketId, status: "InProgress", now: now - 1_700_000 });
  await machine("support", {
    type: "open",
    id: "ticket-consolepolish-second-" + runId,
    wallet,
    email: "ada@example.com",
    topic: "Billing",
    message: "Does the batch endpoint bill cached tokens at the input rate?",
    now: now - 90_000,
  });
}

const cookieDomain = new URL(base).hostname;

async function capture(browser, name, path, actions, viewport, colorScheme) {
  const context = await browser.newContext({ viewport, colorScheme });
  await context.addInitScript((scheme) => localStorage.setItem("sonnely.theme", scheme), colorScheme);
  const [name_value, value] = cookie.split("=");
  await context.addCookies([{ name: name_value, value, domain: cookieDomain, path: "/" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(800);
  if (actions) await actions(page);
  const tag = `${viewport.width > 500 ? "desktop" : "mobile"}-${colorScheme}`;
  await mkdir(`${out}/${tag}`, { recursive: true });
  await page.screenshot({ path: `${out}/${tag}/${name}.png`, fullPage: false });
  if (errors.length) console.error(`console errors on ${name} (${tag}):\n` + [...new Set(errors)].join("\n"));
  await context.close();
}

const only = process.argv[2];
const pick = (name) => !only || name.startsWith(only);

await seed();
const browser = await chromium.launch({ headless: true });
const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

for (const viewport of [desktop, mobile]) {
  for (const colorScheme of ["light", "dark"]) {
    const run = (name, path, actions) =>
      pick(name) ? capture(browser, name, path, actions, viewport, colorScheme) : Promise.resolve();
    await run("chat", "/console/chat");
    await run("chat-model-picker", "/console/chat", async (page) => {
      await page.locator(".playground-route-trigger").first().click();
      await page.waitForTimeout(400);
    });
    await run("models", "/console/models");
    await run("support", "/console/support");
    await run("support-thread", "/console/support", async (page) => {
      await page.locator("details summary").first().click();
      await page.waitForTimeout(300);
    });
    await run("settings", "/console/settings");
  }
}
await browser.close();
process.stdout.write(`screenshots in ${out}\n`);
