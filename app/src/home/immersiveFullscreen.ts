/**
 * Best-effort fullscreen toggle for immersive playback.
 * No-ops outside Tauri (vitest / browser preview).
 */
export async function setImmersiveFullscreen(on: boolean): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const currently = await win.isFullscreen();
    if (currently === on) return;
    await win.setFullscreen(on);
  } catch {
    /* window API unavailable or permission denied — ignore */
  }
}
