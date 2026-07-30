/**
 * Audio feature extraction + caching layer.
 *
 * Maps Bilibili bvid → AudioFeatures extracted via the Rust backend's
 * rodio + rustfft pipeline (RMS energy + spectral centroid + BPM).
 *
 * Features are cached in `{appDataDir}/lyra-audio-features.json` so
 * each song is analyzed exactly once — download+transcode+FFT is
 * expensive and costs Bilibili bandwidth.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types (mirrors src-tauri/src/audio_features.rs) ─────────────────────────

export interface AudioFeatures {
  /** RMS energy, normalised to [0, 1]. Maps to PAD Arousal. */
  energy: number;
  /** Spectral centroid / Nyquist in [0, 1]. Maps to PAD Pleasure. */
  valence: number;
  /** Detected BPM in [60, 200] or 0 if undetectable. */
  bpm: number;
  /** Duration in milliseconds (from file header). */
  duration_ms: number;
}

/** PAD profile — Pleasure, Arousal, Dominance, each in [0, 1]. */
export interface PADProfile {
  p: number;
  a: number;
  d: number;
}

// ── Cache ────────────────────────────────────────────────────────────────────

type FeatureCache = Record<string, AudioFeatures>;

let cache: FeatureCache | null = null;
let cacheDirty = false;

/** Read the feature cache from disk. */
export async function readFeatureCache(): Promise<FeatureCache> {
  if (cache) return cache;
  let loaded: FeatureCache = {};
  try {
    const json = await invoke<string>("feature_cache_read");
    loaded = JSON.parse(json);
  } catch {
    // file doesn't exist yet — stay with empty cache
  }
  cache = loaded;
  return loaded;
}

/** Persist the feature cache to disk. */
export async function writeFeatureCache(): Promise<void> {
  if (!cacheDirty || !cache) return;
  try {
    await invoke("feature_cache_write", {
      content: JSON.stringify(cache as FeatureCache, null, 2),
    });
    cacheDirty = false;
  } catch (e) {
    console.warn("[audioFeatures] failed to write cache:", e);
  }
}

/**
 * Get features for a song by bvid. If not cached, downloads the audio,
 * extracts features via the Rust backend, and caches the result.
 */
export async function getOrAnalyzeFeatures(
  bvid: string,
  audioUrl: string,
): Promise<AudioFeatures | null> {
  // 1. Try cache
  const c = await readFeatureCache();
  if (c[bvid]) return c[bvid];

  // 2. Download + analyze via Rust
  try {
    const features: AudioFeatures = await invoke("analyze_audio_url", {
      url: audioUrl,
    });

    // 3. Cache it
    c[bvid] = features;
    cacheDirty = true;
    // Fire-and-forget persist (don't block the user)
    writeFeatureCache().catch(() => {});

    return features;
  } catch (e) {
    console.warn(`[audioFeatures] analyze failed for ${bvid}:`, e);
    return null;
  }
}

/**
 * Convert AudioFeatures to a PADProfile.
 *
 * Mapping rationale:
 * - energy (RMS) → Arousal: high RMS = loud/energetic = high arousal
 * - valence (spectral centroid) → Pleasure: bright spectrum → positive valence
 * - Dominance: derived from energy × (1 - |valence - 0.5|*2)
 *   High energy + extreme valence (very bright or very dark) → high dominance
 *   Low energy + mid valence → low dominance
 */
export function featuresToPAD(f: AudioFeatures): PADProfile {
  const p = f.valence;
  const a = f.energy;
  // Dominance: high when energy is high AND valence is extreme
  const valenceExtreme = 1 - Math.abs(f.valence - 0.5) * 2;
  const d = f.energy * valenceExtreme;
  return { p, a, d };
}

/**
 * Compute similarity between two PAD profiles.
 * Returns a score in [0, 1] where 1 = perfect match.
 * Uses Euclidean distance in PAD space, inverted and normalized.
 */
export function padSimilarity(a: PADProfile, b: PADProfile): number {
  const dp = a.p - b.p;
  const da = a.a - b.a;
  const dd = a.d - b.d;
  const dist = Math.sqrt(dp * dp + da * da + dd * dd);
  // Max possible distance in [0,1]³ cube is √3 ≈ 1.732
  return 1 - dist / Math.sqrt(3);
}
