import type { SalientMoment } from "../../memory/types";
import { getDb } from "../client";

export type SharedMemoryRow = {
  id: string;
  timestamp: number;
  song_id: string;
  context: string;
  significance: string;
};

function toRow(moment: SalientMoment, id: string): SharedMemoryRow {
  return {
    id,
    timestamp: new Date(moment.timestampISO).getTime(),
    song_id: moment.songTitle,
    context: moment.narrative,
    significance: moment.tags.join(" ") || "salient",
  };
}

function fromRow(r: SharedMemoryRow): SalientMoment {
  return {
    timestampISO: new Date(r.timestamp).toISOString(),
    songTitle: r.song_id,
    narrative: r.context,
    tags: r.significance ? r.significance.split(" ").filter(Boolean) : [],
  };
}

export async function insertSharedMemory(moment: SalientMoment, id?: string): Promise<void> {
  const row = toRow(moment, id ?? crypto.randomUUID());
  const db = await getDb();
  await db.execute(
    `INSERT INTO shared_memory (id, timestamp, song_id, context, significance)
     VALUES (?, ?, ?, ?, ?)`,
    [row.id, row.timestamp, row.song_id, row.context, row.significance],
  );
}

export async function listRecent(n: number): Promise<SalientMoment[]> {
  const db = await getDb();
  const rows = await db.select<SharedMemoryRow[]>(
    `SELECT id, timestamp, song_id, context, significance
     FROM shared_memory
     ORDER BY timestamp DESC
     LIMIT ?`,
    [n],
  );
  return rows.map(fromRow);
}
