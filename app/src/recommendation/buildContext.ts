import type { DialogueTurn, SoulState } from "../types";
import { getFeedbackStats } from "../db/repo/musicProfileRepo";
import * as libraryRepo from "../db/repo/libraryRepo";
import type { RecommendationContext, TrackFeedbackCounts } from "./types";
import { RECOMMENDATION_DEFAULTS } from "./types";
import {
  buildExcludeSet,
  buildFatigueMap,
  extractPlayHistory,
} from "./playHistory";

export type BuildContextOpts = {
  /** Total tracks in library — auto-fetched when omitted. */
  librarySize?: number;
  turns?: DialogueTurn[];
};

/**
 * Build the full recommendation context for one selection turn.
 * Call once at the start of runTurnWithEmotion / fulfillProactive.
 */
export async function buildRecommendationContext(
  soul: SoulState,
  opts: BuildContextOpts = {},
): Promise<RecommendationContext> {
  let turns = opts.turns;
  if (!turns) {
    const { listRecentTurns } = await import("../db/repo/turnRepo");
    turns = await listRecentTurns(RECOMMENDATION_DEFAULTS.HISTORY_SCAN_LIMIT);
  }

  let librarySize = opts.librarySize;
  if (librarySize === undefined) {
    try {
      const all = await libraryRepo.listAll();
      librarySize = all.length;
    } catch {
      librarySize = undefined;
    }
  }

  const recentPlays = extractPlayHistory(turns);
  const excludeIds = buildExcludeSet(recentPlays, {
    librarySize: opts.librarySize,
  });
  const fatigueByTrack = buildFatigueMap(recentPlays);

  const songIds = [...new Set(recentPlays.map((p) => p.songId))];
  let feedbackStats: ReadonlyMap<string, TrackFeedbackCounts> = new Map();
  if (songIds.length > 0) {
    try {
      feedbackStats = await getFeedbackStats(songIds);
    } catch {
      // feedback unavailable — proceed without
    }
  }

  const noveltySeeking = clamp01(soul.musical_taste_base.aesthetic_axes.novelty_seeking);

  return {
    excludeIds,
    fatigueByTrack,
    recentPlays,
    noveltySeeking,
    feedbackStats,
    soul,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
