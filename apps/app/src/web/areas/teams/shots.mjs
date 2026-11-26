import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { generateKeyPairSigner } from "@solana/kit";

const base = process.env.BASE ?? "http://localhost:3108";
const out = process.env.SHOT_DIR ?? "shots/teamsdesign";
const phase = process.env.PHASE ?? "before";
const signer = await generateKeyPairSigner();
const wallet = signer.address;
const member = (await generateKeyPairSigner()).address;
const adminMember = (await generateKeyPairSigner()).address;
const inviter = (await generateKeyPairSigner()).address;
const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const teamId = `team-${runId}`;
const emptyTeamId = `empty-${runId}`;
const inviterTeamId = `inviter-${runId}`;
const projectId = `project-${runId}`;
const keyId = `key-${runId}`;
const now = Date.now();
const dayMs = 86_400_000;
const budget = 25_000_000;
const spent = 4_200_000;
let cookie = "";

async function machine(name, event) {
  const response = await fetch(`${base}/api/machines/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(event),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`${name} ${event.type} failed with HTTP ${response.status}: ${payload.error ?? "no response"}`);
  }
  return payload;
}

async function machineState(name) {
  const response = await fetch(`${base}/api/machines/${name}`, { headers: { cookie } });
  if (!response.ok) throw new Error(`${name} state failed with HTTP ${response.status}`);
  return response.json();
}

function cookieValue(header, name) {
  const pattern = new RegExp("(?:^|,)\\s*(" + name + "=[^;,]+)");
  return pattern.exec(header ?? "")?.[1] ?? "";
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
  if (!cookie) throw new Error("seed sign-in returned no session cookie");
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function usageRow(id, time, cost, settle) {
  await machine("usage", {
    type: "record",
    id,
    time,
    keyName: "Launch key",
    keyId,
    project: projectId,
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    provider: "NearAI",
    cost,
  });
  if (settle === "complete") {
    await machine("usage", { type: "charge", id, input: 812, output: 348, cached: -1, cost, providerMs: 3210 });
  }
  if (settle === "failed") await machine("usage", { type: "release", id });
  if (settle === "unreported") await machine("usage", { type: "unreported", id });
}

async function seed() {
  await signIn();
  const settings = await machineState("console");
  if (settings.name !== "Ada Workspace" || settings.username !== "ada_lovelace") {
    await machine("console", { type: "saveProfile", name: "Ada Workspace", username: "ada_lovelace" });
  }
  await machine("admin-crm", {
    type: "saveProfile",
    wallet,
    name: "Ada Workspace",
    username: "ada_lovelace",
    joined: now - 30 * dayMs,
    onboarding: "later",
    termsVersion: "2026-11-21",
    termsAcceptedAt: now - 30 * dayMs,
    inviter: "",
    now,
  });
  await machine("teams", { type: "createTeam", id: teamId, name: "Core infrastructure", actor: wallet, now });
  for (const [memberWallet, role] of [
    [member, "Member"],
    [adminMember, "Admin"],
  ]) {
    await machine("teams", {
      type: "invite",
      teamId,
      actor: wallet,
      wallet: memberWallet,
      role,
      expiresAt: now + 7 * dayMs,
      now,
    });
    await machine("teams", { type: "respond", teamId, actor: memberWallet, accept: true, now });
  }
  await machine("teams", {
    type: "createProject",
    teamId,
    projectId,
    actor: wallet,
    name: "Production inference",
    budget,
  });
  await machine("teams", { type: "holdProject", projectId, amount: spent });
  await machine("teams", { type: "createTeam", id: emptyTeamId, name: "Research sandbox", actor: wallet, now });
  await machine("teams", { type: "createTeam", id: inviterTeamId, name: "Provider operations", actor: inviter, now });
  await machine("teams", {
    type: "invite",
    teamId: inviterTeamId,
    actor: inviter,
    wallet,
    role: "Member",
    expiresAt: now + 7 * dayMs,
    now,
  });
  const full = `sonnely_live_${runId}demo`;
  await machine("workspace-keys", {
    type: "create",
    id: keyId,
    label: "Launch key",
    prefix: full.slice(0, 20),
    hash: await sha256(full),
    project: projectId,
    scopes: ["inference"],
    cap: 12_000_000,
    dailyCap: 2_000_000,
    expiresAt: now + 20 * dayMs,
    now,
  });
  await machine("workspace-keys", {
    type: "recordUse",
    id: keyId,
    cost: 1_350_000,
    day: new Date(now).toISOString().slice(0, 10),
    now,
  });
  await usageRow(`req-${runId}-complete`, now - 2 * 3_600_000, 12_480, "complete");
  await usageRow(`req-${runId}-pending`, now - 35 * 60_000, 24_600, "pending");
  await usageRow(`req-${runId}-failed`, now - 5 * 3_600_000, 8_200, "failed");
}

async function revokeScreenshotKeys() {
  const response = await fetch(`${base}/api/machines/workspace-keys`, { headers: { cookie } });
  const state = await response.json().catch(() => undefined);
  for (const key of state?.keys ?? []) {
    if (key.status === "Active" && key.label.startsWith("Screenshot key")) await machine("workspace-keys", { type: "revoke", id: key.id });
  }
}

async function chooseTeam(page, id) {
  const select = page.locator("section[aria-label='Your teams'] select");
  await select.waitFor();
  if ((await select.inputValue()) !== id) await select.selectOption(id);
  await page.waitForTimeout(350);
}

async function openTeams(context, id) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${base}/console/teams`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator("section[aria-label='Your teams']").waitFor({ timeout: 15_000 });
  await chooseTeam(page, id);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  return { page, errors };
}

async function measure(page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const root = document.documentElement;
    const offenders = [...document.body.querySelectorAll("*")]
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (style.position === "fixed" || rect.width === 0 || (rect.left >= -0.5 && rect.right <= width + 0.5)) return [];
        return [
          {
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === "string" ? element.className : "",
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
          },
        ];
      })
      .slice(0, 12);
    return {
      viewport: width,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflow: root.scrollWidth - root.clientWidth,
      offenders,
    };
  });
}

