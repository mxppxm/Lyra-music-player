import { defineConfig } from "vitest/config";
import path from "path";

const root = "/Users/mico/clacky_workspace/Lyra-music-player";

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@lyra/core": path.resolve(root, "packages/core/src"),
      "@lyra/platform": path.resolve(root, "packages/platform/src"),
      "@lyra/platform-desktop": path.resolve(root, "packages/platform-desktop/src"),
      "@lyra/platform-ios": path.resolve(root, "packages/platform-ios/src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["packages/core/src/**/*.test.ts"],
  },
});
