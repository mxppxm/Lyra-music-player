import type { LibraryTrack } from "../types";

function looksLikeMachineId(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^bili:/i.test(t)) return true;
  if (/^bili:__pending__:/i.test(t)) return true;
  if (/^BV[\w-]{6,}$/i.test(t)) return true;
  return false;
}

/**
 * Extract a human-readable title from a track.
 * Prefers metadata title; skips machine ids like `bili:BVxxx`;
 * falls back to raw_title / path basename.
 */
export function songDisplayTitle(
  track: Pick<LibraryTrack, "title" | "path" | "metadata">,
): string {
  const raw = track.title?.trim();
  if (raw && !looksLikeMachineId(raw)) return raw;

  const meta = track.metadata;
  const rawTitle =
    typeof meta?.raw_title === "string" ? meta.raw_title.trim() : "";
  if (rawTitle && !looksLikeMachineId(rawTitle)) return rawTitle;

  const fromPath = basenameNoExt(track.path);
  if (fromPath && !looksLikeMachineId(fromPath)) return fromPath;

  return raw || rawTitle || "未知曲目";
}

/**
 * Extract a human-readable artist from a track.
 * Returns empty string when metadata is missing — callers should skip
 * rendering the artist line when this is empty rather than showing "· ".
 */
export function songDisplayArtist(track: Pick<LibraryTrack, "artist">): string {
  return track.artist?.trim() ?? "";
}

function basenameNoExt(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const base = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const lastDot = base.lastIndexOf(".");
  return lastDot > 0 ? base.slice(0, lastDot) : base;
}
