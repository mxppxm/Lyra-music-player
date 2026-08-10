/**
 * Native AVPlayer is the source of truth for "what is audibly playing".
 * After background suspend, JS may lag by several tracks — reconcile to the
 * current native song in one step instead of replaying every intermediate.
 */

export function pickNativeReconcileSongId(
  currentNativeSongId: string | null | undefined,
  drainedEvents: ReadonlyArray<{ songId?: string | null }>,
): string | null {
  const fromNative = currentNativeSongId?.trim();
  if (fromNative) return fromNative;

  for (let i = drainedEvents.length - 1; i >= 0; i--) {
    const id = drainedEvents[i]?.songId;
    if (typeof id === "string" && id.trim().length > 0) return id.trim();
  }
  return null;
}
