// daily/PlaySessionTracker.ts — 内存跟踪一次播放，结束时落库

import {
  finalizePlaySession,
  insertPlaySession,
} from "../db/repo/playSessionsRepo";
import { dayKey } from "./dayKey";
import { trackActivity } from "./trackActivity";

export type PlaySource =
  | "user_input"
  | "lyra_start"
  | "auto_advance"
  | "song_intent"
  | "history_replay"
  | "previous"
  | "track_lock_loop"
  | "unknown";

export type StartPlaySessionOpts = {
  songId: string;
  turnId?: string | null;
  source: PlaySource;
  durationMs?: number | null;
  underTrackLock?: boolean;
  lockPlayCount?: number | null;
  consecutiveRepeatIndex?: number;
  now?: number;
  idGen?: () => string;
};

type LiveSession = {
  id: string;
  songId: string;
  turnId: string | null;
  source: PlaySource;
  startedAt: number;
  underTrackLock: boolean;
  lockPlayCount: number | null;
  listenAccMs: number;
  pauseAccMs: number;
  pausedAt: number | null;
  maxPositionMs: number;
  seekCount: number;
  wasBackgroundMs: number;
  backgroundSince: number | null;
  lyricsOpenCount: number;
  lastTickAt: number;
};

/**
 * Tracks the in-flight play session. One active session at a time (app is
 * single-player). Side-effect writes never throw to Orchestrator.
 */
export class PlaySessionTracker {
  private live: LiveSession | null = null;
  private lastEndedSongId: string | null = null;
  private lastEndedAt = 0;

  get activeSessionId(): string | null {
    return this.live?.id ?? null;
  }

  async start(opts: StartPlaySessionOpts): Promise<string | null> {
    try {
      if (this.live) {
        await this.end("replaced", opts.now);
      }
      const now = opts.now ?? Date.now();
      const id =
        opts.idGen?.() ??
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `ps-${now}`);
      let consecutive = opts.consecutiveRepeatIndex ?? 1;
      if (
        consecutive === 1 &&
        this.lastEndedSongId === opts.songId &&
        now - this.lastEndedAt <= 30_000
      ) {
        consecutive = 2; // caller may refine; best-effort
      }
      this.live = {
        id,
        songId: opts.songId,
        turnId: opts.turnId ?? null,
        source: opts.source,
        startedAt: now,
        underTrackLock: Boolean(opts.underTrackLock),
        lockPlayCount: opts.lockPlayCount ?? null,
        listenAccMs: 0,
        pauseAccMs: 0,
        pausedAt: null,
        maxPositionMs: 0,
        seekCount: 0,
        wasBackgroundMs: 0,
        backgroundSince: null,
        lyricsOpenCount: 0,
        lastTickAt: now,
      };
      await insertPlaySession({
        id,
        dayKey: dayKey(new Date(now)),
        songId: opts.songId,
        turnId: opts.turnId,
        source: opts.source,
        startedAt: now,
        durationMs: opts.durationMs,
        underTrackLock: opts.underTrackLock,
        lockPlayCount: opts.lockPlayCount,
        consecutiveRepeatIndex: consecutive,
      });
      void trackActivity({
        name: "play_start",
        songId: opts.songId,
        turnId: opts.turnId,
        props: {
          source: opts.source,
          session_id: id,
          under_track_lock: Boolean(opts.underTrackLock),
          lock_play_count: opts.lockPlayCount ?? null,
        },
        now,
      });
      return id;
    } catch (err) {
      console.warn("[lyra] PlaySessionTracker.start failed:", err);
      this.live = null;
      return null;
    }
  }

  noteProgress(positionMs: number, now = Date.now()): void {
    const s = this.live;
    if (!s || s.pausedAt !== null) return;
    const delta = Math.max(0, now - s.lastTickAt);
    s.listenAccMs += delta;
    s.lastTickAt = now;
    s.maxPositionMs = Math.max(s.maxPositionMs, positionMs);
  }

  notePause(now = Date.now()): void {
    const s = this.live;
    if (!s || s.pausedAt !== null) return;
    const delta = Math.max(0, now - s.lastTickAt);
    s.listenAccMs += delta;
    s.pausedAt = now;
    s.lastTickAt = now;
  }

  noteResume(now = Date.now()): void {
    const s = this.live;
    if (!s || s.pausedAt === null) return;
    s.pauseAccMs += Math.max(0, now - s.pausedAt);
    s.pausedAt = null;
    s.lastTickAt = now;
  }

  noteSeek(fromMs: number, toMs: number): void {
    const s = this.live;
    if (!s) return;
    s.seekCount += 1;
    s.maxPositionMs = Math.max(s.maxPositionMs, toMs, fromMs);
  }

  noteBackground(now = Date.now()): void {
    const s = this.live;
    if (!s || s.backgroundSince !== null) return;
    s.backgroundSince = now;
  }

  noteForeground(now = Date.now()): void {
    const s = this.live;
    if (!s || s.backgroundSince === null) return;
    s.wasBackgroundMs += Math.max(0, now - s.backgroundSince);
    s.backgroundSince = null;
  }

  noteLyricsOpen(): void {
    if (this.live) this.live.lyricsOpenCount += 1;
  }

  async end(
    reason: string,
    now = Date.now(),
  ): Promise<{ sessionId: string; listenMs: number } | null> {
    const s = this.live;
    if (!s) return null;
    try {
      if (s.pausedAt !== null) {
        s.pauseAccMs += Math.max(0, now - s.pausedAt);
        s.pausedAt = null;
      } else {
        s.listenAccMs += Math.max(0, now - s.lastTickAt);
      }
      if (s.backgroundSince !== null) {
        s.wasBackgroundMs += Math.max(0, now - s.backgroundSince);
        s.backgroundSince = null;
      }
      await finalizePlaySession({
        id: s.id,
        endedAt: now,
        listenMs: s.listenAccMs,
        pauseMs: s.pauseAccMs,
        endReason: reason,
        maxPositionMs: s.maxPositionMs,
        seekCount: s.seekCount,
        wasBackgroundMs: s.wasBackgroundMs,
        lyricsOpenCount: s.lyricsOpenCount,
      });
      const eventName =
        reason === "completed"
          ? "play_complete"
          : reason === "skipped"
            ? "play_skip"
            : "play_replaced";
      void trackActivity({
        name: eventName,
        songId: s.songId,
        turnId: s.turnId,
        props: {
          session_id: s.id,
          listen_ms: s.listenAccMs,
          end_reason: reason,
          under_track_lock: s.underTrackLock,
          lock_play_count: s.lockPlayCount,
        },
        now,
      });
      this.lastEndedSongId = s.songId;
      this.lastEndedAt = now;
      const out = { sessionId: s.id, listenMs: s.listenAccMs };
      this.live = null;
      return out;
    } catch (err) {
      console.warn("[lyra] PlaySessionTracker.end failed:", err);
      this.live = null;
      return null;
    }
  }
}

/** Process-wide tracker for the mobile/desktop single player. */
export const playSessionTracker = new PlaySessionTracker();
