import { registerPlugin } from "@capacitor/core";

export type RemoteCommand = "play" | "pause" | "toggle" | "next" | "previous";

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
  /** Publish track metadata to the lock screen / Dynamic Island surfaces. */
  setNowPlaying(options: {
    title: string;
    artist: string;
    durationMs?: number;
  }): Promise<void>;
  addListener(
    eventName: "ended",
    listenerFunc: (data: { playbackId: number }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "remoteCommand",
    listenerFunc: (data: { command: RemoteCommand }) => void,
  ): Promise<{ remove: () => void }>;
}

export const LyraAudio = registerPlugin<LyraAudioPlugin>("LyraAudio");
