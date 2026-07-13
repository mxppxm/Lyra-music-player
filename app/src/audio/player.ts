import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Start playback of `path`. Resolves with a monotonically increasing
 * playback id. Rust emits an `"audio-complete"` event with this id when
 * the song ends naturally. Use `onSongComplete` to subscribe.
 *
 * `durationMs` is optional but strongly recommended: when supplied, the
 * Rust side arms a duration-based safety net so auto-advance still fires
 * on tracks where rodio's Sink::empty() never flips (a known symphonia
 * quirk on some MP3 tails). Passing null skips the safety net.
 */
export async function playFile(
  path: string,
  durationMs?: number | null,
): Promise<number> {
  return await invoke<number>("audio_play", {
    path,
    durationMs: durationMs ?? null,
  });
}

export async function stopPlayback(): Promise<void> {
  await invoke("audio_stop");
}

export async function isPlaying(): Promise<boolean> {
  return await invoke<boolean>("audio_is_playing");
}

/**
 * Subscribe to natural song-completion events from the Rust audio thread.
 * The callback receives the playback id that finished. Returns an
 * unsubscribe function.
 *
 * Rust does NOT emit this event when `stopPlayback` is called manually or
 * when a subsequent `playFile` supersedes the current song — only natural
 * drain of the rodio sink triggers it.
 */
export async function onSongComplete(
  cb: (playbackId: number) => void,
): Promise<UnlistenFn> {
  return await listen<number>("audio-complete", (event) => cb(event.payload));
}
