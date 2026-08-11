-- 010_daily_activity.sql — 日报埋点：行为事件 + 播放会话 + 日报快照

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  name TEXT NOT NULL,
  song_id TEXT,
  turn_id TEXT,
  props_json TEXT NOT NULL DEFAULT '{}',
  platform TEXT NOT NULL DEFAULT 'ios'
);
CREATE INDEX IF NOT EXISTS idx_activity_day_name ON activity_events(day_key, name);
CREATE INDEX IF NOT EXISTS idx_activity_day_ts ON activity_events(day_key, ts);
CREATE INDEX IF NOT EXISTS idx_activity_day_song ON activity_events(day_key, song_id);

CREATE TABLE IF NOT EXISTS play_sessions (
  id TEXT PRIMARY KEY,
  day_key TEXT NOT NULL,
  song_id TEXT NOT NULL,
  turn_id TEXT,
  source TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  listen_ms INTEGER NOT NULL DEFAULT 0,
  pause_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  end_reason TEXT,
  max_position_ms INTEGER NOT NULL DEFAULT 0,
  seek_count INTEGER NOT NULL DEFAULT 0,
  was_background_ms INTEGER NOT NULL DEFAULT 0,
  lyrics_open_count INTEGER NOT NULL DEFAULT 0,
  under_track_lock INTEGER NOT NULL DEFAULT 0,
  lock_play_count INTEGER,
  consecutive_repeat_index INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_play_sess_day ON play_sessions(day_key, started_at);
CREATE INDEX IF NOT EXISTS idx_play_sess_song ON play_sessions(day_key, song_id);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  day_key TEXT PRIMARY KEY,
  html TEXT NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  fallback INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_snap_created ON daily_snapshots(created_at DESC);
