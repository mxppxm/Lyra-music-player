// db/repo/favoritesRepo.ts — 歌曲收藏（纯书签）

import { getDb } from "../client";

export type FavoriteRow = {
  song_id: string;
  favorited_at: number;
};

export async function isFavorite(songId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ song_id: string }[]>(
    `SELECT song_id FROM favorites WHERE song_id = ? LIMIT 1`,
    [songId],
  );
  return rows.length > 0;
}

export async function toggleFavorite(
  songId: string,
): Promise<{ favorited: boolean }> {
  const db = await getDb();
  const exists = await isFavorite(songId);
  if (exists) {
    await db.execute(`DELETE FROM favorites WHERE song_id = ?`, [songId]);
    return { favorited: false };
  }
  await db.execute(
    `INSERT INTO favorites (song_id, favorited_at) VALUES (?, ?)`,
    [songId, Date.now()],
  );
  return { favorited: true };
}

export async function listFavorites(limit = 200): Promise<FavoriteRow[]> {
  const db = await getDb();
  return db.select<FavoriteRow[]>(
    `SELECT song_id, favorited_at FROM favorites
     ORDER BY favorited_at DESC
     LIMIT ?`,
    [limit],
  );
}

/** Batch lookup for heart indicators in lists. */
export async function getFavoriteSongIds(
  songIds: string[],
): Promise<Set<string>> {
  if (songIds.length === 0) return new Set();
  const db = await getDb();
  const placeholders = songIds.map(() => "?").join(",");
  const rows = await db.select<{ song_id: string }[]>(
    `SELECT song_id FROM favorites WHERE song_id IN (${placeholders})`,
    songIds,
  );
  return new Set(rows.map((r) => r.song_id));
}
