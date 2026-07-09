-- Sprint · 周报(一封信)
-- Records one row per generated weekly report. Also carries the closing
-- Living Portrait so the next week's generation can diff against it.
-- fallback = 1 marks reports written from the fallback path (LLM failed
-- or sparse-week on-demand); useful for later opt-in eval bucketing.

CREATE TABLE weekly_snapshots (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  window_start              TEXT    NOT NULL,
  window_end                TEXT    NOT NULL,
  html_path                 TEXT    NOT NULL,
  living_portrait_at_close  TEXT    NOT NULL,
  turn_count                INTEGER NOT NULL,
  fallback                  INTEGER NOT NULL DEFAULT 0,
  created_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX ux_weekly_window ON weekly_snapshots(window_start, window_end);
CREATE INDEX idx_weekly_created ON weekly_snapshots(created_at DESC);
