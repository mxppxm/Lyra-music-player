-- 009_favorites.sql — 用户歌曲收藏（纯书签，不进推荐）

CREATE TABLE IF NOT EXISTS favorites (
  song_id TEXT PRIMARY KEY,
  favorited_at INTEGER NOT NULL,
  FOREIGN KEY (song_id) REFERENCES library_tracks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_favorites_at ON favorites(favorited_at DESC);
