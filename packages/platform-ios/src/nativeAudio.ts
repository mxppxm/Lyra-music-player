import { registerPlugin } from "@capacitor/core";

export interface LyraAudioPlugin {
  playUrl(options: {
    url: string;
    durationMs?: number;
  }): Promise<{ playbackId: number; durationMs: number }>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isPlaying(): Promise<{ isPlaying: boolean }>;
  getPosition(): Promise<{ elapsedMs: number | null; durationMs: number | null }>;
  addListener(
    eventName: "ended",
    listenerFunc: (data: { playbackId: number }) => void,
  ): Promise<{ remove: () => void }>;
}

export const LyraAudio = registerPlugin<LyraAudioPlugin>("LyraAudio");
