import { invoke } from "@tauri-apps/api/core";
import { findByPath, insertTrack } from "../db/repo/libraryRepo";
import { upsert as upsertFeatures } from "../db/repo/libraryFeaturesRepo";
import { extractFeatures } from "./extractFeatures";
import type { LibraryTrack } from "../types";

export type ScannedTrack = {
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
};

export async function scanLibrary(rootPath: string): Promise<ScannedTrack[]> {
  return await invoke<ScannedTrack[]>("library_scan", { path: rootPath });
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function trackId(path: string, at: number): string {
  return `track-${at}-${Math.abs(hashCode(path))}`;
}

/** Sprint 9: run audio_extract_features against each newly-imported track and
 *  persist the result. Sequential (concurrency 1) so a large library doesn't
 *  fan out N decoders at once. Failures are per-track: one bad decode never
 *  blocks the rest. Returns the number of tracks that got features. */
export async function extractFeaturesForTracks(
  tracks: LibraryTrack[],
): Promise<number> {
  let extracted = 0;
  for (const t of tracks) {
    const f = await extractFeatures(t.path);
    if (!f) continue;
    try {
      await upsertFeatures({
        track_id: t.id,
        // Sprint 12: 0 means "detection inconclusive" — treat as unavailable
        // downstream rather than pretending 0 BPM is meaningful.
        bpm: f.bpm > 0 ? f.bpm : null,
        energy: f.energy,
        valence: f.valence,
      });
      extracted++;
    } catch {
      // best-effort; move on
    }
  }
  return extracted;
}

/** Sprint 10: run lyrics embedding pass. Sequential (concurrency 1) mirrors
 *  extractFeaturesForTracks. Missing lyrics / missing provider / network
 *  failure per-track → skip, keep going. Returns count embedded. */
export async function extractLyricsForTracks(
  tracks: LibraryTrack[],
): Promise<number> {
  const { computeLyricsEmbedding } = await import("./computeLyricsEmbedding");
  const { createEmbeddingProvider } = await import(
    "../providers/embeddingProvider"
  );
  const provider = await createEmbeddingProvider();
  if (!provider) return 0;
  let n = 0;
  for (const t of tracks) {
    if (await computeLyricsEmbedding(t.id, t.path, provider)) n++;
  }
  return n;
}

export type ImportOptions = {
  /** Await feature extraction before returning. Off by default so imports
   *  stay snappy; tests turn it on for determinism. */
  awaitFeatures?: boolean;
};

export async function importLibrary(
  rootPath: string,
  opts: ImportOptions = {},
): Promise<number> {
  const scanned = await scanLibrary(rootPath);
  const newTracks: LibraryTrack[] = [];
  const now = Date.now();
  for (const s of scanned) {
    const existing = await findByPath(s.path);
    if (existing) continue;
    const track: LibraryTrack = {
      id: trackId(s.path, now),
      path: s.path,
      origin: "local",
      title: s.title ?? undefined,
      artist: s.artist ?? undefined,
      album: s.album ?? undefined,
      duration_ms: s.duration_ms ?? undefined,
      added_at: now,
    };
    await insertTrack(track);
    newTracks.push(track);
  }
  // Sprint 9 + 10: feature extraction + lyrics embedding. Both fire-and-forget
  // so the "Imported N tracks" toast lands immediately; background loops
  // upsert as decodes / API calls finish. Each track is best-effort.
  if (newTracks.length > 0) {
    const pf = extractFeaturesForTracks(newTracks);
    const pl = extractLyricsForTracks(newTracks);
    if (opts.awaitFeatures) await Promise.all([pf, pl]);
    else {
      void pf.catch(() => {});
      void pl.catch(() => {});
    }
  }
  return newTracks.length;
}
