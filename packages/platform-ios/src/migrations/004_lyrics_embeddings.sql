CREATE TABLE library_lyrics_embeddings (
  track_id     TEXT PRIMARY KEY,
  lyrics_hash  TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  dim          INTEGER NOT NULL,
  embedding    BLOB NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (track_id) REFERENCES library_tracks(id) ON DELETE CASCADE
);

CREATE INDEX idx_lyrics_emb_model ON library_lyrics_embeddings(model_id);
