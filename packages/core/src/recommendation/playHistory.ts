import type { DialogueTurn } from "../types";
import type { PlayHistoryEntry } from "./types";
import { RECOMMENDATION_DEFAULTS } from "./types";

/**
 * Extract ordered play history from dialogue turns (newest first).
 * Skips turns without a song_id in agent_response.
 */
export function extractPlayHistory(
  turns: DialogueTurn[],
  scanLimit = RECOMMENDATION_DEFAULTS.HISTORY_SCAN_LIMIT,
): PlayHistoryEntry[] {
  const entries: PlayHistoryEntry[] = [];
  const slice = turns.slice(0, scanLimit);

  for (let i = 0; i < slice.length; i++) {
    const turn = slice[i];
    const songId = turn.agent_response?.song_id;
    if (!songId) continue;

    const behavioral = turn.user_reaction?.behavioral;
    entries.push({
      songId,
      turnsAgo: i,
      timestamp: turn.timestamp,
      skipped: behavioral?.skipped ?? false,
      completed: behavioral?.completed ?? false,
    });
  }

  return entries;
}

/**
 * Build hard-exclude set from recent unique song ids.
 * When `librarySize` is smaller than the window, shrink the exclude set
 * so we never empty the pool — but never drop below `minExclude`.
 */
export function buildExcludeSet(
  recentPlays: readonly PlayHistoryEntry[],
  opts: {
    window?: number;
    librarySize?: number;
    minExclude?: number;
  } = {},
): ReadonlySet<string> {
  const window = opts.window ?? RECOMMENDATION_DEFAULTS.HARD_EXCLUDE_WINDOW;
  const minExclude = opts.minExclude ?? RECOMMENDATION_DEFAULTS.MIN_HARD_EXCLUDE;

  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  for (const entry of recentPlays) {
    if (seen.has(entry.songId)) continue;
    seen.add(entry.songId);
    uniqueIds.push(entry.songId);
    if (uniqueIds.length >= window) break;
  }

  let effectiveWindow = uniqueIds.length;
  if (opts.librarySize !== undefined && opts.librarySize > 0) {
    // Keep at least 1 candidate available after exclusion
    const maxExclude = Math.max(0, opts.librarySize - 1);
    effectiveWindow = Math.min(uniqueIds.length, maxExclude);
    effectiveWindow = Math.max(effectiveWindow, Math.min(minExclude, uniqueIds.length, maxExclude));
  }

  return new Set(uniqueIds.slice(0, effectiveWindow));
}

/**
 * Compute per-track fatigue in [0, 1] using exponential decay over turn distance.
 * Multiple appearances accumulate. Skipped songs get a small extra bump.
 */
export function buildFatigueMap(
  recentPlays: readonly PlayHistoryEntry[],
  fatigueWindow = RECOMMENDATION_DEFAULTS.FATIGUE_WINDOW,
): ReadonlyMap<string, number> {
  const raw = new Map<string, number>();
  const decay = fatigueWindow / 3;

  for (const entry of recentPlays) {
    if (entry.turnsAgo >= fatigueWindow) continue;

    const base = Math.exp(-entry.turnsAgo / decay);
    const skipBoost = entry.skipped ? 0.15 : 0;
    const prev = raw.get(entry.songId) ?? 0;
    raw.set(entry.songId, prev + base + skipBoost);
  }

  // Normalise to [0, 1]
  let max = 0;
  for (const v of raw.values()) max = Math.max(max, v);
  if (max <= 0) return raw;

  const out = new Map<string, number>();
  for (const [id, v] of raw) {
    out.set(id, Math.min(1, v / max));
  }
  return out;
}
