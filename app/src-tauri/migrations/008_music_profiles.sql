-- 008_music_profiles.sql — LLM 音乐语义画像表
-- 替代 library_features 中的 FFT 特征，用 LLM 做一次深入分析

CREATE TABLE music_profiles (
  track_id TEXT PRIMARY KEY,
  analyzed_at INTEGER NOT NULL,
  llm_model TEXT,
  profile_json TEXT NOT NULL,
  FOREIGN KEY (track_id) REFERENCES library_tracks(id) ON DELETE CASCADE
);

-- 用户对每首歌的反馈评价，积累后用于更新 Soul taste
CREATE TABLE track_feedback (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('completed','skipped','repeated','verbal_positive','verbal_negative')),
  timestamp INTEGER NOT NULL,
  emotion_delta_json TEXT NOT NULL,
  FOREIGN KEY (track_id) REFERENCES library_tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (turn_id) REFERENCES dialogue_turns(id)
);
CREATE INDEX idx_tf_track ON track_feedback(track_id);
CREATE INDEX idx_tf_turn ON track_feedback(turn_id);
