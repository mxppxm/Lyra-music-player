import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the macOS background-playback fix: with the default policy,
// WKWebView throttles and eventually suspends a hidden window's JS tasks
// (including the audio-complete → next-song chain), so auto-advance stops
// while the app is in the background. macOS 14+ only; no-op elsewhere.
describe("tauri.conf.json", () => {
  it("disables webview background throttling so auto-advance keeps working in the background", () => {
    const confPath = join(process.cwd(), "src-tauri", "tauri.conf.json");
    const conf = JSON.parse(readFileSync(confPath, "utf8")) as {
      app: { windows: { backgroundThrottling?: string }[] };
    };
    for (const win of conf.app.windows) {
      expect(win.backgroundThrottling).toBe("disabled");
    }
  });
});
