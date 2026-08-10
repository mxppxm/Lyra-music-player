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
    coverUrl?: string;
    /** Library id — stamps native source-of-truth for resume reconcile. */
    songId?: string;
  }): Promise<void>;
  /** Clear a natural-completion the web layer has handled. */
  acknowledgeEnded(): Promise<void>;
  /** Returns a completion still waiting for JS (background suspend). */
  getPendingEnded(): Promise<{ playbackId: number | null }>;
  seek(options: { positionMs: number }): Promise<void>;
  /** Queue the next track for native seamless handoff (background auto-advance). */
  setNextTrack(options: {
    url: string;
    songId: string;
    title: string;
    artist: string;
    durationMs?: number;
    coverUrl?: string;
  }): Promise<{ count: number }>;
  clearNextTrack(): Promise<void>;
  appendToPlaybackQueue(options: {
    tracks: Array<{
      url: string;
      songId: string;
      title: string;
      artist: string;
      durationMs?: number;
      coverUrl?: string;
    }>;
  }): Promise<{ count: number; appended: number }>;
  getPlaybackQueueInfo(): Promise<{ count: number; songIds: string[] }>;
  drainNativeAdvanced(): Promise<{
    events: Array<{
      songId: string;
      playbackId: number;
      previousPlaybackId: number;
    }>;
  }>;
  /** What AVPlayer is audibly on — authoritative after background listening. */
  getCurrentTrack(): Promise<{
    songId: string | null;
    isPlaying: boolean;
    playbackId: number;
  }>;
  addListener(
    eventName: "ended",
    listenerFunc: (data: { playbackId: number }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "nativeAdvanced",
    listenerFunc: (data: {
      playbackId: number;
      songId: string;
      previousPlaybackId: number;
    }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "refillQueue",
    listenerFunc: (data: { remaining: number }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "failed",
    listenerFunc: (data: { playbackId: number; message: string }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "remoteCommand",
    listenerFunc: (data: { command: RemoteCommand }) => void,
  ): Promise<{ remove: () => void }>;
}

export const LyraAudio = registerPlugin<LyraAudioPlugin>("LyraAudio");
