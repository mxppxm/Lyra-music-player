// libraryFeaturesRepo — Sprint 9
// CRUD for the previously-unused library_features table. Populated by the
// Rust audio_features extractor after each track import.

import { getDb } from "../client";

export type LibraryFeatures = {
  track_id: string;
  bpm: number | null;
  energy: number | null;
  valence: number | null;
};

type Row = {
  track_id: string;
  bpm: number | null;
  energy: number | null;
  valence: number | null;
};

export async function upsert(f: LibraryFeatures): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO library_features (track_id, bpm, energy, valence)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(track_id) DO UPDATE SET
       bpm = excluded.bpm,
       energy = excluded.energy,
       valence = excluded.valence`,
    [f.track_id, f.bpm, f.energy, f.valence],
  );
}

export async function getByTrackId(id: string): Promise<LibraryFeatures | null> {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT track_id, bpm, energy, valence FROM library_features WHERE track_id = ?`,
    [id],
  );
  return rows.length === 0 ? null : rows[0];
}

export async function getBatch(ids: string[]): Promise<Map<string, LibraryFeatures>> {
  if (ids.length === 0) return new Map();
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.select<Row[]>(
    `SELECT track_id, bpm, energy, valence FROM library_features WHERE track_id IN (${placeholders})`,
    ids,
  );
  const out = new Map<string, LibraryFeatures>();
  for (const r of rows) out.set(r.track_id, r);
  return out;
}
