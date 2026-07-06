import type { LibraryTrack, SongOrigin } from "../../types";

export type LibraryTrackRow = {
  id: string;
  path: string;
  origin: SongOrigin;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
  added_at: number;
  metadata_json: string | null;
};

export function toRow(t: LibraryTrack): LibraryTrackRow {
  return {
    id: t.id,
    path: t.path,
    origin: t.origin,
    title: t.title ?? null,
    artist: t.artist ?? null,
    album: t.album ?? null,
    duration_ms: t.duration_ms ?? null,
    added_at: t.added_at,
    metadata_json: t.metadata === undefined ? null : JSON.stringify(t.metadata),
  };
}

export function fromRow(r: LibraryTrackRow): LibraryTrack {
  const t: LibraryTrack = {
    id: r.id,
    path: r.path,
    origin: r.origin,
    added_at: r.added_at,
  };
  if (r.title !== null) t.title = r.title;
  if (r.artist !== null) t.artist = r.artist;
  if (r.album !== null) t.album = r.album;
  if (r.duration_ms !== null) t.duration_ms = r.duration_ms;
  if (r.metadata_json !== null) t.metadata = JSON.parse(r.metadata_json);
  return t;
}
