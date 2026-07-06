import { invoke } from "@tauri-apps/api/core";
import { findByPath, insertTrack } from "../db/repo/libraryRepo";
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

export async function importLibrary(rootPath: string): Promise<number> {
  const scanned = await scanLibrary(rootPath);
  let inserted = 0;
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
    inserted++;
  }
  return inserted;
}
