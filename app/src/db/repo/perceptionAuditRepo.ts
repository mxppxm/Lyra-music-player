// perceptionAuditRepo — Sprint 8 T1
// CRUD for perception_audit rows. Consumed by ReflectAgent to propose
// rule-threshold tuning.

import { getDb } from "../client";

export type PerceptionAuditRow = {
  id: string;
  ts: number;
  source: "rule" | "llm";
  features_json: string;
  bias_json: string;
};

/** Rolling cap — never grow the table beyond this many rows. Every insert
 *  cheaply prunes older entries so the table can't spiral. */
export const MAX_ROWS = 500;

export async function insert(row: PerceptionAuditRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO perception_audit (id, ts, source, features_json, bias_json)
     VALUES (?, ?, ?, ?, ?)`,
    [row.id, row.ts, row.source, row.features_json, row.bias_json],
  );
  // Cheap prune — DELETE the oldest rows beyond MAX_ROWS.
  await db.execute(
    `DELETE FROM perception_audit WHERE id IN (
       SELECT id FROM perception_audit ORDER BY ts DESC LIMIT -1 OFFSET ?
     )`,
    [MAX_ROWS],
  );
}

export async function listRecent(limit: number): Promise<PerceptionAuditRow[]> {
  const db = await getDb();
  const rows = await db.select<PerceptionAuditRow[]>(
    `SELECT id, ts, source, features_json, bias_json
     FROM perception_audit ORDER BY ts DESC LIMIT ?`,
    [limit],
  );
  return rows;
}

export async function pruneOlderThan(cutoffMs: number): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `DELETE FROM perception_audit WHERE ts < ?`,
    [cutoffMs],
  );
  return result.rowsAffected ?? 0;
}
