import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jiuri.lyra",
  appName: "Lyra",
  webDir: "dist",
  // Serve the WebView from https://localhost (secure context) instead of the
  // default capacitor://localhost — required for Web APIs such as
  // navigator.share / clipboard to work on iOS.
  server: {
    iosScheme: "https",
  },
  ios: {
    backgroundColor: "#faf8f5",
    // The page manages safe areas itself via env(safe-area-inset-*) — let the
    // ambient background paint edge to edge (notch + home indicator).
    contentInset: "never",
  },
  plugins: {},
};

export default config;
