import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Wallet } from "ethers";
import { receiptHeader, type CompletionReceipt } from "../lib/completion-receipt";
import { parseReceiptInput, verifyReceiptEvidence } from "../lib/receipt-inspector";
import { fixtureWallet } from "./fixtures/wallets";

const model = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
const wireRequest = '{"messages":[{"role":"user","content":"Private input"}]}\n';
const wireResponse = '{"choices":[{"message":{"content":"Provider response"}}]}\n';
const requestId = "m7y0v9j2h41dhvpyktye2phjyh94r3e8";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const receiptFields = {
  version: "v1",
  requested_model: model,
  provider_completion_id: "chatcmpl-fixture",
  charged_microusd: 456,
  cached_input_tokens: 0,
  upstream_request_sha256: sha(wireRequest),
  upstream_response_sha256: sha(wireResponse),
} as const;

async function nearFixture(kind: "gateway" | "provider_tee" = "provider_tee") {
  const signer = Wallet.createRandom();
  const payload = (kind === "provider_tee" ? model + ":" : "") + sha(wireRequest) + ":" + sha(wireResponse);
  return {
    ...receiptFields,
    provider: "near-ai",
    evidence: {
      status: "signature_matched",
      signature_kind: kind,
      signing_algo: "ecdsa",
      signing_address: signer.address.slice(2),
      signature: (await signer.signMessage(payload)).slice(2),
      text: payload,
    },
  } as const;
}

const phala = {
  ...receiptFields,
  provider: "phala",
  evidence: {
    status: "aci_payload_matched",
    aci_receipt_id: "aci-fixture",
    aci_keyset_digest: "sha256:" + "a".repeat(64),
    operator_route: "phala-1:" + model,
    upstream_session_id: "session-fixture",
  },
} satisfies CompletionReceipt;

const tinfoil = {
  ...receiptFields,
  provider: "tinfoil",
  evidence: {
    status: "attested_router",
    config_repo: "tinfoilsh/confidential-model-router",
    release_digest: "sha256:" + "c".repeat(64),
  },
} satisfies CompletionReceipt;

test("parses one v1 receipt and checks NEAR signed payload and signer", async () => {
  const modelReceipt = await nearFixture();
  const gatewayReceipt = await nearFixture("gateway");
  const wrapped = { sonnely_receipt: gatewayReceipt, sonnely_request_id: requestId };
  expect(parseReceiptInput(JSON.stringify(modelReceipt))).toEqual({ receipt: modelReceipt });
  expect(parseReceiptInput(JSON.stringify(wrapped))).toEqual({ receipt: gatewayReceipt, requestId });
  const event = "data: " + JSON.stringify(wrapped) + "\r\n\r\n";
  expect(parseReceiptInput(event + "data: [DONE]\r\n\r\n")).toEqual({ receipt: gatewayReceipt, requestId });
  expect(() => parseReceiptInput(event + event)).toThrow("multiple receipts");
  expect(() => parseReceiptInput(JSON.stringify({ ...phala, provider: "tinfoil" }))).toThrow(
    "No supported Sonnely v1 receipt",
  );
  expect(() => parseReceiptInput(JSON.stringify({ ...tinfoil, upstream_response_sha256: "??" }))).toThrow(
    "No supported Sonnely v1 receipt",
  );
  expect(await verifyReceiptEvidence(modelReceipt)).toBe("signature_matched");
  expect(await verifyReceiptEvidence(gatewayReceipt)).toBe("signature_matched");
  expect(await verifyReceiptEvidence({ ...modelReceipt, upstream_request_sha256: "a".repeat(64) })).toBe(
    "payload_mismatch",
  );
  expect(
    await verifyReceiptEvidence({
      ...modelReceipt,
      evidence: { ...modelReceipt.evidence, signing_address: "0".repeat(40) },
    }),
  ).toBe("invalid_signature");
});