async function prepareState(page, name, theme, viewportName) {
  if (name === "teams-project-settings") {
    await page.locator("summary", { hasText: "Project settings" }).click();
  }
  if (name === "teams-invite") {
    await page.locator("summary", { hasText: "Invite a wallet" }).click();
  }
  if (name === "teams-archive-dialog") {
    await page.locator("summary", { hasText: "Project settings" }).click();
    await page.getByRole("button", { name: "Archive project" }).click();
    await page.getByRole("dialog").waitFor();
  }
  if (name === "teams-key-created") {
    const disclosure = page.locator("summary", { hasText: "New project key" });
    if ((await disclosure.count()) > 0) await disclosure.click();
    await page.getByLabel("Key name").fill(`Screenshot key ${theme} ${viewportName}`);
    await page.getByRole("button", { name: "Create project key" }).click();
    await page.getByText("Copy the new key now. This is its only display.").waitFor({ timeout: 5000 });
  }
  await page.waitForTimeout(250);
}

async function captureState(context, name, team, theme, viewportName) {
  const { page, errors } = await openTeams(context, team);
  await prepareState(page, name, theme, viewportName);
  await page.screenshot({ path: `${out}/${phase}-${theme}-${viewportName}-${name}.png`, fullPage: true });
  const measurement = await measure(page);
  if (name === "teams-key-created") await revokeScreenshotKeys();
  await page.close();
  return { measurement, errors };
}

async function verifyInteractions(context) {
  const { page, errors } = await openTeams(context, emptyTeamId);
  const results = [];
  async function check(name, action) {
    try {
      await action();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await check("switch team", async () => {
    await page.getByText("No projects yet.").waitFor({ timeout: 3000 });
    await chooseTeam(page, teamId);
    await page.getByRole("heading", { name: "Production inference" }).waitFor({ timeout: 3000 });
  });
  await check("invite flow", async () => {
    await page.locator("summary", { hasText: "Invite a wallet" }).click();
    await page.getByLabel("Solana wallet address").fill(inviter);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await page.getByRole("button", { name: "Cancel invite" }).waitFor({ timeout: 3000 });
    await page.getByRole("button", { name: "Cancel invite" }).click();
    await page.getByRole("button", { name: "Cancel invite" }).waitFor({ state: "hidden", timeout: 3000 });
  });
  await check("project settings disclosure", async () => {
    await page.locator("summary", { hasText: "Project settings" }).click();
    await page.getByRole("button", { name: "Save project" }).waitFor({ timeout: 3000 });
  });
  await check("archive dialog cancel", async () => {
    await page.getByRole("button", { name: "Archive project" }).click();
    await page.getByRole("dialog").waitFor({ timeout: 3000 });
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 3000 });
  });
  await page.close();
  return { results, errors };
}

await mkdir(out, { recursive: true });
await seed();
const browser = await chromium.launch({ headless: true });
const measurements = {};
const failures = [];
const states = [
  ["teams", teamId],
  ["teams-empty", emptyTeamId],
  ["teams-project-settings", teamId],
  ["teams-invite", teamId],
  ["teams-archive-dialog", teamId],
  ["teams-key-created", teamId],
];
for (const theme of ["light", "dark"]) {
  for (const [viewportName, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript((selectedTheme) => window.localStorage.setItem("sonnely.theme", selectedTheme), theme);
    const [name, value] = cookie.split("=");
    await context.addCookies([{ name, value, url: base }]);
    for (const [stateName, stateTeam] of states) {
      const result = await captureState(context, stateName, stateTeam, theme, viewportName);
      measurements[`${theme}-${viewportName}-${stateName}`] = result.measurement;
      if (result.errors.length) failures.push(`${theme}-${viewportName}-${stateName}: ${[...new Set(result.errors)].join(" | ")}`);
    }
    const interactionResult = await verifyInteractions(context);
    measurements[`${theme}-${viewportName}-interactions`] = interactionResult.results;
    if (interactionResult.errors.length) failures.push(`${theme}-${viewportName}-interactions: ${[...new Set(interactionResult.errors)].join(" | ")}`);
    await context.close();
  }
}
await browser.close();
await writeFile(`${out}/${phase}-measurements.json`, JSON.stringify(measurements, null, 2) + "\n");
for (const result of Object.values(measurements)) {
  if (Array.isArray(result)) {
    for (const check of result) if (!check.ok) failures.push(`interaction ${check.name}: ${check.error}`);
  } else if (result.overflow > 0) {
    failures.push(`mobile overflow ${result.viewport}: ${JSON.stringify(result.offenders)}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
process.stdout.write(`screenshots in ${out}\n`);
