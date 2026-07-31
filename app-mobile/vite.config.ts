import { defineConfig } from "vite";
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
});
