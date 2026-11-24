import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getBase58Decoder } from "@solana/kit";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const url = process.env.SONNELY_TEST_LOCAL_CONVEX;
const secret = process.env.SONNELY_TEST_CONVEX_SECRET;
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const randomAddress = (size = 32) => getBase58Decoder().decode(randomBytes(size));
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const credential = () => "sonnely_live_" + randomBytes(32).toString("base64url");

function backendFixture() {
  if (!url || !secret || new URL(url).hostname !== "127.0.0.1")
    throw new Error("This test requires an isolated loopback Convex deployment.");
  const db = new ConvexHttpClient(url);
  const connectedSecret = secret;
  async function signIn() {
    const wallet = randomAddress();
    const token = randomBytes(32).toString("hex");
    const auth = { secret: connectedSecret, session: digest(token) };
    await db.mutation(api.sonnely.signIn, {
      ...auth,
      wallet,
      nonce: randomBytes(20).toString("hex"),
      referral: randomBytes(8).toString("hex"),
      expires: Date.now() + 60_000,
    });
    await db.mutation(api.sonnely.finishOnboarding, { ...auth, funding: "later" });
    return { wallet, auth, token };
  }
  return { db, signIn, secret: connectedSecret };
}

test("project reservations honor tenant roles, wallet balance, budgets, and credential lifecycle", async () => {
  test.skip(!url || !secret, "Requires the isolated local Convex deployment.");
  const { db, signIn, secret: service } = backendFixture();
  const [owner, admin, member, other] = await Promise.all([signIn(), signIn(), signIn(), signIn()]);
  const now = Date.now();
  const team = await db.mutation(api.teams.create, { ...owner.auth, name: "Research team" });
  await db.mutation(api.teams.invite, { ...owner.auth, team, wallet: admin.wallet, role: "admin" });
  expect((await db.query(api.teams.list, { ...admin.auth, now })).invitations).toEqual([
    expect.objectContaining({ team, role: "admin", expires: expect.any(Number) }),
  ]);
  expect((await db.query(api.teams.list, { ...other.auth, now })).invitations).toEqual([]);
  await expect(db.mutation(api.teams.respond, { ...other.auth, team, accept: true })).rejects.toThrow(
    "Team or project unavailable.",
  );
  await db.mutation(api.teams.respond, { ...admin.auth, team, accept: true });
  await expect(
    db.mutation(api.teams.invite, { ...admin.auth, team, wallet: other.wallet, role: "admin" }),
  ).rejects.toThrow("Team role does not allow this action.");
  await db.mutation(api.teams.invite, { ...admin.auth, team, wallet: member.wallet, role: "member" });
  await db.mutation(api.teams.respond, { ...member.auth, team, accept: true });
  await expect(
    db.mutation(api.teams.createProject, { ...member.auth, team, name: "Rejected", budget: 100_000 }),
  ).rejects.toThrow("Team role does not allow this action.");

  const project = await db.mutation(api.teams.createProject, {
    ...admin.auth,
    team,
    name: "Classify",
    budget: 100_000,
  });
  const otherTeam = await db.mutation(api.teams.create, { ...other.auth, name: "Other team" });
  const otherProject = await db.mutation(api.teams.createProject, {
    ...other.auth,
    team: otherTeam,
    name: "Other project",
    budget: 100_000,
  });
  await expect(db.query(api.teams.projectDetail, { ...member.auth, project: otherProject })).rejects.toThrow(
    "Team or project unavailable.",
  );
  await expect(db.query(api.teams.detail, { ...other.auth, team, now })).rejects.toThrow(
    "Team or project unavailable.",
  );

  const reference = randomAddress();
  await db.mutation(api.sonnely.createDeposit, {
    ...owner.auth,
    reference,
    recipient: owner.wallet,
    mint,
    cluster: "mainnet",
    amount: 1_000_000,
  });
  await db.mutation(api.sonnely.confirmDeposit, { ...owner.auth, reference, signature: randomAddress(64) });

  const key = credential();
  const ownerKey = credential();
  const personal = credential();
  const keyFields = (token: string, name: string) => ({
    name,
    prefix: token.slice(0, 20),
    hash: digest(token),
    cap: null,
    dailyCap: null,
    expires: null,
  });
  await db.mutation(api.sonnely.createKey, { ...owner.auth, ...keyFields(personal, "Personal") });
  await db.mutation(api.teams.createProjectKey, {
    ...admin.auth,
    project,
    ...keyFields(key, "Admin project key"),
    dailyCap: 90_000,
  });
  await db.mutation(api.teams.createProjectKey, {
    ...owner.auth,
    project,
    ...keyFields(ownerKey, "Owner project key"),
  });

  const ownerView = await db.query(api.teams.projectDetail, { ...owner.auth, project });
  const keyId = ownerView.keys.find((row) => row.name === "Admin project key")!.id;
  expect(ownerView.keys).toHaveLength(2);
  expect(ownerView.keys[0]).not.toHaveProperty("hash");
  expect((await db.query(api.teams.projectDetail, { ...member.auth, project })).keys).toEqual([]);
  expect((await db.query(api.sonnely.listKeys, owner.auth)).map((row) => row.name)).toEqual(["Personal"]);
  await expect(db.mutation(api.sonnely.revokeKey, { ...owner.auth, id: keyId })).rejects.toThrow(
    "Key unavailable.",
  );
  await expect(
    db.mutation(api.sonnely.updateKey, {
      ...owner.auth,
      id: keyId,
      name: "Bypass",
      cap: null,
      dailyCap: null,
      expires: null,
    }),
  ).rejects.toThrow("Key unavailable.");
  await expect(
    db.mutation(api.teams.revokeProjectKey, { ...other.auth, project: otherProject, key: keyId }),
  ).rejects.toThrow("Team or project unavailable.");
  await expect(
    db.mutation(api.teams.createProjectKey, {
      ...member.auth,
      project,
      ...keyFields(credential(), "Denied"),
    }),
  ).rejects.toThrow("Team role does not allow this action.");

  const reserve = (token: string, cost: number, retryKey?: string) =>
    db.mutation(api.sonnely.reserve, {
      secret: service,
      hash: digest(token),
      model: "fixture-chat",
      endpoint: "chat/completions",
      cost,
      retryKey,
    });
  const settle = (id: Id<"usage">, cost: number, status: "complete" | "failed" = "complete") =>
    db.mutation(api.sonnely.settle, { secret: service, id, input: 4, output: 2, cost, status });
  const balance = () => db.query(api.sonnely.profile, owner.auth);
  const detail = () => db.query(api.teams.projectDetail, { ...member.auth, project });

  const id = await reserve(key, 80_000, "request-on-project");
  expect((await balance())?.balance).toBe(920_000);
  expect((await db.query(api.sonnely.profile, member.auth))?.balance).toBe(0);
  expect((await detail()).project.spent).toBe(80_000);
  await expect(reserve(key, 15_000)).rejects.toThrow("The API key budget would be exceeded.");
  await expect(reserve(ownerKey, 30_000)).rejects.toThrow("The project budget would be exceeded.");
  await expect(reserve(key, 0, "request-on-project")).rejects.toThrow("duplicate_request");
  const independent = await reserve(ownerKey, 0, "request-on-project");
  const personalRequest = await reserve(personal, 0, "request-on-project");
  expect(new Set([id, independent, personalRequest]).size).toBe(3);
  await settle(independent, 0);
  await settle(personalRequest, 0);
  await settle(id, 20_000);
  await settle(id, 0, "failed");
  expect((await balance())?.balance).toBe(980_000);
  expect((await detail()).project.spent).toBe(20_000);
  expect((await detail()).requests).toEqual(
    expect.arrayContaining([expect.objectContaining({ id, status: "complete", cost: 20_000 })]),
  );
  expect((await detail()).requests.find((row) => row.id === personalRequest)).toBeUndefined();

  const adminId = (await db.query(api.teams.detail, { ...owner.auth, team, now })).members.find(
    (row) => row.wallet === admin.wallet,
  )!.account;
  await db.mutation(api.teams.changeMember, { ...owner.auth, team, account: adminId, role: "member" });
  await expect(reserve(key, 0)).rejects.toThrow("Invalid or expired API key.");
  await db.mutation(api.teams.changeMember, { ...owner.auth, team, account: adminId, role: "admin" });
  await expect(reserve(key, 0)).rejects.toThrow("Invalid or expired API key.");

  const last = await reserve(ownerKey, 80_000);
  await db.mutation(api.teams.archiveProject, { ...owner.auth, project });
  await expect(reserve(ownerKey, 0)).rejects.toThrow("Invalid or expired API key.");
  await expect(
    db.query(api.currentKey.status, { secret: service, hash: digest(ownerKey), now }),
  ).rejects.toThrow("Invalid or expired API key.");
  await settle(last, 0, "failed");
  expect((await detail()).project).toMatchObject({ archived: true, spent: 20_000 });
  expect((await balance())?.balance).toBe(980_000);
});

