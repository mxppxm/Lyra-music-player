// lyricsExtract — Sprint 10
// Thin wrapper around the Rust lyrics_extract tauri command. Returns null
// on any error / no lyrics so caller can silently skip.

import { invoke } from "@tauri-apps/api/core";

export async function lyricsExtract(path: string): Promise<string | null> {
  try {
    const res = await invoke<string | null>("lyrics_extract", { path });
    return res ?? null;
  } catch {
    return null;
  }
}
