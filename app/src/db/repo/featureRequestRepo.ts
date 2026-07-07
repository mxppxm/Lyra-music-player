// featureRequestRepo — CRUD for the `feature_requests` table
import { getDb } from "../client";
import type { FeatureRequest } from "../../engineer/types";

type FeatureRequestRow = {
  id: string;
  created_at: number;
  from_agent: string;
  desire: string;
  observed_pattern: string | null;
  urgency: string;
  consumed: number;
};

function fromRow(r: FeatureRequestRow): FeatureRequest {
  return {
    id: r.id,
    created_at: r.created_at,
    from_agent: r.from_agent as FeatureRequest["from_agent"],
    desire: r.desire,
    observed_pattern: r.observed_pattern ?? "",
    urgency: r.urgency as FeatureRequest["urgency"],
    consumed: r.consumed === 1,
  };
}

export async function insert(req: Omit<FeatureRequest, "consumed">): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO feature_requests
       (id, created_at, from_agent, desire, observed_pattern, urgency, consumed)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [req.id, req.created_at, req.from_agent, req.desire, req.observed_pattern || null, req.urgency],
  );
}

export async function listUnconsumed(): Promise<FeatureRequest[]> {
  const db = await getDb();
  const rows = await db.select<FeatureRequestRow[]>(
    `SELECT id, created_at, from_agent, desire, observed_pattern, urgency, consumed
     FROM feature_requests WHERE consumed = 0 ORDER BY created_at ASC`,
  );
  return rows.map(fromRow);
}

export async function listSince(sinceMs: number): Promise<FeatureRequest[]> {
  const db = await getDb();
  const rows = await db.select<FeatureRequestRow[]>(
    `SELECT id, created_at, from_agent, desire, observed_pattern, urgency, consumed
     FROM feature_requests WHERE created_at >= ? ORDER BY created_at ASC`,
    [sinceMs],
  );
  return rows.map(fromRow);
}

export async function markConsumed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(", ");
  await db.execute(
    `UPDATE feature_requests SET consumed = 1 WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function getById(id: string): Promise<FeatureRequest | null> {
  const db = await getDb();
  const rows = await db.select<FeatureRequestRow[]>(
    `SELECT id, created_at, from_agent, desire, observed_pattern, urgency, consumed
     FROM feature_requests WHERE id = ?`,
    [id],
  );
  return rows.length === 0 ? null : fromRow(rows[0]);
}

export async function countUnconsumed(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM feature_requests WHERE consumed = 0`,
  );
  return rows[0]?.n ?? 0;
}
