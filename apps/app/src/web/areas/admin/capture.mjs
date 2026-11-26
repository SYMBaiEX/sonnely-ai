// Seeds an operator session plus realistic CRM/support/usage data, then captures
// every admin area across desktop/mobile and light/dark. Usage:
//   BASE=http://localhost:3117 SHOTS_DIR=shots/after node capture.mjs
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { generateKeyPairSigner } from "@solana/kit";

const base = process.env.BASE ?? "http://localhost:3117";
const out = process.env.SHOTS_DIR ?? "shots/after";
const signer = await generateKeyPairSigner();
const wallet = signer.address;
let cookie = "";
const now = Date.now();
const hour = 3_600_000;
const dayMs = 86_400_000;

const customerA = "7xKz91mQpNfVbR2sTwcYuHjD5eLgA8nB4vC6dE3fGhJk";
const customerB = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const customerC = "9mNsT4vXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ12345678";

async function machine(name, event) {
  const response = await fetch(`${base}/api/machines/${name}`, {
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
  const challengeResponse = await fetch(`${base}/api/session/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  const challenge = await challengeResponse.json();
  const challengeCookie = cookieValue(challengeResponse.headers.get("set-cookie"), "sonnely_challenge");
  const signed = await signer.signMessages([{ content: new TextEncoder().encode(challenge.message), signatures: {} }]);
  const signature = [...Object.values(signed[0])[0]];
  const verifyResponse = await fetch(`${base}/api/session/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: challengeCookie },
    body: JSON.stringify({ wallet, signature }),
  });
  if (!verifyResponse.ok) throw new Error(`seed sign-in failed with HTTP ${verifyResponse.status}`);
  cookie = cookieValue(verifyResponse.headers.get("set-cookie"), "sonnely_session");
}

async function usageRow(id, model, provider, time, cost, settled) {
  await machine("usage", { type: "record", id, time, keyName: "Launch key", keyId: customerA, project: "project-demo", model, provider, cost });
  if (settled === "complete")
    await machine("usage", { type: "charge", id, input: 812, output: 348, cached: -1, cost, providerMs: 3210 });
  if (settled === "failed") await machine("usage", { type: "release", id });
  if (settled === "unreported") await machine("usage", { type: "unreported", id });
}

