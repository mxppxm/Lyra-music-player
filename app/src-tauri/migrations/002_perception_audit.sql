-- 002_perception_audit.sql — Sprint 8 T1
-- Rolling log of PerceptionAgent inference results, read by Reflect Agent
-- to propose rule threshold adjustments.

CREATE TABLE perception_audit (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('rule','llm')),
  features_json TEXT NOT NULL,
  bias_json TEXT NOT NULL
);
CREATE INDEX idx_perception_audit_ts ON perception_audit(ts);
