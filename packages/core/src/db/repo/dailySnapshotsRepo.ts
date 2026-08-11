// db/repo/dailySnapshotsRepo.ts — 日报 HTML 快照

import { getDb } from "../client";

export type DailySnapshotRow = {
  day_key: string;
  html: string;
  turn_count: number;
  event_count: number;
  fallback: number;
  created_at: number;
};

export async function upsertDailySnapshot(row: {
  dayKey: string;
  html: string;
  turnCount: number;
  eventCount: number;
  fallback?: boolean;
  createdAt?: number;
}): Promise<void> {
  const db = await getDb();
  const createdAt = row.createdAt ?? Date.now();
  await db.execute(
    `INSERT INTO daily_snapshots
     (day_key, html, turn_count, event_count, fallback, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(day_key) DO UPDATE SET
       html = excluded.html,
       turn_count = excluded.turn_count,
       event_count = excluded.event_count,
       fallback = excluded.fallback,
       created_at = excluded.created_at`,
    [
      row.dayKey,
      row.html,
      row.turnCount,
      row.eventCount,
      row.fallback ? 1 : 0,
      createdAt,
    ],
  );
}

export async function getDailySnapshot(
  dayKey: string,
): Promise<DailySnapshotRow | null> {
  const db = await getDb();
  const rows = await db.select<DailySnapshotRow[]>(
    `SELECT day_key, html, turn_count, event_count, fallback, created_at
     FROM daily_snapshots WHERE day_key = ?`,
    [dayKey],
  );
  return rows[0] ?? null;
}

export async function listDailySnapshots(
  limit = 30,
): Promise<DailySnapshotRow[]> {
  const db = await getDb();
  return db.select<DailySnapshotRow[]>(
    `SELECT day_key, html, turn_count, event_count, fallback, created_at
     FROM daily_snapshots
     ORDER BY day_key DESC
     LIMIT ?`,
    [limit],
  );
}
