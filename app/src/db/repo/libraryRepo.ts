import type { LibraryTrack } from "../../types";
import { getDb } from "../client";
import { toRow, fromRow, LibraryTrackRow } from "../codec/libraryTrack";

const COLUMNS =
  `id, path, origin, title, artist, album, duration_ms, added_at, metadata_json`;

export async function insertTrack(t: LibraryTrack): Promise<void> {
  const row = toRow(t);
  const db = await getDb();
  await db.execute(
    `INSERT INTO library_tracks (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.path, row.origin, row.title, row.artist, row.album, row.duration_ms, row.added_at, row.metadata_json],
  );
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
export async function deleteTrackCascade(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM library_lyrics_embeddings WHERE track_id = ?",
    [id],
  );
  await db.execute("DELETE FROM library_features WHERE track_id = ?", [id]);
  await db.execute("DELETE FROM library_tracks WHERE id = ?", [id]);
}
