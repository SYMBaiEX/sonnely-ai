import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: process.env.RELAY_TEST_URL ?? "http://127.0.0.1:3037" },
});
