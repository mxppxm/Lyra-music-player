import type { LibraryTrack } from "../../types";
import { getDb } from "../client";
import { toRow, fromRow, LibraryTrackRow } from "../codec/libraryTrack";

const COLUMNS =
  `id, path, origin, title, artist, album, duration_ms, added_at, metadata_json`;

export async function insertTrack(t: LibraryTrack): Promise<void> {
  const row = toRow(t);
  const db = await getDb();
  await db.execute(
    `INSERT OR IGNORE INTO library_tracks (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.path, row.origin, row.title, row.artist, row.album, row.duration_ms, row.added_at, row.metadata_json],
  );
}

/** Batch insert tracks from Bilibili — idempotent, skips existing IDs. */
export async function batchInsertTracks(tracks: LibraryTrack[]): Promise<number> {
  if (tracks.length === 0) return 0;
  const db = await getDb();

  // Build a single INSERT with multiple value rows
  const placeholders = tracks.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values: any[] = [];
  for (const t of tracks) {
    const row = toRow(t);
    values.push(row.id, row.path, row.origin, row.title, row.artist, row.album, row.duration_ms, row.added_at, row.metadata_json);
  }

  const result = await db.execute(
    `INSERT OR IGNORE INTO library_tracks (${COLUMNS}) VALUES ${placeholders}`,
    values,
  );
  return result.rowsAffected ?? tracks.length;
}

export async function getTrack(id: string): Promise<LibraryTrack | null> {
  const db = await getDb();
  const rows = await db.select<LibraryTrackRow[]>(
    `SELECT ${COLUMNS} FROM library_tracks WHERE id = ?`,
    [id],
  );
  return rows.length === 0 ? null : fromRow(rows[0]);
}

export async function listAll(): Promise<LibraryTrack[]> {
  const db = await getDb();
  const rows = await db.select<LibraryTrackRow[]>(`SELECT ${COLUMNS} FROM library_tracks ORDER BY added_at ASC`);
  return rows.map(fromRow);
}

export async function findByPath(path: string): Promise<LibraryTrack | null> {
  const db = await getDb();
  const rows = await db.select<LibraryTrackRow[]>(
    `SELECT ${COLUMNS} FROM library_tracks WHERE path = ?`,
    [path],
  );
  return rows.length === 0 ? null : fromRow(rows[0]);
}

/** Delete a track and every dependent row that references it. tauri-plugin-sql
 *  leaves the SQLite `foreign_keys` pragma OFF, so ON DELETE CASCADE in the
 *  schema doesn't fire — we wipe children first, parent last, in an order
 *  that stays consistent whether or not cascades are eventually turned on. */
/** Quick check: does any track in the library match the given artist name?
 *  Searches the `artist` and `title` columns (case-insensitive, substring).
 *  Used by parseArtistIntent to reject mood words that look like artist names. */
export async function artistExists(name: string): Promise<boolean> {
  const token = name.trim().toLowerCase();
  if (!token) return false;
  const db = await getDb();
  const rows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM library_tracks
     WHERE LOWER(artist) LIKE ? OR LOWER(title) LIKE ?`,
    [`%${token}%`, `%${token}%`],
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

export async function deleteTrackCascade(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM track_feedback WHERE track_id = ?",
    [id],
  );
  await db.execute(
    "DELETE FROM music_profiles WHERE track_id = ?",
    [id],
  );
  await db.execute(
    "DELETE FROM library_lyrics_embeddings WHERE track_id = ?",
    [id],
  );
  await db.execute("DELETE FROM library_features WHERE track_id = ?", [id]);
  await db.execute("DELETE FROM library_tracks WHERE id = ?", [id]);
}

/**
 * Find tracks whose title contains any of the given query strings.
 * Matching is case-insensitive substring. Results sorted by play_count desc.
 * Use for "歌名优先匹配": user types "山丘" → finds 《山丘》in library.
 */
export async function findByTitle(queries: string[]): Promise<LibraryTrack[]> {
  if (queries.length === 0) return [];
  const all = await listAll();
  const norm = queries
    .map((q) => q.toLowerCase().trim())
    .filter((q) => q.length >= 2);
  if (norm.length === 0) return [];
  return all
    .filter((t) => {
      const title = (t.title ?? "").toLowerCase();
      return norm.some((q) => title.includes(q));
    })
    .sort(
      (a, b) =>
        ((b.metadata as any)?.play_count ?? 0) -
        ((a.metadata as any)?.play_count ?? 0),
    );
}
