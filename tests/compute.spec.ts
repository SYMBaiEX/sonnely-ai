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
  prepareBlackbox,
  startBuild,
  stopDock,
} from "../convex/computeProvider";
import { computeFeatures } from "../lib/compute-features";
import { computePrice, computeQuote, imagePattern } from "../lib/compute";
import { blackboxHourlyBase, blackboxPresets } from "../lib/blackbox-options";

test("compute quotes reserve provider cost and the platform fee in microdollars", () => {
  expect(computeQuote("blackboxes", 15)).toEqual({ base: 15195, fee: 13799, total: 28994 });
  expect(computeQuote("dry-docks", 10)).toEqual({ base: 3000, fee: 10750, total: 13750 });
  expect(computePrice(blackboxHourlyBase("tdx.medium", 80), 60, 30 * 60)).toEqual({
    base: 63560,
    fee: 25890,
    total: 89450,
  });
  for (const preset of Object.values(blackboxPresets)) expect(preset.image).toMatch(imagePattern);
});

test("Phala prepares the selected machine and SSD with the pinned preset", async () => {
  const preset = blackboxPresets.whoami;
  const run = {
    _id: "ks7fixture",
    kind: "blackboxes",
    spec: { kind: "blackboxes", image: preset.image, port: preset.port, machine: "tdx.large", disk: 80 },
  } as Doc<"computeRuns">;
  const key = process.env.PHALA_CLOUD_API_KEY;
  process.env.PHALA_CLOUD_API_KEY = "fixture";
  const provider = mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe("https://cloud-api.phala.com/api/v1/cvms");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      instance_type: "tdx.large",
      disk_size: 80,
      listed: false,
      compose_file: { gateway_enabled: true, kms_enabled: true, public_logs: false, public_sysinfo: false },
    });
    expect(body.compose_file.docker_compose_file).toContain(preset.image);
    expect(body.compose_file.docker_compose_file).toContain('"80:80"');
    return Response.json({ token: "prepare-fixture", compose_hash: "fixture-hash" });
  });
  try {
    await expect(prepareBlackbox(run)).resolves.toMatchObject({ compose_hash: "fixture-hash" });
  } finally {
    provider.mock.restore();
    if (key === undefined) delete process.env.PHALA_CLOUD_API_KEY;
    else process.env.PHALA_CLOUD_API_KEY = key;
  }
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
  const flags = computeFeatures();
  test.skip(
    !flags.blackboxes || !flags["dry-docks"],
    "Run against a build with the corresponding product flags enabled",
  );
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
  let opened = false;
  await page.route("**/api/sonnely/compute", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      action: "open",
      minutes: 120,
      spec: {
        kind: "blackboxes",
        image: blackboxPresets.whoami.image,
        port: blackboxPresets.whoami.port,
        machine: "tdx.medium",
        disk: 40,
      },
    });
    opened = true;
    await route.fulfill({ json: { id: "ks7ctestw6m50r22c5ktfgxmwec6jv6w" }, status: 202 });
  });
  await page.goto("/console/blackboxes");
  await expect(page.getByRole("heading", { name: "Blackboxes" })).toBeVisible();
  await page.getByRole("button", { name: /^Request inspector/ }).click();
  await expect(page.getByRole("dialog", { name: "Configure a Blackbox" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Request inspector/ })).toBeChecked();
  await expect(page.getByLabel("Public OCI image digest")).toHaveCount(0);
  const rentalOrder = page.getByRole("button", { name: /Rent Blackbox.*0\.028994/ });
  await expect(rentalOrder).toBeEnabled();
  await expect(rentalOrder).toBeInViewport();
  const costBreakdown = page.getByRole("button", { name: "Cost breakdown", exact: true });
  await expect(costBreakdown).toBeInViewport();
  await costBreakdown.click();
  await expect(page.getByRole("complementary", { name: "Rental quote" })).toBeFocused();
  await expect(page.getByText("Sonnely fee", { exact: true })).toBeInViewport();
  await page.getByRole("radio", { name: "2 hr", exact: true }).check();
  await expect(page.getByRole("button", { name: /Rent Blackbox.*0\.16195/ })).toBeEnabled();
  await page.getByRole("radio", { name: /^Medium/ }).check();
  await page.getByRole("radio", { name: "40 GB", exact: true }).check();
  await page.getByRole("button", { name: /Rent Blackbox.*0\.3139/ }).click();
  await expect(page.getByRole("dialog", { name: "Configure a Blackbox" })).toBeHidden();
  expect(opened).toBe(true);
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
  const flags = computeFeatures();
  test.skip(!flags["dry-docks"], "Run against a build with the corresponding product flags enabled");
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

