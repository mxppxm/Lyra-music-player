// llmUsageRepo — one row per provider.chat call. Written by the
// usage-logging decorator (providers/usageLogging.ts). Read by the
// Data Explorer "LLM 用量" tab.

import { getDb } from "../client";

export type LlmUsageEntry = {
  id: number;
  ts: number;
  provider: string;
  model: string;
  agent: string | null;
  input_tokens: number;
  output_tokens: number;
};

export type LlmUsageInsert = Omit<LlmUsageEntry, "id">;

export async function insert(entry: LlmUsageInsert): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO llm_usage (ts, provider, model, agent, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.ts,
      entry.provider,
      entry.model,
      entry.agent,
      entry.input_tokens,
      entry.output_tokens,
    ],
  );
}

export async function listRecent(limit = 200): Promise<LlmUsageEntry[]> {
  const db = await getDb();
  return db.select<LlmUsageEntry[]>(
    `SELECT id, ts, provider, model, agent, input_tokens, output_tokens
     FROM llm_usage
     ORDER BY ts DESC
     LIMIT ?`,
    [limit],
  );
}

export type UsageAggregate = {
  provider: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
};

export async function aggregateByModel(): Promise<UsageAggregate[]> {
  const db = await getDb();
  return db.select<UsageAggregate[]>(
    `SELECT provider,
            model,
            COUNT(*) AS calls,
            SUM(input_tokens)  AS input_tokens,
            SUM(output_tokens) AS output_tokens
     FROM llm_usage
     GROUP BY provider, model
     ORDER BY provider, model`,
  );
}
