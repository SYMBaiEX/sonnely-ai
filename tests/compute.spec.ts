import { mock } from "node:test";
import { devices, expect, test } from "@playwright/test";
import type { Doc } from "../convex/_generated/dataModel";
import {
  buildArtifact,
  buildStatus,
  createDock,
  deleteDock,
  dockUsage,
  ProviderError,
  startBuild,
  stopDock,
} from "../convex/computeProvider";
import { computeQuote } from "../lib/compute";

test("compute quotes reserve provider cost and the platform fee in microdollars", () => {
  expect(computeQuote("blackboxes", 15)).toEqual({ base: 15195, fee: 13799, total: 28994 });
  expect(computeQuote("dry-docks", 10)).toEqual({ base: 3000, fee: 10750, total: 13750 });
});

test("Boat capacity rejects unpaid starts and the paid adapter isolates builds and tears them down", async () => {
  const run = {
    _id: "ks7fixture",
    _creationTime: Date.now(),
    kind: "dry-docks",
    spec: { kind: "dry-docks", repository: "https://github.com/example/build", revision: "a".repeat(40) },
    minutes: 5,
    providerId: "bx_23456789",
    processId: 12,
  } as Doc<"computeRuns">;
  const key = process.env.BOAT_API_KEY;
  process.env.BOAT_API_KEY = "fixture";
  let permitted = false;
  const provider = mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer fixture");
    if (path.endsWith("/limits")) {
      return Response.json({
        canStart: permitted,
        checkoutRequired: !permitted,
        hasPaymentHistory: permitted,
        machineTypes: [{ type: "small", available: true }],
        subscriptionStatus: permitted ? "active" : "none",
        nextStartDollars: 0,
      });
    }
    if (path.endsWith("/sandboxes") && init.method === "POST") {
      expect(JSON.parse(String(init.body))).toMatchObject({
        type: "small",
        noEnv: true,
        snapshots: false,
        ttlSeconds: 300,
      });
      expect(headers.get("idempotency-key")).toBe(run._id);
      return Response.json({ sandbox: { id: run.providerId, state: "provisioning" } });
    }
    if (path.endsWith("/commands")) {
      const input = JSON.parse(String(init.body));
      expect(input.detached).toBe(true);
      expect(input.command).toContain("npm ci");
      expect(input.command).toContain("npm run build");
      expect(input.command).toContain(run.spec.kind === "dry-docks" ? run.spec.revision : "");
      return Response.json({ processId: 12 });
    }
    if (path.endsWith("/commands/12"))
      return Response.json({ running: false, exitCode: 0, stdout: "Build complete", stderr: "" });
    if (path.endsWith("/artifacts")) return new Response("fixture archive");
    if (path.endsWith("/stop")) return new Response(null, { status: 202 });
    if (path.endsWith("/usage"))
      return Response.json({ running: false, seconds: 60, dollars: 0.0006, billingMultiplier: 0.5 });
    if (path.endsWith("/deletion-operations/delete_1"))
      return Response.json({ operation: { id: "delete_1", status: "completed" } });
    if (path.endsWith("/sandboxes/" + run.providerId) && init.method === "DELETE") {
      expect(headers.get("x-ascii-confirm-delete")).toBe(run.providerId);
      return Response.json({ operation: { id: "delete_1", status: "pending" } }, { status: 202 });
    }
    throw new Error("Unexpected provider path");
  });
  try {
    await expect(createDock(run)).rejects.toMatchObject({ status: 402 } satisfies Partial<ProviderError>);
    expect(provider.mock.callCount()).toBe(1);
    permitted = true;
    await expect(createDock(run)).resolves.toBe(run.providerId);
    await expect(startBuild(run, 240)).resolves.toMatchObject({ processId: 12 });
    await expect(buildStatus(run)).resolves.toMatchObject({ stdout: "Build complete", exitCode: 0 });
    expect(await (await buildArtifact(run))?.text()).toBe("fixture archive");
    expect((await stopDock(run)).status).toBe(202);
    await expect(dockUsage(run)).resolves.toMatchObject({ running: false, dollars: 0.0006 });
    await expect(deleteDock(run)).resolves.toEqual({ id: "delete_1", status: "pending" });
    await expect(deleteDock({ ...run, deletionId: "delete_1" })).resolves.toMatchObject({
      status: "completed",
    });
  } finally {
    provider.mock.restore();
    if (key === undefined) delete process.env.BOAT_API_KEY;
    else process.env.BOAT_API_KEY = key;
  }
});

