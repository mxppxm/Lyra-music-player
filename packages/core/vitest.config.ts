import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@lyra/platform": path.resolve(__dirname, "../platform/src"),
      "@lyra/platform-desktop": path.resolve(__dirname, "../platform-desktop/src"),
      "@lyra/platform-ios": path.resolve(__dirname, "../platform-ios/src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
  },
});
