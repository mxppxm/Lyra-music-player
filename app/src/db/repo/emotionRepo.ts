import type { CurrentEmotion } from "../../types";
import { getDb } from "../client";
import { toRow, fromRow, EmotionSnapshotRow } from "../codec/emotionSnapshot";

export async function insertSnapshot(
  e: CurrentEmotion,
  meta: { id: string; timestamp: number; turnId?: string | null },
): Promise<void> {
  const row = toRow(e, meta);
  const db = await getDb();
  await db.execute(
    `INSERT INTO emotion_snapshots
       (id, timestamp, turn_id, pad_p, pad_a, pad_d, labels_json, confidence, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.timestamp, row.turn_id, row.pad_p, row.pad_a, row.pad_d, row.labels_json, row.confidence, row.source],
  );
}

export async function listSnapshotsForTurn(turnId: string): Promise<CurrentEmotion[]> {
  const db = await getDb();
  const rows = await db.select<EmotionSnapshotRow[]>(
    `SELECT id, timestamp, turn_id, pad_p, pad_a, pad_d, labels_json, confidence, source
     FROM emotion_snapshots WHERE turn_id = ? ORDER BY timestamp ASC`,
    [turnId],
  );
  return rows.map(fromRow);
}
