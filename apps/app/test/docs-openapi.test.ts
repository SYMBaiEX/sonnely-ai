import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { describe, expect, it } from "vitest";
import { docsApi } from "../src/api/docs.vibe";

function makeDocsApi() {
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const appLayer = docsApi.pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
  );
  return HttpRouter.toWebHandler(appLayer);
}

describe("GET /api/openapi", () => {
  // spec/app/docs/index.md, "Docs"
  it("serves the OpenAPI 3.1 document as JSON", async () => {
    const app = makeDocsApi();
    const response = await app.handler(new Request("http://localhost/api/openapi"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const document = (await response.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toContain("/api/sonnely/v1/chat/completions");
    expect(Object.keys(document.paths)).toContain("/api/sonnely/v1/models");
    expect(Object.keys(document.paths)).toContain("/api/sonnely/batch");
    expect(document.components.schemas).toHaveProperty("ChatCompletionRequest");
    await app.dispose();
  });
});
