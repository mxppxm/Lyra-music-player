// types/song.ts — 曲库对象
export type SongOrigin = "local" | "web" | "generated";

export type LibraryTrack = {
  id: string;
  path: string;
  origin: SongOrigin;
  title?: string;
  artist?: string;
  album?: string;
  duration_ms?: number;
  added_at: number;
  metadata?: Record<string, unknown>;
};

export type TrackFeatures = {
  track_id: string;
  bpm?: number;
  energy?: number;
  valence?: number;
  tags?: string[];
  embedding?: number[];
};
