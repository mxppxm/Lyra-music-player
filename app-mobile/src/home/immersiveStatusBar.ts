import { registerPlugin } from "@capacitor/core";

type LyraUIPlugin = {
  setImmersive(options: { on: boolean }): Promise<void>;
};

const LyraUI = registerPlugin<LyraUIPlugin>("LyraUI");

/** Hide / show the iOS status bar during immersive playback. Best-effort. */
export async function setImmersiveStatusBar(on: boolean): Promise<void> {
  try {
    await LyraUI.setImmersive({ on });
  } catch {
    /* plugin unavailable in browser / tests */
  }
}
