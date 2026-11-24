import { expect, test } from "@playwright/test";
import { apiBasePath } from "../lib/api-contract";
import { formatRate } from "../lib/pricing";
import { fixtureWallet } from "./fixtures/wallets";

const deepseek = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
const glm = "z-ai/glm-5.3-flash";

type CatalogModel = {
  id: string;
  routes: {
    provider: string;
    provider_name: string;
    price_usd_per_million: { input: number; output: number };
  }[];
};

test("the Playground applies the selected provider and keeps unavailable routes out of the picker", async ({
  page,
  request,
}) => {
  const response = await request.get(apiBasePath + "/models");
  expect(response.ok()).toBe(true);
  const catalog = (await response.json()).data as CatalogModel[];
  const routes = catalog.find((model) => model.id === deepseek)!.routes;
  const first = routes.find((route) => route.provider === "near-ai");
  const second = routes.find((route) => route.provider === "tinfoil");
  test.skip(!first || !second, "The provider-switching fixture requires NEAR AI and Tinfoil.");
  if (!first || !second) return;

  await page.setViewportSize({ width: 320, height: 800 });
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { wallet: fixtureWallet, name: "Playground fixture", balance: 1_000_000 },
        inferenceEnabled: true,
      },
    }),
  );
  await page.route("**/api/sonnely/live", (route) => route.fulfill({ status: 204 }));
  let posted: unknown;
  await page.route("**/api/sonnely/chat", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"choices":[{"delta":{"content":"Selected route response."}}]}\n\ndata: [DONE]\n\n',
    });
  });

  await page.goto("/console?model=" + encodeURIComponent(deepseek));
  const trigger = page.locator(".playground-route-trigger");
  await expect(trigger).toContainText(first.provider_name);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Choose a model" });
  const providerOptions = dialog.getByRole("group", { name: "Provider" });
  await expect(providerOptions.getByRole("radio")).toHaveCount(routes.length);
  await expect(providerOptions.getByRole("radio", { name: /^NEAR AI/ })).toBeChecked();
  const tinfoil = providerOptions.getByRole("radio", { name: /^Tinfoil/ });
  await expect(tinfoil).toHaveAccessibleName(
    new RegExp(
      "Tinfoil.*" + formatRate(second.price_usd_per_million.input).replaceAll(".", "\\.").replace("$", "\\$"),
    ),
  );
  await tinfoil.press("Space");
  await expect(tinfoil).toBeChecked();
  const apply = dialog.getByRole("button", { name: "Use model" });
  await expect(apply).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await apply.click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText(second.provider_name);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Send through the chosen provider.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Selected route response.")).toBeVisible();
  expect(posted).toMatchObject({ model: deepseek, provider: { only: ["tinfoil"] } });

  await trigger.click();
  const findModel = dialog.getByRole("searchbox", { name: "Find a model" });
  await findModel.fill(glm);
  const filtered = dialog.getByRole("group", { name: "Model", exact: true }).getByRole("radio");
  await expect(filtered).toHaveCount(1);
  await filtered.press("Space");
  const compatible = catalog.find((model) => model.id === glm)!.routes;
  await expect(providerOptions.getByRole("radio")).toHaveCount(compatible.length);
  await expect(providerOptions.getByRole("radio", { name: /^Tinfoil/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("Tinfoil");

  await page.goto("/console?model=" + encodeURIComponent(deepseek) + "&provider=tinfoil");
  await expect(trigger).toContainText("Tinfoil");
  await trigger.click();
  await expect(providerOptions.getByRole("radio", { name: /^Tinfoil/ })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
