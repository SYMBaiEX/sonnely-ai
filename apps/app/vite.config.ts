import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import vibelang from "vibelang-vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  plugins: [vibelang(), react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:3010" } },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
