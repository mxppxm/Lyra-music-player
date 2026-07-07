CREATE TABLE llm_usage (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  agent          TEXT,
  input_tokens   INTEGER NOT NULL,
  output_tokens  INTEGER NOT NULL
);

CREATE INDEX idx_llm_usage_ts ON llm_usage(ts);
CREATE INDEX idx_llm_usage_provider ON llm_usage(provider);
