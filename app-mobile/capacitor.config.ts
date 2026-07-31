import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.daoyu.lyra",
  appName: "Lyra",
  webDir: "dist",
  ios: {
    backgroundColor: "#faf8f5",
    contentInset: "automatic",
  },
  plugins: {},
};

export default config;
