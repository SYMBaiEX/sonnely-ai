import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const legacyBase = process.env.LEGACY_URL ?? "http://localhost:3200";
const migrationBase = process.env.MIGRATION_URL ?? "http://localhost:3108";
const out = process.env.SHOT_DIR ?? "/tmp/ui2-workspace-shots";
const wallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const otherWallet = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const teamId = "team-ui-fidelity";
const projectId = "project-ui-fidelity";
const keyId = "key-ui-fidelity";
const ticketId = "ticket-ui-fidelity";
const now = Date.now();
const budget = 25_000_000;
const spent = 4_200_000;

async function machine(name, event) {
  const response = await fetch(`${migrationBase}/api/machines/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  return response.json().catch(() => ({}));
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seedMigration() {
  await machine("session", { type: "signIn", wallet });
  await machine("console", { type: "saveProfile", name: "Ada Workspace", username: "ada_lovelace" });
  await machine("teams", { type: "createTeam", id: teamId, name: "Core infrastructure", actor: wallet, now });
  await machine("teams", {
    type: "createProject",
    teamId,
    projectId,
    actor: wallet,
    name: "Production inference",
    budget,
  });
  await machine("teams", {
    type: "invite",
    teamId,
    actor: wallet,
    wallet: otherWallet,
    role: "Member",
    expiresAt: now + 7 * 86_400_000,
    now,
  });
  await machine("teams", { type: "respond", teamId, actor: otherWallet, accept: true, now });
  const full = "sonnely_live_ui_fidelity_demo_key";
  await machine("workspace-keys", {
    type: "create",
    id: keyId,
    label: "Launch key",
    prefix: full.slice(0, 20),
    hash: await sha256(full),
    wallet,
    project: projectId,
    scopes: ["inference"],
    cap: 12_000_000,
    dailyCap: 2_000_000,
    expiresAt: now + 20 * 86_400_000,
    now,
  });
  await machine("workspace-keys", { type: "recordUse", id: keyId, cost: 1_350_000, day: new Date(now).toISOString().slice(0, 10), now });
  await machine("usage", {
    type: "record",
    id: "req-ui-fidelity-project",
    time: now,
    keyName: "Launch key",
    keyId,
    project: projectId,
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    provider: "NearAI",
    cost: 1_350_000,
  });
  await machine("usage", {
    type: "charge",
    id: "req-ui-fidelity-project",
    input: 812,
    output: 348,
    cached: -1,
    cost: 684,
    providerMs: 3210,
  });
  await machine("support", {
    type: "open",
    id: ticketId,
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
    now: now - 1_800_000,
  });
  await machine("admin-referrals", { type: "issueCode", wallet, code: "9wzd-invite01" });
  await machine("admin-referrals", { type: "signup", code: "9wzd-invite01", wallet: otherWallet, joined: now - 5 * 86_400_000 });
  await machine("admin-referrals", { type: "markFunded", wallet: otherWallet });
}

function legacyPayload(pathname, searchParams) {
  const session = {
    profile: {
      wallet,
      name: "Ada Workspace",
      username: "ada_lovelace",
      balance: 18_500_000,
      referral: "9wzd-invite01",
      role: "member",
      onboarding: "later",
    },
    enabled: true,
    termsRequired: false,
    billingEnabled: true,
    paymentVerificationEnabled: true,
    inferenceEnabled: true,
    cluster: "mainnet",
  };
  const project = { id: projectId, team: teamId, name: "Production inference", budget, spent, archived: false };
  if (pathname.endsWith("/session")) return session;
  if (pathname.endsWith("/teams") && searchParams.has("project")) {
    return {
      project,
      role: "owner",
      keys: [
        {
          id: keyId,
          name: "Launch key",
          prefix: "sonnely_live_ui_fid",
          cap: 12_000_000,
          dailyCap: 2_000_000,
          lifetime: 1_350_000,
          expires: now + 20 * 86_400_000,
        },
      ],
      requests: [
        {
          id: "req-ui-fidelity-project",
          time: now - 3_210,
          model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
          keyName: "Launch key",
          endpoint: "chat/completions",
          status: "complete",
          cost: 684,
        },
      ],
    };
  }
  if (pathname.endsWith("/teams") && searchParams.has("team")) {
    return {
      team: { id: teamId, name: "Core infrastructure", role: "owner" },
      members: [
        { account: "member-owner", wallet, role: "owner" },
        { account: "member-second", wallet: otherWallet, role: "member" },
      ],
      invites: [],
      projects: [project],
    };
  }
  if (pathname.endsWith("/teams")) {
    return { teams: [{ id: teamId, name: "Core infrastructure", role: "owner" }], invitations: [] };
  }
  if (pathname.endsWith("/referral-pipeline")) {
    return {
      page: [{ username: "grace_hopper", wallet: otherWallet, joined: now - 5 * 86_400_000, funded: true, active: false }],
      isDone: true,
      continueCursor: "",
    };
  }
  if (pathname.endsWith("/support-tickets")) {
    return {
      page: [
        {
          id: ticketId,
          topic: "Workspace support",
          email: "ada@example.com",
          state: "in_progress",
          opened: now - 3_600_000,
          updated: now - 1_800_000,
          replyCount: 1,
          hasPublicReply: true,
          lastReplyAt: now - 1_800_000,
        },
      ],
      isDone: true,
      continueCursor: "",
    };
  }
  if (pathname.endsWith("/support-thread")) {
    return {
      id: ticketId,
      topic: "Workspace support",
      email: "ada@example.com",
      state: "in_progress",
      message: "The project dashboard is missing a settled request.",
      opened: now - 3_600_000,
      replies: [
        {
          id: "reply-ui-fidelity",
          mine: false,
          body: "We are checking the settlement pipeline and will update the request here.",
          time: now - 1_800_000,
        },
      ],
    };
  }
  if (pathname.endsWith("/sessions")) {
    return [
      { id: "session-current", created: now - 2 * 86_400_000, expires: now + 5 * 86_400_000, current: true },
      { id: "session-other", created: now - 4 * 86_400_000, expires: now + 3 * 86_400_000, current: false },
    ];
  }
  if (pathname.endsWith("/live")) return null;
  return {};
}

async function installLegacyMocks(page) {
  await page.route("**/api/sonnely/**", async (route) => {
    const url = new URL(route.request().url());
    const action = route.request().method() === "POST" ? route.request().postDataJSON()?.action : undefined;
    const payload = action === "create-key" ? { key: "sonnely_live_one_time_demo" } : legacyPayload(url.pathname, url.searchParams);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

async function shot(page, path) {
  const session = await page.context().newCDPSession(page);
  const metrics = await session.send("Page.getLayoutMetrics");
  const size = metrics.cssContentSize ?? metrics.contentSize;
  const clip = { x: 0, y: 0, width: 1440, height: Math.ceil(size.height), scale: 1 };
  const image = await session.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
  await writeFile(path, Buffer.from(image.data, "base64"));
}

async function capturePair(browser, name, path, migrationPath, actions) {
  const legacyPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installLegacyMocks(legacyPage);
  await legacyPage.goto(legacyBase + path, { waitUntil: "domcontentloaded" });
  await legacyPage.waitForTimeout(500);
  if (actions) await actions(legacyPage);
  await shot(legacyPage, `${out}/${name}-legacy.png`);

  const migrationPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await migrationPage.goto(migrationBase + migrationPath, { waitUntil: "domcontentloaded" });
  await migrationPage.waitForTimeout(700);
  if (actions) await actions(migrationPage);
  await shot(migrationPage, `${out}/${name}-migration.png`);
  await legacyPage.close();
  await migrationPage.close();
}

await mkdir(out, { recursive: true });
await seedMigration();
const browser = await chromium.launch({ headless: true });
const only = process.argv[2];
const capture = (name, path, migrationPath, actions) =>
  !only || only === name ? capturePair(browser, name, path, migrationPath, actions) : Promise.resolve();
await capture("teams", "/console/teams", "/console/teams");
await capture("teams-archive-dialog", "/console/teams", "/console/teams", async (page) => {
  await page.getByText("Project settings", { exact: true }).click();
  await page.getByRole("button", { name: "Archive project" }).click();
});
await capture("teams-key-created", "/console/teams", "/console/teams", async (page) => {
  await page.getByLabel("Key name").fill("Screenshot key");
  await page.getByRole("button", { name: "Create project key" }).click();
  await page.getByText("Copy the new key now. This is its only display.").waitFor({ timeout: 5000 });
});
await capture("referrals", "/console/referrals", "/console/admin/referrals");
await capture("support", "/console/support", "/console/support");
await capture("support-thread", "/console/support", "/console/support", async (page) => {
  await page.locator(".crm-record summary").first().click();
});
await capture("settings", "/console/settings", "/console/settings");
await capture("settings-signout", "/console/settings", "/console/settings", async (page) => {
  await page.getByRole("button", { name: "Sign out other sessions" }).click();
});
await browser.close();
process.stdout.write(`screenshots in ${out}\n`);
