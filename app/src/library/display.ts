import type { LibraryTrack } from "../types";

/**
 * Extract a human-readable title from a track.
 * Prefers the metadata title; falls back to the file basename without extension.
 */
export function songDisplayTitle(track: LibraryTrack): string {
  const raw = track.title?.trim();
  if (raw) return raw;
  return basenameNoExt(track.path);
}

/**
 * Extract a human-readable artist from a track.
 * Returns empty string when metadata is missing — callers should skip
 * rendering the artist line when this is empty rather than showing "· ".
 */
export function songDisplayArtist(track: LibraryTrack): string {
  return track.artist?.trim() ?? "";
}

function basenameNoExt(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const base = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const lastDot = base.lastIndexOf(".");
  return lastDot > 0 ? base.slice(0, lastDot) : base;
}