test("Teams console creates a project key and accepts a wallet-bound invitation", async ({
  page,
  baseURL,
}) => {
  test.skip(!url || !secret, "Requires the isolated local Convex deployment.");
  if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1")
    throw new Error("This test uses a local Next server.");
  const { signIn } = backendFixture();
  const [owner, invited] = await Promise.all([signIn(), signIn()]);
  await page.context().addCookies([{ name: "sonnely_session", value: owner.token, url: baseURL }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/console/teams");
  await page.getByLabel("Team name").fill("Partner team");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await page.getByLabel("Project name").fill("Search indexer");
  await page.getByLabel("Lifetime budget in USD").fill("5.00");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("region", { name: "Search indexer", exact: true })).toBeVisible();
  await page.getByLabel("Key name").fill("Indexer key");
  await page.getByRole("button", { name: "Create project key", exact: true }).click();
  await expect(page.getByText(/^sonnely_live_[a-zA-Z0-9_-]{43}$/)).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Indexer key", { exact: true })).toBeVisible();

  await page.getByText("Invite a wallet", { exact: true }).click();
  await page.getByLabel("Solana wallet address").fill(invited.wallet);
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pending invitations", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.context().clearCookies({ name: "sonnely_session" });
  await page.context().addCookies([{ name: "sonnely_session", value: invited.token, url: baseURL }]);
  await page.reload();
  const invitation = page.getByRole("region", { name: "Team invitations" });
  await expect(invitation.getByText("Partner team", { exact: true })).toBeVisible();
  await invitation.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByRole("region", { name: "Search indexer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create project key", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Project API keys", exact: true })).toHaveCount(0);
});
