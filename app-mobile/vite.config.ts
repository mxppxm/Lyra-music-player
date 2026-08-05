import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    __LYRA_BUILD_TIME__: JSON.stringify(
      (() => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
          now.getHours(),
        )}${pad(now.getMinutes())}`;
      })(),
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
