// daily/buildDailyDigest.ts — 纯规则聚合昨天数据

import type { ActivityEventRow } from "../db/repo/activityEventsRepo";
import type { PlaySessionRow } from "../db/repo/playSessionsRepo";

export type TrackDayStat = {
  songId: string;
  sessionCount: number;
  totalListenMs: number;
  maxListenMs: number;
  completedCount: number;
  skippedCount: number;
  lockToggleCount: number;
  lockLoopCount: number;
  maxLockPlayCount: number;
  lockListenMs: number;
};

export type DailyDigest = {
  dayKey: string;
  meta: {
    inputCount: number;
    lyraStartCount: number;
    songIntentHits: number;
    songIntentMisses: number;
    trackLockOnCount: number;
    firstTs: number | null;
    lastTs: number | null;
  };
  listening: {
    playStarts: number;
    uniqueSongs: number;
    totalListenMs: number;
    completes: number;
    skips: number;
    tracks: TrackDayStat[];
  };
  trackLock: {
    onCount: number;
    loopCount: number;
    maxPlayCount: number;
    songs: Array<{ songId: string; maxPlayCount: number; lockListenMs: number }>;
  };
  lyrics: { openCount: number };
  library: { favoriteAdds: number; historyOpens: number; historyReplays: number };
  eventCount: number;
  sessionCount: number;
  sparse: boolean;
};

function propsOf(e: ActivityEventRow): Record<string, unknown> {
  try {
    return JSON.parse(e.props_json || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function buildDailyDigest(input: {
  dayKey: string;
  events: ActivityEventRow[];
  sessions: PlaySessionRow[];
}): DailyDigest {
  const { dayKey, events, sessions } = input;
  const count = (name: string) => events.filter((e) => e.name === name).length;

  const bySong = new Map<string, TrackDayStat>();
  const ensure = (songId: string): TrackDayStat => {
    let t = bySong.get(songId);
    if (!t) {
      t = {
        songId,
        sessionCount: 0,
        totalListenMs: 0,
        maxListenMs: 0,
        completedCount: 0,
        skippedCount: 0,
        lockToggleCount: 0,
        lockLoopCount: 0,
        maxLockPlayCount: 0,
        lockListenMs: 0,
      };
      bySong.set(songId, t);
    }
    return t;
  };

  for (const s of sessions) {
    const t = ensure(s.song_id);
    t.sessionCount += 1;
    t.totalListenMs += s.listen_ms;
    t.maxListenMs = Math.max(t.maxListenMs, s.listen_ms);
    if (s.end_reason === "completed" || s.end_reason === "lock_loop_boundary") {
      t.completedCount += 1;
    }
    if (s.end_reason === "skipped") t.skippedCount += 1;
    if (s.under_track_lock) {
      t.lockListenMs += s.listen_ms;
      if (s.lock_play_count != null) {
        t.maxLockPlayCount = Math.max(t.maxLockPlayCount, s.lock_play_count);
      }
    }
    if (s.source === "track_lock_loop") t.lockLoopCount += 1;
  }

  for (const e of events) {
    if (e.name === "track_lock_on" && e.song_id) {
      ensure(e.song_id).lockToggleCount += 1;
    }
    if (e.name === "track_lock_loop" && e.song_id) {
      const t = ensure(e.song_id);
      const pc = Number(propsOf(e).play_count ?? 0);
      if (pc > t.maxLockPlayCount) t.maxLockPlayCount = pc;
      t.lockLoopCount += 1;
    }
  }

  const tracks = [...bySong.values()].sort(
    (a, b) => b.totalListenMs - a.totalListenMs,
  );
  const lockSongs = tracks
    .filter((t) => t.lockToggleCount > 0 || t.lockLoopCount > 0 || t.lockListenMs > 0)
    .map((t) => ({
      songId: t.songId,
      maxPlayCount: t.maxLockPlayCount,
      lockListenMs: t.lockListenMs,
    }));

  const timestamps = [
    ...events.map((e) => e.ts),
    ...sessions.map((s) => s.started_at),
  ];
  const sparse = events.length < 2 && sessions.length < 1;

  return {
    dayKey,
    meta: {
      inputCount: count("user_input"),
      lyraStartCount: count("lyra_start"),
      songIntentHits: count("song_intent_hit"),
      songIntentMisses: count("song_intent_miss"),
      trackLockOnCount: count("track_lock_on"),
      firstTs: timestamps.length ? Math.min(...timestamps) : null,
      lastTs: timestamps.length ? Math.max(...timestamps) : null,
    },
    listening: {
      playStarts: count("play_start") || sessions.length,
      uniqueSongs: bySong.size,
      totalListenMs: sessions.reduce((a, s) => a + s.listen_ms, 0),
      completes: sessions.filter(
        (s) =>
          s.end_reason === "completed" || s.end_reason === "lock_loop_boundary",
      ).length,
      skips: sessions.filter((s) => s.end_reason === "skipped").length,
      tracks,
    },
    trackLock: {
      onCount: count("track_lock_on"),
      loopCount: count("track_lock_loop"),
      maxPlayCount: lockSongs.reduce((m, s) => Math.max(m, s.maxPlayCount), 0),
      songs: lockSongs,
    },
    lyrics: { openCount: count("lyrics_open") },
    library: {
      favoriteAdds: count("favorite_add"),
      historyOpens: count("history_open"),
      historyReplays: count("history_replay"),
    },
    eventCount: events.length,
    sessionCount: sessions.length,
    sparse,
  };
}
