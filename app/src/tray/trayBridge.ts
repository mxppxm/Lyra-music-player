import { invoke } from "@tauri-apps/api/core";

/**
 * Ask the Rust tray controller to start or stop the breathing animation.
 *
 * Idempotent: calling setBreathing(true) while already breathing is a no-op
 * on the Rust side; same for setBreathing(false).
 */
export async function setBreathing(on: boolean): Promise<void> {
  await invoke("tray_set_breathing", { on });
}
