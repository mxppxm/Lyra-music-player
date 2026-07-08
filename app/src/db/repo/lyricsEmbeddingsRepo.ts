// lyricsEmbeddingsRepo — Sprint 10
// Stores per-track lyrics embeddings. See spec §7.2.
//
// Encoding: embedding is stored as a raw little-endian f32 blob.
// SQLite blob ↔ JS: tauri-plugin-sql exchanges blobs as number[] (byte
// arrays). We convert via Float32Array + underlying ArrayBuffer.

import { getDb } from "../client";

export type LyricsEmbedding = {
  trackId: string;
  lyricsHash: string;
  modelId: string;
  dim: number;
  embedding: Float32Array;
  updatedAt: number;
};

type Row = {
  track_id: string;
  lyrics_hash: string;
  model_id: string;
  dim: number;
  embedding: number[] | Uint8Array;
  updated_at: number;
};

function encode(v: Float32Array): number[] {
  return Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
}

function decode(raw: number[] | Uint8Array, dim: number): Float32Array {
  // Silent-skip posture: any malformed blob (non-aligned byteLength, dim
  // mismatch, corruption) yields an empty vector. Downstream (LibraryAgent
  // cosine check) treats empty as "sem unavailable" and degrades cleanly.
  try {
    const u8 = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
    if (u8.byteLength % 4 !== 0) return new Float32Array(0);
    const buf = new ArrayBuffer(u8.byteLength);
    new Uint8Array(buf).set(u8);
    const out = new Float32Array(buf);
    return out.length === dim ? out : new Float32Array(0);
  } catch {
    return new Float32Array(0);
  }
}

export async function upsert(row: LyricsEmbedding): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO library_lyrics_embeddings
       (track_id, lyrics_hash, model_id, dim, embedding, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(track_id) DO UPDATE SET
       lyrics_hash = excluded.lyrics_hash,
       model_id    = excluded.model_id,
       dim         = excluded.dim,
       embedding   = excluded.embedding,
       updated_at  = excluded.updated_at`,
    [row.trackId, row.lyricsHash, row.modelId, row.dim,
     encode(row.embedding), row.updatedAt],
  );
}

export async function getByTrackId(id: string): Promise<LyricsEmbedding | null> {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT track_id, lyrics_hash, model_id, dim, embedding, updated_at
     FROM library_lyrics_embeddings WHERE track_id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    trackId: r.track_id,
    lyricsHash: r.lyrics_hash,
    modelId: r.model_id,
    dim: r.dim,
    embedding: decode(r.embedding, r.dim),
    updatedAt: r.updated_at,
  };
}

export async function getBatch(
  ids: string[],
): Promise<Map<string, LyricsEmbedding>> {
  if (ids.length === 0) return new Map();
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.select<Row[]>(
    `SELECT track_id, lyrics_hash, model_id, dim, embedding, updated_at
     FROM library_lyrics_embeddings WHERE track_id IN (${placeholders})`,
    ids,
  );
  const out = new Map<string, LyricsEmbedding>();
  for (const r of rows) {
    out.set(r.track_id, {
      trackId: r.track_id,
      lyricsHash: r.lyrics_hash,
      modelId: r.model_id,
      dim: r.dim,
      embedding: decode(r.embedding, r.dim),
      updatedAt: r.updated_at,
    });
  }
  return out;
}

export async function listMissing(currentModelId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM library_tracks
     WHERE id NOT IN (
       SELECT track_id FROM library_lyrics_embeddings WHERE model_id = ?
     )`,
    [currentModelId],
  );
  return rows.map((r) => r.id);
}

export async function countCoverage(): Promise<{
  total: number;
  withEmbedding: number;
  modelId: string | null;
}> {
  const db = await getDb();
  const rows = await db.select<
    { total: number; with_embedding: number; model_id: string | null }[]
  >(
    `SELECT
       (SELECT COUNT(*) FROM library_tracks) as total,
       (SELECT COUNT(*) FROM library_lyrics_embeddings) as with_embedding,
       (SELECT model_id FROM library_lyrics_embeddings LIMIT 1) as model_id`,
    [],
  );
  const r = rows[0] ?? { total: 0, with_embedding: 0, model_id: null };
  return {
    total: r.total,
    withEmbedding: r.with_embedding,
    modelId: r.model_id,
  };
}
