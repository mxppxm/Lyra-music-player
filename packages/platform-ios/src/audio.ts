import { AudioPlayer } from "@mediagrid/capacitor-native-audio";
import type { LyraPlatform } from "@lyra/platform";

let nextId = 1;
let currentId: number | null = null;
let currentAudioId: string | null = null;

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
  async playUrl(url, _durationMs) {
    const id = nextId++;
    const audioId = `lyra-${id}`;
    await AudioPlayer.create({
      audioId,
      audioSource: url,
      friendlyTitle: "Lyra",
      useForNotification: true,
      isBackgroundMusic: true,
    });
    await AudioPlayer.play({ audioId });
    currentId = id;
    currentAudioId = audioId;
    return id;
  },
  async playFile(path, durationMs) {
    return iosAudio.playUrl(path, durationMs);
  },
  async stop() {
    if (currentAudioId) {
      try {
        await AudioPlayer.stop({ audioId: currentAudioId });
        await AudioPlayer.destroy({ audioId: currentAudioId });
      } catch {
        /* already gone */
      }
    }
    currentId = null;
    currentAudioId = null;
  },
  async pause() {
    if (currentAudioId) {
      await AudioPlayer.pause({ audioId: currentAudioId });
    }
  },
  async resume() {
    if (currentAudioId) {
      await AudioPlayer.play({ audioId: currentAudioId });
    }
  },
  async isPlaying() {
    if (!currentAudioId) return false;
    try {
      const { isPlaying } = await AudioPlayer.isPlaying({
        audioId: currentAudioId,
      });
      return isPlaying;
    } catch {
      return false;
    }
  },
  async getPosition(): Promise<[number, number] | null> {
    if (!currentAudioId) return null;
    try {
      const { currentTime } = await AudioPlayer.getCurrentTime({
        audioId: currentAudioId,
      });
      return [Math.round(currentTime * 1000), 0];
    } catch {
      return null;
    }
  },
  onComplete(cb) {
    if (!currentAudioId) return () => {};
    const audioId = currentAudioId;
    const handler = () => {
      if (currentId !== null) cb(currentId);
    };
    void AudioPlayer.onAudioEnd({ audioId }, handler);
    return () => {
      /* plugin v3 lacks listener removal; leak acceptable for MVP */
    };
  },
};
