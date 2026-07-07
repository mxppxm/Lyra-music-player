// roadmapRepo — CRUD for the `roadmap` table
import { getDb } from "../client";
import type { RoadmapItem, RoadmapItemStatus } from "../../engineer/types";

type RoadmapRow = {
  id: string;
  created_at: number;
  created_by: string;
  title: string;
  rationale: string;
  evidence_json: string | null;
  proposed_change_json: string | null;
  status: string;
  priority: number;
  effort: string | null;
};

function fromRow(r: RoadmapRow): RoadmapItem {
  return {
    id: r.id,
    created_at: r.created_at,
    created_by: r.created_by as RoadmapItem["created_by"],
    title: r.title,
    rationale: r.rationale,
    evidence: r.evidence_json ? (JSON.parse(r.evidence_json) as string[]) : [],
    proposed_change: r.proposed_change_json
      ? JSON.parse(r.proposed_change_json)
      : { zone: "yellow", files: [], summary: "" },
    status: r.status as RoadmapItemStatus,
    priority: r.priority,
    effort: (r.effort ?? "M") as RoadmapItem["effort"],
  };
}

export async function insertItem(item: RoadmapItem): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO roadmap
       (id, created_at, created_by, title, rationale,
        evidence_json, proposed_change_json, status, priority, effort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.created_at,
      item.created_by,
      item.title,
      item.rationale,
      JSON.stringify(item.evidence),
      JSON.stringify(item.proposed_change),
      item.status,
      item.priority,
      item.effort,
    ],
  );
}

export async function getItem(id: string): Promise<RoadmapItem | null> {
  const db = await getDb();
  const rows = await db.select<RoadmapRow[]>(
    `SELECT id, created_at, created_by, title, rationale,
            evidence_json, proposed_change_json, status, priority, effort
     FROM roadmap WHERE id = ?`,
    [id],
  );
  return rows.length === 0 ? null : fromRow(rows[0]);
}

export async function listByStatus(status: RoadmapItemStatus): Promise<RoadmapItem[]> {
  const db = await getDb();
  const rows = await db.select<RoadmapRow[]>(
    `SELECT id, created_at, created_by, title, rationale,
            evidence_json, proposed_change_json, status, priority, effort
     FROM roadmap WHERE status = ? ORDER BY priority DESC, created_at DESC`,
    [status],
  );
  return rows.map(fromRow);
}

export async function listAll(): Promise<RoadmapItem[]> {
  const db = await getDb();
  const rows = await db.select<RoadmapRow[]>(
    `SELECT id, created_at, created_by, title, rationale,
            evidence_json, proposed_change_json, status, priority, effort
     FROM roadmap ORDER BY priority DESC, created_at DESC`,
  );
  return rows.map(fromRow);
}

export async function updateStatus(
  id: string,
  status: RoadmapItemStatus,
): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE roadmap SET status = ? WHERE id = ?`, [status, id]);
}

export async function countByStatus(status: RoadmapItemStatus): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM roadmap WHERE status = ?`,
    [status],
  );
  return rows[0]?.n ?? 0;
}
