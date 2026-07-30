import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@lyra/core": path.resolve(__dirname, "../packages/core/src"),
      "@lyra/platform": path.resolve(__dirname, "../packages/platform/src"),
      "@lyra/platform-desktop": path.resolve(
        __dirname,
        "../packages/platform-desktop/src",
      ),
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
  },
});
