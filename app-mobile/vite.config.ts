import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    __LYRA_BUILD_TIME__: JSON.stringify(
      new Date().toLocaleString("sv-SE").slice(0, 16),
    ),
  },
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
});
