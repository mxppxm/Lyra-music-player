// reloadLibrary — /reload-musics command backend.
//
// Wipes library_tracks (+ derived features and lyrics embeddings) then
// re-imports from the configured root path. Motivation: files renamed on
// disk after the initial import leave stale paths in library_tracks;
// playback then fails with "io: No such file or directory (os error 2)".
// A full reload rebuilds the path index from ground truth.
//
// Note: library_features / library_lyrics_embeddings declare
// `ON DELETE CASCADE` on track_id, but tauri-plugin-sql leaves the
// SQLite `foreign_keys` pragma OFF by default — so we delete children
// explicitly before parents rather than relying on cascade.

import { stopPlayback } from "../audio/player";
import { getDb } from "../db/client";
import { importLibrary } from "./libraryScan";
import { getSecret, SECRET_KEYS } from "../settings/secrets";

export type ReloadProgress =
  | { kind: "starting" }
  | { kind: "clearing" }
  | { kind: "scanning" }
  | { kind: "done"; imported: number }
  | { kind: "no-root" }
  | { kind: "failed"; message: string };

export async function reloadLibrary(
  onProgress?: (p: ReloadProgress) => void,
): Promise<ReloadProgress> {
  const emit = (p: ReloadProgress) => {
    onProgress?.(p);
    return p;
  };

  emit({ kind: "starting" });

  const root = await getSecret(SECRET_KEYS.libraryRootPath);
  if (!root) return emit({ kind: "no-root" });

  try {
    // Stop any active playback first — the sink holds an open File handle
    // for the current track, and we're about to remove its DB row.
    await stopPlayback().catch(() => {});

    emit({ kind: "clearing" });
    const db = await getDb();
    await db.execute("DELETE FROM library_lyrics_embeddings");
    await db.execute("DELETE FROM library_features");
    await db.execute("DELETE FROM library_tracks");

    emit({ kind: "scanning" });
    const imported = await importLibrary(root);
    return emit({ kind: "done", imported });
  } catch (err) {
    return emit({
      kind: "failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
