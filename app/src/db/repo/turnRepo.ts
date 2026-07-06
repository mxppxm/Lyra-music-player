import type { DialogueTurn } from "../../types";
import { getDb } from "../client";
import { toRow, fromRow, DialogueTurnRow } from "../codec/dialogueTurn";

export async function insertTurn(t: DialogueTurn): Promise<void> {
  const row = toRow(t);
  const db = await getDb();
  await db.execute(
    `INSERT INTO dialogue_turns
     (id, timestamp, user_utterance_json, agent_response_json,
      user_reaction_json, current_emotion_json, emotion_delta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.timestamp,
      row.user_utterance_json,
      row.agent_response_json,
      row.user_reaction_json,
      row.current_emotion_json,
      row.emotion_delta_json,
    ],
  );
}

export async function getTurn(id: string): Promise<DialogueTurn | null> {
  const db = await getDb();
  const rows = await db.select<DialogueTurnRow[]>(
    `SELECT id, timestamp, user_utterance_json, agent_response_json,
            user_reaction_json, current_emotion_json, emotion_delta_json
     FROM dialogue_turns WHERE id = ?`,
    [id],
  );
  return rows.length === 0 ? null : fromRow(rows[0]);
}

export async function listRecentTurns(limit: number): Promise<DialogueTurn[]> {
  const db = await getDb();
  const rows = await db.select<DialogueTurnRow[]>(
    `SELECT id, timestamp, user_utterance_json, agent_response_json,
            user_reaction_json, current_emotion_json, emotion_delta_json
     FROM dialogue_turns ORDER BY timestamp DESC LIMIT ?`,
    [limit],
  );
  return rows.map(fromRow);
}

export async function updateTurn(t: DialogueTurn): Promise<void> {
  const row = toRow(t);
  const db = await getDb();
  await db.execute(
    `UPDATE dialogue_turns SET
       user_utterance_json = ?,
       agent_response_json = ?,
       user_reaction_json = ?,
       current_emotion_json = ?,
       emotion_delta_json = ?
     WHERE id = ?`,
    [
      row.user_utterance_json,
      row.agent_response_json,
      row.user_reaction_json,
      row.current_emotion_json,
      row.emotion_delta_json,
      row.id,
    ],
  );
}

export async function countTurns(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM dialogue_turns`,
  );
  return rows[0]?.n ?? 0;
}
