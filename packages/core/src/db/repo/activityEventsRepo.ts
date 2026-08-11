// db/repo/activityEventsRepo.ts — 日报行为事件（append-only）

import { getDb } from "../client";

export type ActivityEventRow = {
  id: string;
  ts: number;
  day_key: string;
  name: string;
  song_id: string | null;
  turn_id: string | null;
  props_json: string;
  platform: string;
};

export type InsertActivityEventInput = {
  id: string;
  ts: number;
  dayKey: string;
  name: string;
  songId?: string | null;
  turnId?: string | null;
  props?: Record<string, unknown>;
  platform?: string;
};

export async function insertActivityEvent(
  input: InsertActivityEventInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO activity_events
     (id, ts, day_key, name, song_id, turn_id, props_json, platform)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.ts,
      input.dayKey,
      input.name,
      input.songId ?? null,
      input.turnId ?? null,
      JSON.stringify(input.props ?? {}),
      input.platform ?? "ios",
    ],
  );
}

export async function listActivityEventsByDay(
  dayKey: string,
): Promise<ActivityEventRow[]> {
  const db = await getDb();
  return db.select<ActivityEventRow[]>(
    `SELECT id, ts, day_key, name, song_id, turn_id, props_json, platform
     FROM activity_events
     WHERE day_key = ?
     ORDER BY ts ASC`,
    [dayKey],
  );
}
