import { LyraAudio } from "./nativeAudio.ts";
import type { LyraPlatform } from "@lyra/platform";

/** iOS ATS blocks plain-HTTP streams; bilibili CDN mirrors all serve HTTPS. */
const toHttps = (url: string): string => url.replace(/^http:\/\//i, "https://");

export const iosAudio: Pick<
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
    await iosAudio.stop();
    const { playbackId } = await LyraAudio.playUrl({
      url: toHttps(url),
      durationMs: durationMs ?? 0,
    });
    return playbackId;
  },
  async playFile(path, durationMs) {
    return iosAudio.playUrl(path, durationMs);
  },
  async stop() {
    await LyraAudio.stop();
  },
  async pause() {
    await LyraAudio.pause();
  },
  async resume() {
    await LyraAudio.resume();
  },
  async isPlaying() {
    const { isPlaying } = await LyraAudio.isPlaying();
    return isPlaying;
  },
  async getPosition(): Promise<[number, number] | null> {
    const { elapsedMs, durationMs } = await LyraAudio.getPosition();
    if (elapsedMs === null || durationMs === null) return null;
    return [elapsedMs, durationMs];
  },
  onComplete(cb) {
    let remove: (() => void) | null = null;
    void LyraAudio.addListener("ended", (data) => {
      cb(data.playbackId);
    }).then((r) => {
      remove = r.remove;
    });
    return () => {
      remove?.();
    };
  },
};
