// engineerAuditRepo — CRUD for the `engineer_audit` table
import { getDb } from "../client";
import type { EngineerAuditEntry } from "../../engineer/types";

type AuditRow = {
  id: string;
  timestamp: number;
  task_id: string;
  phase: string;
  payload_json: string;
};

function fromRow(r: AuditRow): EngineerAuditEntry {
  return {
    id: r.id,
    timestamp: r.timestamp,
    task_id: r.task_id,
    phase: r.phase,
    payload_json: r.payload_json,
  };
}

export async function insertEntry(entry: EngineerAuditEntry): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO engineer_audit (id, timestamp, task_id, phase, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    [entry.id, entry.timestamp, entry.task_id, entry.phase, entry.payload_json],
  );
}

export async function listByTaskId(taskId: string): Promise<EngineerAuditEntry[]> {
  const db = await getDb();
  const rows = await db.select<AuditRow[]>(
    `SELECT id, timestamp, task_id, phase, payload_json
     FROM engineer_audit WHERE task_id = ? ORDER BY timestamp ASC`,
    [taskId],
  );
  return rows.map(fromRow);
}

export async function listSince(sinceMs: number): Promise<EngineerAuditEntry[]> {
  const db = await getDb();
  const rows = await db.select<AuditRow[]>(
    `SELECT id, timestamp, task_id, phase, payload_json
     FROM engineer_audit WHERE timestamp >= ? ORDER BY timestamp DESC`,
    [sinceMs],
  );
  return rows.map(fromRow);
}

export async function listRecent(limit: number): Promise<EngineerAuditEntry[]> {
  const db = await getDb();
  const rows = await db.select<AuditRow[]>(
    `SELECT id, timestamp, task_id, phase, payload_json
     FROM engineer_audit ORDER BY timestamp DESC LIMIT ?`,
    [limit],
  );
  return rows.map(fromRow);
}

export async function getEntry(id: string): Promise<EngineerAuditEntry | null> {
  const db = await getDb();
  const rows = await db.select<AuditRow[]>(
    `SELECT id, timestamp, task_id, phase, payload_json
     FROM engineer_audit WHERE id = ?`,
    [id],
  );
  return rows.length === 0 ? null : fromRow(rows[0]);
}
