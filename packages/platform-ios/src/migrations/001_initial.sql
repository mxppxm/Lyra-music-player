-- 001_initial.sql — 音乐播放器 v0.1 骨架 schema
-- 对应 spec §1.5

CREATE TABLE dialogue_turns (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  user_utterance_json TEXT NOT NULL,
  agent_response_json TEXT NOT NULL,
  user_reaction_json TEXT NOT NULL,
  current_emotion_json TEXT NOT NULL,
  emotion_delta_json TEXT NOT NULL
);
CREATE INDEX idx_turns_ts ON dialogue_turns(timestamp);

CREATE TABLE emotion_snapshots (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  turn_id TEXT,
  pad_p REAL NOT NULL,
  pad_a REAL NOT NULL,
  pad_d REAL NOT NULL,
  labels_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  FOREIGN KEY (turn_id) REFERENCES dialogue_turns(id)
);
CREATE INDEX idx_snap_ts ON emotion_snapshots(timestamp);

CREATE TABLE soul_state (
  agent_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  taste_base_json TEXT NOT NULL,
  dynamic_mood_json TEXT NOT NULL,
  proactive_budget_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE shared_memory (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  song_id TEXT NOT NULL,
  context TEXT NOT NULL,
  significance TEXT NOT NULL
);
CREATE INDEX idx_sm_ts ON shared_memory(timestamp);
CREATE INDEX idx_sm_song ON shared_memory(song_id);

CREATE TABLE library_tracks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL CHECK (origin IN ('local','web','generated')),
  title TEXT,
  artist TEXT,
  album TEXT,
  duration_ms INTEGER,
  added_at INTEGER NOT NULL,
  metadata_json TEXT
);
CREATE INDEX idx_tracks_origin ON library_tracks(origin);

CREATE TABLE library_features (
  track_id TEXT PRIMARY KEY,
  bpm REAL,
  energy REAL,
  valence REAL,
  tags_json TEXT,
  embedding_json TEXT,
  FOREIGN KEY (track_id) REFERENCES library_tracks(id) ON DELETE CASCADE
);

CREATE TABLE roadmap (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_json TEXT,
  proposed_change_json TEXT,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  effort TEXT
);
CREATE INDEX idx_road_status ON roadmap(status);

CREATE TABLE feature_requests (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  from_agent TEXT NOT NULL,
  desire TEXT NOT NULL,
  observed_pattern TEXT,
  urgency TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  kind TEXT NOT NULL,
  producer TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  consumed_by_json TEXT
);
CREATE INDEX idx_events_kind ON events(kind);
CREATE INDEX idx_events_ts ON events(timestamp);

CREATE TABLE engineer_audit (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX idx_audit_task ON engineer_audit(task_id);
