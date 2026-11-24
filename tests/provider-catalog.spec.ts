import { expect, test } from "@playwright/test";
import { apiBasePath } from "../lib/api-contract";

test("all upstream inventories are discoverable with separate execution mappings", async ({
  request,
  page,
}) => {
  const response = await request.get(apiBasePath + "/provider-models");
  expect(response.ok()).toBe(true);
  const catalog = await response.json();
  expect(Object.keys(catalog.providers)).toEqual(["near-ai", "phala", "tinfoil"]);
  expect(catalog.providers["near-ai"].map(({ id }: { id: string }) => id)).toContain(
    "anthropic/claude-fable-5",
  );
  expect(catalog.providers.phala.map(({ id }: { id: string }) => id)).toContain("qwen/qwen3-asr-1.7b");
  expect(catalog.providers.tinfoil.map(({ id }: { id: string }) => id)).toContain("nomic-embed-text");
  expect(catalog.specializedModels.embeddings["nomic-embed-text"].provider).toBe("tinfoil");

  const models = await (await request.get(apiBasePath + "/models")).json();
  const modelIds = models.data.map(({ id }: { id: string }) => id);
  expect(modelIds).toContain("tinfoil/inkling-2-small");
  expect(modelIds).not.toContain("anthropic/claude-fable-5");
  expect(modelIds).not.toContain("Qwen/Qwen3-Reranker-0.6B");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/models");
  const inventory = page.getByRole("region", { name: "Full provider catalogs" });
  for (const name of ["NEAR AI", "Phala", "Tinfoil"]) {
    await inventory
      .locator("summary")
      .filter({ hasText: name + " ·" })
      .click();
  }
  await expect(inventory.getByText("nomic-embed-text", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("non-chat routes enforce auth and reject incompatible models or parameters", async ({ request }) => {
  const headers = { Authorization: "Bearer sonnely_live_" + "x".repeat(43) };
  for (const [endpoint, data] of [
    ["embeddings", { input: "text" }],
    ["rerank", { query: "query", documents: ["document"] }],
    ["images/generations", { prompt: "image prompt" }],
  ] as const) {
    const path = apiBasePath + "/" + endpoint;
    expect((await request.post(path, { data })).status()).toBe(401);
    expect((await request.post(path, { headers, data: { ...data, model: "constructor" } })).status()).toBe(
      404,
    );
  }

  const oversized = await request.post(apiBasePath + "/images/generations", {
    headers,
    data: { model: "black-forest-labs/FLUX.2-klein-4B", prompt: "image prompt", n: 2 },
  });
  expect(oversized.status()).toBe(400);
  const spec = await (await request.get("/api/openapi")).json();
  expect(Object.keys(spec.paths)).toEqual(
    expect.arrayContaining(["/provider-models", "/embeddings", "/rerank", "/images/generations"]),
  );
});

test("audio and decision endpoints validate formats before provider requests", async ({ request }) => {
  const headers = { Authorization: "Bearer sonnely_live_" + "x".repeat(43) };
  const speech = apiBasePath + "/audio/speech";
  const transcription = apiBasePath + "/audio/transcriptions";
  const edits = apiBasePath + "/images/edits";
  expect((await request.post(speech, { data: { model: "voxtral-tts", input: "Hello" } })).status()).toBe(401);
  expect(
    (
      await request.post(speech, {
        headers,
        data: { model: "voxtral-tts", input: "Hello", response_format: "mp3" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await request.post(transcription, { headers, data: { model: "whisper-large-v3-turbo" } })).status(),
  ).toBe(415);
  expect(
    (
      await request.post(edits, {
        headers,
        multipart: {
          model: "black-forest-labs/FLUX.2-klein-4B",
          prompt: "Add blue",
          image: {
            name: "input.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("not an image"),
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(apiBasePath + "/systemone", {
        headers,
        data: { model: "levanto/sage-2", state: "A short state", questions: {} },
      })
    ).status(),
  ).toBe(400);
  const spec = await (await request.get("/api/openapi")).json();
  expect(spec.paths["/audio/transcriptions"].post.requestBody.content["multipart/form-data"]).toBeDefined();
  expect(spec.paths["/audio/speech"].post.responses["200"].content["audio/wav"]).toBeDefined();
});
