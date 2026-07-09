import { getDb } from "../client";

export type WeeklySnapshotRow = {
  id?: number;
  window_start: string;
  window_end: string;
  html_path: string;
  living_portrait_at_close: string;
  turn_count: number;
  fallback: 0 | 1;
  created_at?: string;
};

export async function insert(row: WeeklySnapshotRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO weekly_snapshots
       (window_start, window_end, html_path,
        living_portrait_at_close, turn_count, fallback)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.window_start,
      row.window_end,
      row.html_path,
      row.living_portrait_at_close,
      row.turn_count,
      row.fallback,
    ],
  );
}

export async function latest(): Promise<WeeklySnapshotRow | null> {
  const db = await getDb();
  const out = await db.select<WeeklySnapshotRow[]>(
    `SELECT id, window_start, window_end, html_path,
            living_portrait_at_close, turn_count, fallback, created_at
     FROM weekly_snapshots
     ORDER BY id DESC LIMIT 1`,
  );
  return out.length === 0 ? null : out[0];
}

export async function findByWindow(
  window_start: string,
  window_end: string,
): Promise<WeeklySnapshotRow | null> {
  const db = await getDb();
  const out = await db.select<WeeklySnapshotRow[]>(
    `SELECT id, window_start, window_end, html_path,
            living_portrait_at_close, turn_count, fallback, created_at
     FROM weekly_snapshots
     WHERE window_start = ? AND window_end = ?`,
    [window_start, window_end],
  );
  return out.length === 0 ? null : out[0];
}

export async function deleteByWindow(
  window_start: string,
  window_end: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM weekly_snapshots WHERE window_start = ? AND window_end = ?`,
    [window_start, window_end],
  );
}