test("receipt inspector compares files locally and labels provider-specific evidence", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const receipt = await nearFixture();
  await page.goto("/verify");
  const outgoing: string[] = [];
  page.on("request", (request) =>
    outgoing.push(decodeURIComponent(request.url()) + (request.postData() ?? "")),
  );
  await page
    .getByLabel("Paste receipt or response")
    .fill(JSON.stringify({ sonnely_receipt: receipt, sonnely_request_id: requestId }));
  await page.getByText("Compare exact upstream files", { exact: true }).click();
  await page.getByLabel("Upstream request body").setInputFiles({
    name: "request.json",
    mimeType: "application/json",
    buffer: Buffer.from(wireRequest),
  });
  await page.getByLabel("Upstream response body").setInputFiles({
    name: "response.json",
    mimeType: "application/json",
    buffer: Buffer.from(wireResponse.trimEnd()),
  });
  await page.getByRole("button", { name: "Inspect receipt", exact: true }).click();
  const result = page.getByRole("region", { name: "Inspection results" });
  await expect(result.getByText("Signed hashes and declared signer match")).toBeVisible();
  await expect(result.getByText("File matches the receipt hash", { exact: true })).toBeVisible();
  await expect(result.getByText("File does not match the receipt hash", { exact: true })).toBeVisible();
  await expect(result.getByRole("link", { name: requestId })).toHaveAttribute(
    "href",
    "/console/logs?request=" + requestId,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(outgoing.join("\n")).not.toContain(requestId);
  expect(outgoing.join("\n")).not.toContain("Private input");
  expect(outgoing.join("\n")).not.toContain(receipt.upstream_request_sha256);

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(result.getByText("Results appear after inspection.")).toBeVisible();
  await page.getByLabel("Or choose a receipt file").setInputFiles({
    name: "receipt.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(phala)),
  });
  await page.getByRole("button", { name: "Inspect receipt", exact: true }).click();
  await expect(result.getByText("Phala ACI payload match reported")).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByLabel("Paste receipt or response").fill(JSON.stringify(tinfoil));
  await page.getByRole("button", { name: "Inspect receipt", exact: true }).click();
  await expect(result.getByText("Tinfoil router verification reported")).toBeVisible();
});

test("Playground requests and downloads a receipt only after opt-in", async ({ page, request }) => {
  const catalog = (await (await request.get("/api/sonnely/v1/models")).json()) as {
    data: { id: string; routes: { provider: string }[] }[];
  };
  const routes = catalog.data.find((item) => item.id === model)?.routes.map((route) => route.provider) ?? [];
  test.skip(!routes.includes("near-ai"), "Requires the configured NEAR AI fixture route.");
  const withFallback = routes.includes("tinfoil");
  const fixture = withFallback ? tinfoil : await nearFixture();
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { wallet: fixtureWallet, name: "Receipt fixture", balance: 1_000_000 },
        inferenceEnabled: true,
      },
    }),
  );
  await page.route("**/api/sonnely/live**", (route) => route.fulfill({ status: 204 }));
  const sent: { receipt: string | null; payload: unknown }[] = [];
  await page.route("**/api/sonnely/chat", async (route) => {
    const requested = await route.request().headerValue(receiptHeader);
    sent.push({ receipt: requested, payload: route.request().postDataJSON() });
    const chunk = { choices: [{ delta: { content: requested ? "Receipt ready" : "Ordinary response" } }] };
    const receipt = requested
      ? "data: " + JSON.stringify({ choices: [], sonnely_receipt: fixture }) + "\n\n"
      : "";
    await route.fulfill({
      headers: {
        "content-type": "text/event-stream",
        "x-sonnely-request-id": requestId,
        "x-sonnely-provider": requested ? fixture.provider : "near-ai",
      },
      body: "data: " + JSON.stringify(chunk) + "\n\n" + receipt + "data: [DONE]\n\n",
    });
  });
  await page.goto("/console?model=" + encodeURIComponent(model));
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  const send = page.getByRole("button", { name: "Send message" });
  await input.fill("Hello");
  await send.click();
  await expect(page.getByText("Ordinary response", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download receipt" })).toHaveCount(0);

  if (withFallback) {
    await page.locator(".playground-route-trigger").click();
    const picker = page.getByRole("dialog", { name: "Choose a model" });
    await picker.getByLabel("First fallback").selectOption("tinfoil");
    await picker.getByRole("button", { name: "Use model" }).click();
  }
  await page.getByRole("checkbox", { name: "Include verification receipt" }).check();
  await input.fill("Inspect this");
  await send.click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download receipt" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("sonnely-receipt.json");
  const stream = await download.createReadStream();
  const bytes: Buffer[] = [];
  for await (const part of stream) bytes.push(part);
  expect(parseReceiptInput(Buffer.concat(bytes).toString())).toEqual({ receipt: fixture, requestId });
  expect(sent.map((request) => request.receipt)).toEqual([null, "v1"]);
  if (withFallback) {
    expect(sent[1]?.payload).toMatchObject({
      provider: { only: ["near-ai", "tinfoil"], allow_fallbacks: true },
    });
    await expect(page.getByRole("region", { name: "Messages" })).toContainText("Tinfoil");
  }
  await expect(page.getByRole("link", { name: "Inspect receipt", exact: true })).toHaveAttribute(
    "href",
    "/verify",
  );
});
