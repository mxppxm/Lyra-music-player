-- Sprint 11 · Observability
-- Add per-call latency to llm_usage, per-turn e2e latency to dialogue_turns,
-- and a new reasoning_traces table capturing prompt + raw response + parsed
-- decision per agent call. Everything is best-effort — writes never block
-- the main loop.

ALTER TABLE llm_usage ADD COLUMN duration_ms INTEGER;

ALTER TABLE dialogue_turns ADD COLUMN turn_latency_ms INTEGER;

CREATE TABLE reasoning_traces (
  id            TEXT PRIMARY KEY,
  turn_id       TEXT NULL,
  agent_kind    TEXT NOT NULL,
  prompt_text   TEXT NOT NULL,
  raw_response  TEXT NULL,
  parsed_json   TEXT NULL,
  duration_ms   INTEGER NULL,
  ts            INTEGER NOT NULL
);

CREATE INDEX idx_reasoning_ts   ON reasoning_traces(ts DESC);
CREATE INDEX idx_reasoning_turn ON reasoning_traces(turn_id);
