import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Start playback of `path` (local file) or a remote URL.
 *
 * - Local paths → Tauri `audio_play` (rodio from file)
 * - HTTP URLs → Tauri `audio_play_url` (reqwest download → rodio)
 *
 * `durationMs` is optional but strongly recommended: when supplied, the
 * Rust side arms a duration-based safety net so auto-advance still fires
 * on tracks where rodio's Sink::empty() never flips.
 */
export async function playFile(
  path: string,
  durationMs?: number | null,
): Promise<number> {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return await invoke<number>("audio_play_url", {
      url: path,
      durationMs: durationMs ?? null,
    });
  }
  return await invoke<number>("audio_play", {
    path,
    durationMs: durationMs ?? null,
  });
}

export async function stopPlayback(): Promise<void> {
  await invoke("audio_stop");
}

export async function pausePlayback(): Promise<void> {
  await invoke("audio_pause");
}

export async function resumePlayback(): Promise<void> {
  await invoke("audio_resume");
}

export async function isPlaying(): Promise<boolean> {
  return await invoke<boolean>("audio_is_playing");
}

/** Returns `[elapsed_ms, total_duration_ms]` or `null` if idle. */
export async function getPlaybackPosition(): Promise<[number, number] | null> {
  return await invoke<[number, number] | null>("audio_get_position");
}

/**
 * Subscribe to natural song-completion events from the Rust audio thread.
 * The callback receives the playback id that finished. Returns an
 * unsubscribe function.
 */
export async function onSongComplete(
  cb: (playbackId: number) => void,
): Promise<UnlistenFn> {
  return await listen<number>("audio-complete", (event) => cb(event.payload));
}
