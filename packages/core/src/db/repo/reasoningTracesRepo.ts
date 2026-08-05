// reasoningTracesRepo — Sprint 11
// One row per agent LLM invocation. Captures the assembled prompt, the raw
// (pre-parse) LLM response, and the parsed decision JSON. Written by each
// agent's own instrumentation (best-effort, never blocks); read by the
// Data Explorer 推理轨迹 tab. Truncated on boot via deleteOlderThan().

import { getDb } from "../client";

export type AgentKind =
  | "companion"
  | "emotion"
  | "emotion_rule"
  | "reflect"
  | "perception"
  | "engineer"
  | "weekly"
  | "mood-summary";

export type ReasoningTrace = {
  id: string;
  turn_id: string | null;
  agent_kind: AgentKind;
  prompt_text: string;
  raw_response: string | null;
  parsed_json: string | null;
  duration_ms: number | null;
  ts: number;
};

export type ReasoningTraceInsert = Omit<ReasoningTrace, "id"> & { id?: string };

function makeId(): string {
  return `trc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function insert(entry: ReasoningTraceInsert): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO reasoning_traces
       (id, turn_id, agent_kind, prompt_text, raw_response,
        parsed_json, duration_ms, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id ?? makeId(),
      entry.turn_id,
      entry.agent_kind,
      entry.prompt_text,
      entry.raw_response,
      entry.parsed_json,
      entry.duration_ms,
      entry.ts,
    ],
  );
}

export async function listRecent(limit = 200): Promise<ReasoningTrace[]> {
  const db = await getDb();
  return db.select<ReasoningTrace[]>(
    `SELECT id, turn_id, agent_kind, prompt_text, raw_response,
            parsed_json, duration_ms, ts
     FROM reasoning_traces
     ORDER BY ts DESC
     LIMIT ?`,
    [limit],
  );
}

export async function listByTurn(turnId: string): Promise<ReasoningTrace[]> {
  const db = await getDb();
  return db.select<ReasoningTrace[]>(
    `SELECT id, turn_id, agent_kind, prompt_text, raw_response,
            parsed_json, duration_ms, ts
     FROM reasoning_traces
     WHERE turn_id = ?
     ORDER BY ts ASC`,
    [turnId],
  );
}

/** Delete traces older than the given cutoff (unix millis). Returns rows
 *  affected. Called on boot to bound disk usage — prompts are large. */
export async function deleteOlderThan(cutoffMs: number): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `DELETE FROM reasoning_traces WHERE ts < ?`,
    [cutoffMs],
  );
  return res.rowsAffected ?? 0;
}
