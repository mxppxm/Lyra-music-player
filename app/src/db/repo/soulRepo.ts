import type { SoulState } from "../../types";
import { getDb } from "../client";
import { toRow, fromRow, SoulStateRow } from "../codec/soulState";

export async function upsertSoulState(s: SoulState): Promise<void> {
  const row = toRow(s);
  const db = await getDb();
  await db.execute(
    `INSERT INTO soul_state
       (agent_id, created_at, taste_base_json, dynamic_mood_json, proactive_budget_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(agent_id) DO UPDATE SET
       taste_base_json = excluded.taste_base_json,
       dynamic_mood_json = excluded.dynamic_mood_json,
       proactive_budget_json = excluded.proactive_budget_json,
       updated_at = excluded.updated_at`,
    [row.agent_id, row.created_at, row.taste_base_json, row.dynamic_mood_json, row.proactive_budget_json, row.updated_at],
  );
}

export async function loadSoulState(agentId: string): Promise<SoulState | null> {
  const db = await getDb();
  const rows = await db.select<SoulStateRow[]>(
    `SELECT agent_id, created_at, taste_base_json, dynamic_mood_json, proactive_budget_json, updated_at
     FROM soul_state WHERE agent_id = ?`,
    [agentId],
  );
  return rows.length === 0 ? null : fromRow(rows[0]);
}
