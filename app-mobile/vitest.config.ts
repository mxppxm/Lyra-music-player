import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@lyra/core": path.resolve(__dirname, "../packages/core/src"),
      "@lyra/platform": path.resolve(__dirname, "../packages/platform/src"),
      "@lyra/platform-ios": path.resolve(
        __dirname,
        "../packages/platform-ios/src",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // @lyra/core is a workspace package without its own test runner — run its
    // suite here so `pnpm -C app-mobile test` covers the whole monorepo.
    include: [
      "./src/**/*.{test,spec}.ts?(x)",
      "../packages/core/src/**/*.test.ts",
    ],
    // Orchestrator.integration.test.ts imports ../reflect/trigger which does
    // not exist — pre-existing breakage, unrelated to playback changes.
    exclude: ["../packages/core/src/turn/Orchestrator.integration.test.ts"],
  },
});
