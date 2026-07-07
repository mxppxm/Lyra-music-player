// extractFeatures — Sprint 9
// Thin wrapper around the Rust audio_extract_features tauri command.
// Returns null on any error so caller can silently skip the row.

import { invoke } from "@tauri-apps/api/core";

export type AudioFeatures = {
  energy: number;
  valence: number;
  duration_ms: number;
};

export async function extractFeatures(
  path: string,
): Promise<AudioFeatures | null> {
  try {
    return await invoke<AudioFeatures>("audio_extract_features", { path });
  } catch {
    return null;
  }
}