test("disabled compute product pages redirect and discovery marks them coming soon", async ({
  page,
  request,
}) => {
  const flags = computeFeatures();
  test.skip(flags.blackboxes || flags["dry-docks"], "Checks both flags off");
  for (const kind of ["blackboxes", "dry-docks"]) {
    const origin = await request.get("/" + kind, { maxRedirects: 0 });
    expect(origin.status()).toBe(307);
    expect(origin.headers().location).toBe("/compute#" + kind);
    const consolePage = await request.get("/console/" + kind, { maxRedirects: 0 });
    expect(consolePage.status()).toBe(307);
    expect(consolePage.headers().location).toBe("/console");
    expect((await request.get("/docs/" + kind)).status()).toBe(404);
  }
  await page.goto("/compute");
  await expect(page.locator("#products").getByText("Coming soon", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Blackboxes|Dry Docks/ })).toHaveCount(0);
  await page.goto("/console");
  const rail = page.getByRole("navigation", { name: "Workspace navigation" });
  await expect(rail.getByRole("link", { name: /Blackboxes|Dry Docks/ })).toHaveCount(0);
});

test("Blackbox rentals expose controls, attestation and final charges on mobile", async ({ page }) => {
  const flags = computeFeatures();
  test.skip(!flags.blackboxes, "Run against a build with the corresponding product flags enabled");
  const now = Date.now();
  const id = "kx7cvmrunw6m50r22c5ktfgxmwec6jv6";
  const pastId = "kx7cvmrunw6m50r22c5ktfgxmwec6jv7";
  const image = "ghcr.io/sonnely/workload@sha256:" + "a".repeat(64);
  const endpoint = "https://workload.example.com";
  const spec = { kind: "blackboxes", image, port: 8443 };
  let stopped = false;
  let stopRequests = 0;
  let openRequests = 0;
  const newId = "kx7cvmrunw6m50r22c5ktfgxmwec6jv8";
  const active = {
    id,
    spec,
    phase: "running",
    active: true,
    createdAt: now - 60_000,
    startedAt: now - 60_000,
    expiresAt: now + 840_000,
    evidenceAt: now - 45_000,
    hasEvidence: true,
    endpoint,
    composeHash: "b".repeat(64),
    minutes: 15,
    reserve: 28_994,
  };
  const past = {
    ...active,
    id: pastId,
    createdAt: now - 180_000,
    startedAt: now - 180_000,
    evidenceAt: now - 175_000,
    spec: { ...spec, image: "docker.io/library/httpd@sha256:" + "c".repeat(64) },
    phase: "settled",
    result: "stopped",
    active: false,
    endpoint: undefined,
    expiresAt: undefined,
    settledAt: now - 90_000,
    purgeAt: now + 7 * 86_400_000,
    charged: 12_500,
    base: 2_000,
    fee: 10_500,
    seconds: 91,
  };

  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { wallet: "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk", balance: 1_000_000 },
        cluster: "mainnet",
        enabled: true,
      },
    }),
  );
  await page.route("**/api/sonnely/compute?**", (route) => {
    const queued = {
      id: newId,
      spec: past.spec,
      createdAt: now,
      phase: "queued",
      active: true,
      hasEvidence: false,
      reserve: active.reserve,
      minutes: 15,
    };
    const runs = [...(openRequests ? [queued] : []), stopped ? { ...past, id, spec } : active, past];
    const params = new URL(route.request().url()).searchParams;
    if (params.get("file") === "evidence") {
      expect(params.get("id")).toBe(id);
      return route.fulfill({
        json: { capturedAt: now },
        headers: { "Content-Disposition": 'attachment; filename="blackbox-attestation.json"' },
      });
    }
    return route.fulfill({
      json: { enabled: true, runs, detail: runs.find((run) => run.id === params.get("id")) },
    });
  });
  await page.route("**/api/sonnely/compute", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "open") {
      expect(body).toMatchObject({ action: "open", spec: past.spec, minutes: 15 });
      expect(body.reference).toMatch(/^[a-f0-9]{32}$/);
      openRequests++;
      await route.fulfill({ json: { id: newId }, status: 202 });
    } else {
      expect(body).toEqual({ action: "stop", id });
      stopRequests++;
      stopped = true;
      await route.fulfill({ json: { ok: true } });
    }
  });

  await page.goto("/console/blackboxes");
  await expect(page.getByRole("link", { name: "Open workload" })).toHaveAttribute("href", endpoint);
  await expect(page.getByRole("progressbar", { name: "Rental time used" })).toBeVisible();
  const attestation = page.getByRole("link", { name: "Download attestation" });
  await expect(attestation).toHaveAttribute("href", "/api/sonnely/compute?id=" + id + "&file=evidence");
  const downloaded = page.waitForEvent("download");
  await attestation.click();
  expect((await downloaded).suggestedFilename()).toBe("blackbox-attestation.json");

  await page.getByRole("button", { name: "End rental", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "End this rental?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Keep rental" }).click();
  expect(stopRequests).toBe(0);
  await page.getByRole("button", { name: "End rental", exact: true }).click();
  await confirmation.getByRole("button", { name: "End rental", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(page.getByRole("link", { name: "Open workload" })).toHaveCount(0);
  expect(stopRequests).toBe(1);
  await expect(page.getByText("Returned credits", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Past", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search rentals" }).fill("httpd");
  await page.getByRole("button", { name: /docker\.io\/library\/httpd/ }).click();
  await expect(page.getByRole("heading", { name: "docker.io/library/httpd" })).toBeVisible();
  await page.getByRole("button", { name: "Rent this image again" }).click();
  await expect(page.getByLabel("Public OCI image digest")).toHaveValue(past.spec.image);
  await expect(page.getByLabel("Container HTTP port")).toHaveValue("8443");
  await expect(page.getByRole("radio", { name: "15 min", exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);
  const start = page.getByRole("button", { name: /Rent Blackbox.*0\.028994/ });
  await page.getByLabel("Public OCI image digest").fill("docker.io/library/httpd:latest");
  await start.click();
  await expect(page.getByText(/Enter a Docker Hub or GHCR image pinned with/)).toBeVisible();
  expect(openRequests).toBe(0);
  await page.getByLabel("Public OCI image digest").fill(past.spec.image);
  await start.click();
  await expect(page.getByRole("dialog", { name: "Configure a Blackbox" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "docker.io/library/httpd" })).toBeVisible();
  expect(openRequests).toBe(1);
});

test("agent framework presets guide a configured image through the rental form", async ({ page }) => {
  const flags = computeFeatures();
  test.skip(!flags.blackboxes, "Run against a build with the corresponding product flags enabled");
  const image = "ghcr.io/example/eliza@sha256:" + "a".repeat(64);
  let submitted: unknown;
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { wallet: "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk", balance: 1_000_000 },
        enabled: true,
        cluster: "mainnet",
      },
    }),
  );
  await page.route("**/api/sonnely/compute**", (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 409, json: { error: "Rental fixture" } });
    }
    return route.fulfill({ json: { enabled: true, runs: [], log: "" } });
  });
  await page.goto("/console/blackboxes");
  await page.getByRole("button", { name: /Hermes Agent/ }).click();
  const dialog = page.getByRole("dialog", { name: "Configure a Blackbox" });
  const port = dialog.getByLabel("Container HTTP port");
  await expect(dialog.getByRole("radio", { name: /Hermes Agent/ })).toBeChecked();
  await expect(port).toHaveValue("8642");
  await expect(dialog.getByRole("radio", { name: /Medium/ })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "40 GB" })).toBeChecked();
  await expect(dialog.getByRole("link", { name: "Hermes Agent setup guide" })).toBeVisible();

  for (const [name, expectedPort] of [
    ["OpenClaw", "18789"],
    ["Mastra", "4111"],
    ["Pydantic AI", "8000"],
    ["ElizaOS", "3000"],
  ]) {
    await dialog.getByRole("radio", { name: new RegExp(name) }).check();
    await expect(port).toHaveValue(expectedPort);
  }

  const submit = dialog.getByRole("button", { name: /Rent Blackbox/ });
  await submit.click();
  expect(submitted).toBeUndefined();
  await dialog.getByLabel("Public OCI image digest").fill(image);
  await submit.click();
  await expect
    .poll(() => submitted)
    .toMatchObject({
      action: "open",
      minutes: 15,
      spec: { kind: "blackboxes", image, port: 3000, machine: "tdx.medium", disk: 40 },
    });
});
