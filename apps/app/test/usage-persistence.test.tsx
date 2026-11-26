// spec/app/usage.md, "Rows are never removed and settled rows never change"
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import * as Usage from "../gen/app__usage.effect.vibe";
import { store } from "../src/serve.vibe";
import { mkdtempSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const wallet = "w1";
const pad = "x".repeat(2000);

function recordEvent(ref: string) {
  return {
    type: "record" as const,
    id: ref,
    time: 1000,
    keyName: pad,
    keyId: "",
    project: "",
    model: "deepseek-ai/DeepSeek-V4.1",
    provider: "NearAI" as const,
    cost: 100,
  };
}

function usageLayer(dir: string) {
  return Layer.provide(Usage.stored("usage"), store(dir));
}

function writeRow(layer: Layer.Layer<Usage.Machine, unknown>, ref: string) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const usage = yield* Usage.Machine;
      yield* usage.send(recordEvent(ref), wallet);
    }).pipe(Effect.provide(layer), Effect.catch(() => Effect.void)),
  );
}

describe("usage machine persistence", () => {
  // spec/app/usage.md, "Story: Meter a request"
  it("keeps rows across a machine reload from the same volume", async () => {
    const dir = mkdtempSync(join(tmpdir(), "usage-restart-"));
    const layer = usageLayer(dir);
    await writeRow(layer, "restart-1");
    const read = await Effect.runPromise(
      Effect.gen(function* () {
        const usage = yield* Usage.Machine;
        return yield* usage.get();
      }).pipe(Effect.provide(usageLayer(dir))),
    );
    expect(read.rows.map((row) => row.id)).toEqual(["restart-1"]);
  });

  // spec/app/usage.md, "Rows are never removed and settled rows never change"
  it("never corrupts the stored state when two writers send at the same instant", async () => {
    const dir = mkdtempSync(join(tmpdir(), "usage-race-"));
    const writer = fileURLToPath(new URL("./usage-store-writer.ts", import.meta.url));
    const run = (id: number) => {
      const child = spawn(process.execPath, [writer, dir, String(id), "80"], { stdio: "ignore" });
      return new Promise<number>((resolve, reject) => {
        child.on("exit", (code) => resolve(code ?? 1));
        child.on("error", reject);
      });
    };
    const exits = await Promise.all([run(1), run(2)]);
    expect(exits).toEqual([0, 0]);
    const content = readFileSync(join(dir, "usage"), "utf8");
    const parsed = JSON.parse(content) as { rows: unknown[] };
    expect(parsed.rows.length).toBeGreaterThan(0);
  }, 60_000);
});
