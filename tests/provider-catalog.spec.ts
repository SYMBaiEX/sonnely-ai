import { expect, test } from "@playwright/test";
import { apiBasePath } from "../lib/api-contract";

type ProviderCatalogResponse = {
  providers: Record<
    string,
    { id: string; chatId?: string | null; pricing?: { input?: number; output?: number } }[]
  >;
  active_providers: string[];
  specializedModels: Record<string, Record<string, { provider: string }>>;
  realtimeModel: { id: string; provider: string };
};

type ChatCatalogResponse = {
  data: { id: string; routes: { provider: string; upstream_model: string }[] }[];
};

test("the public and workspace model catalogs include every provider model and Sonnely endpoint", async ({
  request,
  page,
}) => {
  const [providerResponse, chatResponse] = await Promise.all([
    request.get(apiBasePath + "/provider-models"),
    request.get(apiBasePath + "/models"),
  ]);
  expect(providerResponse.ok()).toBe(true);
  expect(chatResponse.ok()).toBe(true);
  const catalog: ProviderCatalogResponse = await providerResponse.json();
  const chat: ChatCatalogResponse = await chatResponse.json();
  expect(Object.keys(catalog.providers)).toEqual(["near-ai", "phala", "tinfoil"]);

  const specialized = Object.entries(catalog.specializedModels).flatMap(([endpoint, routes]) =>
    Object.entries(routes).map(([model, { provider }]) => ({ endpoint, model, provider })),
  );
  specialized.push({
    endpoint: "realtime",
    model: catalog.realtimeModel.id,
    provider: catalog.realtimeModel.provider,
  });
  const expectedRows = Object.entries(catalog.providers).flatMap(([provider, entries]) =>
    entries.map((entry) => {
      const routes = specialized
        .filter(
          (route) =>
            route.provider === provider && (route.model === entry.id || route.model === entry.chatId),
        )
        .map(({ endpoint, model }) => endpoint + " " + model);
      if (entry.chatId && entry.pricing?.input !== undefined && entry.pricing.output !== undefined)
        routes.push("chat/completions " + entry.chatId);
      const active = catalog.active_providers.includes(provider);
      const status = routes.length === 0 ? "Provider catalog only" : active ? "" : "Unavailable";
      return {
        provider,
        upstreamModel: entry.id,
        routes: routes.sort(),
        status,
      };
    }),
  );
  for (const route of specialized) {
    expect(
      expectedRows.some(
        ({ provider, routes }) =>
          provider === route.provider && routes.includes(route.endpoint + " " + route.model),
      ),
    ).toBe(true);
  }
  expect(
    expectedRows
      .filter(({ provider }) => catalog.active_providers.includes(provider))
      .flatMap(({ provider, upstreamModel, routes }) =>
        routes
          .filter((route) => route.startsWith("chat/completions "))
          .map((route) => [provider, upstreamModel, route.slice("chat/completions ".length)].join(" ")),
      )
      .sort(),
  ).toEqual(
    chat.data
      .flatMap(({ id, routes }) =>
        routes.map(({ provider, upstream_model }) => [provider, upstream_model, id].join(" ")),
      )
      .sort(),
  );

  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ["/models", "/console/models"]) {
    await page.goto(path);
    const table = page.getByRole("table", { name: "Model rates and context" });
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(expectedRows.length);
    const rendered = await rows.evaluateAll((tableRows) =>
      tableRows.map((row) => ({
        provider: row.getAttribute("data-provider"),
        upstreamModel: row.getAttribute("data-upstream-model"),
        routes: Array.from(
          row.querySelectorAll("[data-endpoint]"),
          (route) => route.getAttribute("data-endpoint") + " " + route.getAttribute("data-model-id"),
        ).sort(),
        status: row.querySelector(".catalog-availability")?.textContent ?? "",
      })),
    );
    const byModel = (row: { provider: string | null; upstreamModel: string | null }) =>
      row.provider + "/" + row.upstreamModel;
    expect(rendered.sort((a, b) => byModel(a).localeCompare(byModel(b)))).toEqual(
      [...expectedRows].sort((a, b) => byModel(a).localeCompare(byModel(b))),
    );
    const flux = rows.filter({
      has: page.locator('[data-model-id="black-forest-labs/FLUX.2-klein-4B"]'),
    });
    for (const endpoint of ["images/generations", "images/edits"]) {
      await expect(flux.locator('[data-endpoint="' + endpoint + '"]')).toContainText(/\$[\d.]+ per request/);
    }
    await expect(table.locator('[data-endpoint="realtime"]')).toContainText(/\$[\d.]+ per session/);
    const redaction = table.locator('[data-endpoint="redact"]');
    await expect(redaction).toContainText(/\$[\d.]+ input \/ 1M tokens/);
    await expect(redaction).toContainText(/\$[\d.]+ per request/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

    const providerFilter = page.getByRole("combobox", { name: "Provider", exact: true });
    const workloadFilter = page.getByRole("combobox", { name: "Workload", exact: true });
    const availabilityFilter = page.getByRole("combobox", { name: "Availability", exact: true });
    const search = page.getByRole("searchbox", { name: "Find a model", exact: true });
    await availabilityFilter.selectOption("available");
    await expect(rows).toHaveCount(expectedRows.filter(({ status }) => status === "").length);
    await availabilityFilter.selectOption("catalog");
    await expect(rows).toHaveCount(
      expectedRows.filter(({ status }) => status === "Provider catalog only").length,
    );
    await availabilityFilter.selectOption("all");
    await providerFilter.selectOption("tinfoil");
    await workloadFilter.selectOption("embeddings");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-upstream-model", "nomic-embed-text");
    await search.fill("does not match a model");
    await expect(page.getByText("No models match your filters.", { exact: true })).toBeVisible();
  }
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

test("discovery endpoints advertise and enforce their supported protocols", async ({ request }) => {
  const headers = { Authorization: "Bearer sonnely_live_" + "x".repeat(43) };
  const endpoint = (name: string) => apiBasePath + "/" + name;
  expect((await request.get(endpoint("realtime"))).status()).toBe(401);
  expect((await request.get(endpoint("realtime"), { headers })).status()).toBe(426);
  expect(
    (
      await request.post(endpoint("responses"), {
        headers,
        data: { model: "tinfoil/inkling-2-small", input: "Hello", store: true },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(endpoint("redact"), {
        headers,
        data: { model: "pii-filter", text: "a".repeat(4097) },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(endpoint("audio/translations"), {
        headers,
        multipart: {
          model: "voxtral-small-24b",
          file: {
            name: "input.wav",
            mimeType: "audio/wav",
            buffer: Buffer.alloc(48),
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(endpoint("convert/file"), {
        headers,
        multipart: {
          model: "doc-upload",
          files: {
            name: "input.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("invalid contents"),
          },
        },
      })
    ).status(),
  ).toBe(400);
  const openapi = await (await request.get("/api/openapi")).json();
  expect(openapi.paths["/realtime"].get.responses["101"]).toBeDefined();
  expect(openapi.paths["/convert/file"].post.requestBody.content["multipart/form-data"]).toBeDefined();
});
