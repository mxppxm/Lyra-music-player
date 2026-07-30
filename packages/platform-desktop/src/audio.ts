import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LyraPlatform } from "@lyra/platform";

export const desktopAudio: Pick<
  LyraPlatform,
  | "playUrl"
  | "playFile"
  | "stop"
  | "pause"
  | "resume"
  | "isPlaying"
  | "getPosition"
  | "onComplete"
> = {
  async playUrl(url, durationMs) {
    return invoke<number>("audio_play_url", {
      url,
      durationMs: durationMs ?? null,
    });
  },
  async playFile(path, durationMs) {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return desktopAudio.playUrl(path, durationMs);
    }
    return invoke<number>("audio_play", {
      path,
      durationMs: durationMs ?? null,
    });
  },
  stop: () => invoke("audio_stop"),
  pause: () => invoke("audio_pause"),
  resume: () => invoke("audio_resume"),
  isPlaying: () => invoke<boolean>("audio_is_playing"),
  getPosition: () => invoke<[number, number] | null>("audio_get_position"),
  onComplete(cb) {
    let unlisten: UnlistenFn | null = null;
    listen<number>("audio-complete", (e) => cb(e.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  },
};