test.use({ ...devices["Pixel 7"], defaultBrowserType: "chromium" });
test("both products show responsive paid quotes in both themes", async ({ page }) => {
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: {
          wallet: "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk",
          name: "Compute fixture",
          balance: 1_000_000,
        },
        enabled: true,
        cluster: "mainnet",
      },
    }),
  );
  await page.route("**/api/sonnely/compute?**", (route) =>
    route.fulfill({ json: { enabled: true, runs: [], log: "" } }),
  );
  await page.goto("/console/blackboxes");
  await expect(page.getByRole("heading", { name: "Blackboxes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rent Blackbox.*0\.028994/ })).toBeEnabled();
  await page.getByRole("combobox", { name: "Rental window" }).selectOption("120");
  await expect(page.getByRole("button", { name: /Rent Blackbox.*0\.16195/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);

  await page.evaluate(() => localStorage.setItem("sonnely.preferences", JSON.stringify({ theme: "light" })));
  await page.goto("/console/dry-docks");
  await expect(page.getByRole("heading", { name: "Dry Docks" })).toBeVisible();
  await expect(page.locator(".theme-root")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: /Start paid build.*0\.011875/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);
});

test("Dry Dock run links load an owner detail and display live logs and settled downloads", async ({
  page,
}) => {
  const id = "ks7ctestw6m50r22c5ktfgxmwec6jv6w";
  const time = Date.now();
  let phase = "provisioning";
  let log = "";
  const repository = "https://github.com/mdn/client-toolchain-example";
  const revision = "23fdd12e35684be99fd7273d147997ec60755c62";
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: {
          wallet: "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk",
          name: "Run fixture",
          balance: 1_000_000,
        },
        enabled: true,
        cluster: "mainnet",
      },
    }),
  );
  await page.route("**/api/sonnely/compute?**", (route) => {
    expect(new URL(route.request().url()).searchParams.get("id")).toBe(id);
    return route.fulfill({
      json: {
        enabled: true,
        runs: [],
        log,
        selected: id,
        detail: {
          id,
          phase,
          createdAt: time,
          startedAt: time + 100,
          spec: { kind: "dry-docks", repository, revision },
          minutes: 5,
          reserve: 11875,
          active: phase !== "settled",
          ...(phase === "settled"
            ? {
                result: "completed",
                charged: 10125,
                base: 100,
                fee: 10025,
                seconds: 20,
                settledAt: time + 1500,
                hasArtifact: true,
              }
            : {}),
          hasLog: Boolean(log),
        },
      },
    });
  });
  await page.goto("/console/dry-docks?run=" + id);
  await expect(page.getByRole("heading", { name: /mdn\/client-toolchain-example/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Run timeline" })).toContainText("Provisioning");
  phase = "running";
  log = "Installing dependencies with npm ci\nRunning npm build";
  await expect(page.getByLabel("Build output")).toContainText("Running npm build");
  await expect(page.getByRole("button", { name: "Follow", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  phase = "settled";
  await expect(page.getByRole("link", { name: "Download artifact" })).toHaveAttribute(
    "href",
    /file=artifact/,
  );
  await expect(page.getByRole("link", { name: "Download receipt" })).toHaveAttribute("href", /file=receipt/);
  await expect(page.getByRole("link", { name: "Download log" })).toHaveAttribute("href", /file=log/);
  await page.getByRole("button", { name: "Use this commit again" }).click();
  await expect(page.getByRole("textbox", { name: "Commit SHA" })).toHaveValue(revision);
});

test("Dry Docks shows Coming soon without a build form while starts are paused", async ({ page }) => {
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { wallet: "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk", balance: 1_000_000 },
        enabled: true,
        cluster: "mainnet",
      },
    }),
  );
  await page.route("**/api/sonnely/compute?**", (route) =>
    route.fulfill({ json: { enabled: false, runs: [], log: "" } }),
  );
  await page.goto("/console/dry-docks");
  await expect(page.getByRole("heading", { name: "Coming soon" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start paid build/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Public GitHub repository" })).toHaveCount(0);
});
