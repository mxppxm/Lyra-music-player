/**
 * Thin wrapper around @tauri-apps/plugin-notification.
 *
 * Handles permission request lazily on first send.
 * Spec §4.4: title "Lyra", body "💬 我想给你放一首" — no song name.
 */
export async function sendLyraProactiveNotification(): Promise<void> {
  const { sendNotification, isPermissionGranted, requestPermission } =
    await import("@tauri-apps/plugin-notification");

  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === "granted";
  }

  if (!granted) return;

  sendNotification({ title: "Lyra", body: "💬 我想给你放一首" });
}
