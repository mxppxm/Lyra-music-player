/**
 * Ask the Rust tray controller to start or stop the breathing animation.
 *
 * Idempotent: calling setBreathing(true) while already breathing is a no-op
 * on the Rust side; same for setBreathing(false).
 */
export async function setBreathing(_on: boolean): Promise<void> {
  /* desktop-only: tray breathing is not part of LyraPlatform contract */
}
