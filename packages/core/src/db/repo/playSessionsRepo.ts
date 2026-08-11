// db/repo/playSessionsRepo.ts — 单次播放会话

import { getDb } from "../client";

export type PlaySessionRow = {
  id: string;
  day_key: string;
  song_id: string;
  turn_id: string | null;
  source: string;
  started_at: number;
  ended_at: number | null;
  listen_ms: number;
  pause_ms: number;
  duration_ms: number | null;
  end_reason: string | null;
  max_position_ms: number;
  seek_count: number;
  was_background_ms: number;
  lyrics_open_count: number;
  under_track_lock: number;
  lock_play_count: number | null;
  consecutive_repeat_index: number;
};

export type InsertPlaySessionInput = {
  id: string;
  dayKey: string;
  songId: string;
  turnId?: string | null;
  source: string;
  startedAt: number;
  durationMs?: number | null;
  underTrackLock?: boolean;
  lockPlayCount?: number | null;
  consecutiveRepeatIndex?: number;
};

export type FinalizePlaySessionInput = {
  id: string;
  endedAt: number;
  listenMs: number;
  pauseMs: number;
  endReason: string;
  maxPositionMs: number;
  seekCount: number;
  wasBackgroundMs: number;
  lyricsOpenCount: number;
};

export async function insertPlaySession(
  input: InsertPlaySessionInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO play_sessions
     (id, day_key, song_id, turn_id, source, started_at, ended_at,
      listen_ms, pause_ms, duration_ms, end_reason, max_position_ms, seek_count,
      was_background_ms, lyrics_open_count, under_track_lock, lock_play_count,
      consecutive_repeat_index)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, ?, NULL, 0, 0, 0, 0, ?, ?, ?)`,
    [
      input.id,
      input.dayKey,
      input.songId,
      input.turnId ?? null,
      input.source,
      input.startedAt,
      input.durationMs ?? null,
      input.underTrackLock ? 1 : 0,
      input.lockPlayCount ?? null,
      input.consecutiveRepeatIndex ?? 1,
    ],
  );
}

export async function finalizePlaySession(
  input: FinalizePlaySessionInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE play_sessions SET
       ended_at = ?, listen_ms = ?, pause_ms = ?, end_reason = ?,
       max_position_ms = ?, seek_count = ?, was_background_ms = ?,
       lyrics_open_count = ?
     WHERE id = ?`,
    [
      input.endedAt,
      input.listenMs,
      input.pauseMs,
      input.endReason,
      input.maxPositionMs,
      input.seekCount,
      input.wasBackgroundMs,
      input.lyricsOpenCount,
      input.id,
    ],
  );
}

export async function listPlaySessionsByDay(
  dayKey: string,
): Promise<PlaySessionRow[]> {
  const db = await getDb();
  return db.select<PlaySessionRow[]>(
    `SELECT * FROM play_sessions
     WHERE day_key = ?
     ORDER BY started_at ASC`,
    [dayKey],
  );
}
