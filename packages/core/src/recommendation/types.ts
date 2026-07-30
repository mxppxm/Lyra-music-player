import type { SoulState } from "../types";

/** One row in the recent-play ledger derived from dialogue turns. */
export type PlayHistoryEntry = {
  songId: string;
  title?: string;
  /** 0 = most recently played */
  turnsAgo: number;
  timestamp: number;
  skipped: boolean;
  completed: boolean;
};

/** Aggregated feedback counts for a track. */
export type TrackFeedbackCounts = {
  completed: number;
  skipped: number;
  repeated: number;
};

/**
 * Full recommendation context passed through prefilter → companion.
 * Built once per turn from turn history, soul state, and feedback stats.
 */
export type RecommendationContext = {
  /** Hard-excluded song ids — never surface in candidates. */
  excludeIds: ReadonlySet<string>;
  /** Soft fatigue penalty per track, in [0, 1]. Higher = more recently/heavily played. */
  fatigueByTrack: ReadonlyMap<string, number>;
  /** Recent plays for Companion prompt (newest first). */
  recentPlays: readonly PlayHistoryEntry[];
  /** Soul aesthetic axis, clamped to [0, 1]. Drives diversity vs mood-match tradeoff. */
  noveltySeeking: number;
  /** Historical skip/complete/repeat counts keyed by track id. */
  feedbackStats: ReadonlyMap<string, TrackFeedbackCounts>;
  /** Source soul — kept for future tuning without re-threading every field. */
  soul: SoulState;
  /** Labels from EmotionAgent (e.g. 疲惫, 孤独) — used in prefilter mood match. */
  emotionLabels: readonly string[];
};

export const RECOMMENDATION_DEFAULTS = {
  /** Unique songs to hard-exclude from the candidate pool. */
  HARD_EXCLUDE_WINDOW: 20,
  /** Turns scanned when building fatigue + feedback context. */
  HISTORY_SCAN_LIMIT: 80,
  /** Turns contributing to soft fatigue decay. */
  FATIGUE_WINDOW: 60,
  /** Minimum hard-exclude before relaxing (when library is tiny). */
  MIN_HARD_EXCLUDE: 3,
} as const;