async function seed() {
  await signIn();
  await machine("console", { type: "saveProfile", name: "Ada Operator", username: "ada_ops" });
  await machine("admin-crm", {
    type: "saveProfile",
    wallet,
    name: "Ada Operator",
    username: "ada_ops",
    joined: now - 60 * dayMs,
    onboarding: "later",
    termsVersion: "2026-11-21",
    termsAcceptedAt: now - 60 * dayMs,
    inviter: "",
    now,
  });
  const profile = (w, name, username, joined) =>
    machine("admin-crm", {
      type: "saveProfile",
      wallet: w,
      name,
      username,
      joined,
      onboarding: "later",
      termsVersion: "2026-11-21",
      termsAcceptedAt: joined,
      inviter: "",
      now: joined,
    });
  await profile(customerA, "Maya Chen", "maya_infer", now - 40 * dayMs);
  await profile(customerB, "Rafael Sousa", "rafael_s", now - 12 * dayMs);
  await profile(customerC, "", "", now - 2 * dayMs);

  await machine("admin-crm", {
    type: "setFlag",
    activityId: crypto.randomUUID(),
    account: customerB,
    flag: "risk-review",
    note: "",
    admin: wallet,
    summary: "Flag 'risk-review' added",
    now,
  });
  await machine("admin-crm", {
    type: "createTask",
    id: crypto.randomUUID(),
    activityId: crypto.randomUUID(),
    account: customerA,
    assignee: wallet,
    creator: wallet,
    title: "Review unusual spike in failed requests",
    dueAt: now - dayMs,
    summary: "Follow-up created",
    now,
  });
  await machine("admin-crm", {
    type: "createTask",
    id: crypto.randomUUID(),
    activityId: crypto.randomUUID(),
    account: customerB,
    assignee: wallet,
    creator: wallet,
    title: "Confirm invoice contact for annual plan",
    dueAt: now + 3 * dayMs,
    summary: "Follow-up created",
    now,
  });

  const models = [
    "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    "z-ai/glm-5.3-flash",
    "Qwen/Qwen3.6-35B-A3B-FP8",
    "Qwen/Qwen3.8-27B",
  ];
  let n = 0;
  for (let day = 0; day < 12; day++) {
    for (const model of models) {
      if ((day + model.length) % 3 === 0) continue;
      const time = now - day * dayMs - (n % 20) * hour;
      await usageRow("req-seed-" + n++, model, day % 2 ? "NearAI" : "Phala", time, 1200 + (n % 7) * 300, "complete");
    }
  }
  await usageRow("req-seed-failed-1", models[0], "NearAI", now - 5 * hour, 1400, "failed");
  await usageRow("req-seed-failed-2", models[1], "Phala", now - 2 * hour, 900, "failed");
  await usageRow("req-seed-pending-1", models[2], "NearAI", now - 8 * 60_000, 2200, "pending");
  await usageRow("req-seed-unreported-1", models[3], "Tinfoil", now - 26 * hour, 1750, "unreported");

  await machine("support", {
    type: "open",
    id: "ticket-aging",
    email: "maya@example.com",
    topic: "Settlement missing for a batch of DeepSeek requests",
    message: "Three requests from Tuesday show as pending in my logs but the credits are still held. Can you check the reconciliation?",
    wallet: customerA,
    now: now - 4 * dayMs,
  });
  await machine("support", {
    type: "open",
    id: "ticket-recent",
    email: "rafael@example.com",
    topic: "How do I scope a key to one project?",
    message: "I want a key that can only spend from the production project budget.",
    wallet: customerB,
    now: now - 3 * hour,
  });
  await machine("support", {
    type: "open",
    id: "ticket-progress",
    email: "team@example.com",
    topic: "Rate limits on Kimi K2",
    message: "We are hitting provider rate limits during peak hours.",
    wallet: customerC,
    now: now - 2 * dayMs,
  });
  await machine("support", { type: "assignOwner", id: "ticket-progress", wallet, now: now - dayMs });
  await machine("support", { type: "setState", id: "ticket-progress", status: "InProgress", now: now - dayMs });
  await machine("support", {
    type: "staffReply",
    id: "ticket-progress",
    body: "We raised the burst limit with the provider; watching it for a day.",
    visibility: "Public",
    author: wallet,
    now: now - 20 * hour,
  });
  await machine("support", {
    type: "open",
    id: "ticket-resolved",
    email: "maya@example.com",
    topic: "Invite link not credited",
    message: "My colleague signed up through my link but I do not see the referral.",
    wallet: customerA,
    now: now - 6 * dayMs,
  });
  await machine("support", { type: "setState", id: "ticket-resolved", status: "Resolved", now: now - 5 * dayMs });

  for (const [w, amount] of [
    [customerA, 250_000_000],
    [customerB, 40_000_000],
  ]) {
    await machine("billing-ledger", { type: "credit", wallet: w, detail: "USDC deposit", amount });
  }
  await machine("billing-ledger", { type: "charge", wallet: customerA, detail: "Inference spend", amount: 18_400_000 });

  for (const [reference, w, amount, when] of [
    ["dep-seed-1", customerA, 250_000_000, now - 9 * dayMs],
    ["dep-seed-2", customerB, 40_000_000, now - 4 * dayMs],
  ]) {
    await machine("billing-deposits", {
      type: "open",
      reference,
      wallet: w,
      asset: "USDC",
      amount,
      atomic: amount,
      createdAt: when,
      expiresAt: when + dayMs,
    });
    await machine("billing-deposits", {
      type: "finalize",
      reference,
      signature: "seed-signature-" + reference,
      wallet: w,
      asset: "USDC",
      amount,
      atomic: amount,
      now: when + hour,
    });
  }
}

const areas = ["", "customers", "support", "traces", "gateway", "operators", "privacy-rings", "analytics", "logs"];
const failures = [];

async function capture() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  for (const theme of ["light", "dark"]) {
    for (const [viewportName, viewport] of [
      ["desktop", { width: 1440, height: 900 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(
        ([theme]) => window.localStorage.setItem("sonnely.theme", theme),
        [theme],
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(base + "/console/admin", { waitUntil: "networkidle", timeout: 30_000 });
      await page.evaluate((cookieValue) => {
        document.cookie = cookieValue + "; path=/";
      }, cookie);
      for (const area of areas) {
        const label = area || "overview";
        const path = "/console/admin" + (area ? "/" + area : "");
        await page.goto(base + path, { waitUntil: "networkidle", timeout: 30_000 });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${out}/${theme}-${viewportName}-${label}.png`, fullPage: true });
      }
      if (errors.length) failures.push(`${theme}-${viewportName}: ` + [...new Set(errors)].join(" | "));
      await context.close();
    }
  }
  await browser.close();
}

if (process.argv.includes("--seed-only")) {
  await seed();
  console.log("seeded as", wallet);
} else if (process.argv.includes("--capture-only")) {
  const fs = await import("node:fs");
  const saved = process.env.COOKIE ?? "";
  cookie = saved;
  await capture();
  if (failures.length) {
    console.error("CONSOLE ERRORS:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("captured to", out);
} else {
  await seed();
  console.log("seeded as", wallet);
  await capture();
  if (failures.length) {
    console.error("CONSOLE ERRORS:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("done");
}
