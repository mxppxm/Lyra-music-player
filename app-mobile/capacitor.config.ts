import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.daoyu.lyra",
  appName: "Lyra",
  webDir: "dist",
  ios: {
    backgroundColor: "#faf8f5",
    // The page manages safe areas itself via env(safe-area-inset-*) — let the
    // ambient background paint edge to edge (notch + home indicator).
    contentInset: "never",
  },
  plugins: {},
};

export default config;
