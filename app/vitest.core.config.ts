import { defineConfig } from "vitest/config";
import path from "path";

// Temp config: run packages/core tests through app's installed vitest.
export default defineConfig({
  resolve: {
    alias: {
      "@lyra/core": path.resolve(__dirname, "../packages/core/src"),
      "@lyra/platform": path.resolve(__dirname, "../packages/platform/src"),
      "@lyra/platform-ios": path.resolve(__dirname, "../packages/platform-ios/src"),
      "@lyra/platform-desktop": path.resolve(
        __dirname,
        "../packages/platform-desktop/src",
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["../packages/core/src/**/*.test.ts"],
  },
});
