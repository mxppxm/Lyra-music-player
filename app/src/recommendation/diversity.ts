import type { TrackFeedbackCounts } from "./types";

/** How much of the candidate pool comes from deep catalog vs top scores. */
export function diversitySplit(noveltySeeking: number): { topRatio: number; diverseRatio: number } {
  const ns = clamp01(noveltySeeking);
  const diverseRatio = 0.15 + ns * 0.55; // 15% – 70% from outside top band
  return { topRatio: 1 - diverseRatio, diverseRatio };
}

/** Weight applied to fatigue penalty — higher novelty → less penalty, more exploration. */
export function fatiguePenaltyWeight(noveltySeeking: number): number {
  const ns = clamp01(noveltySeeking);
  return 0.45 - ns * 0.25; // 0.45 (conservative) → 0.20 (exploratory)
}

/** Weight applied to historical skip feedback. */
export function feedbackPenaltyWeight(noveltySeeking: number): number {
  const ns = clamp01(noveltySeeking);
  return 0.15 + (1 - ns) * 0.15; // 0.30 → 0.15
}

/** Penalty in [0, weight] from skip/complete history. */
export function feedbackPenalty(
  stats: TrackFeedbackCounts | undefined,
  noveltySeeking: number,
): number {
  if (!stats) return 0;
  const total = stats.skipped + stats.completed + stats.repeated;
  if (total === 0) return 0;

  const skipRatio = stats.skipped / total;
  const repeatRatio = stats.repeated / total;
  const weight = feedbackPenaltyWeight(noveltySeeking);
  return Math.min(weight, skipRatio * weight + repeatRatio * weight * 0.5);
}

/** Fisher-Yates shuffle (in-place copy). */
export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick `count` items from `scored` using stratified sampling:
 * - topRatio from highest scores (shuffled within band for tie-breaking)
 * - diverseRatio from the remainder (random)
 */
export function stratifiedSample<T>(
  scored: { item: T; score: number }[],
  limit: number,
  noveltySeeking: number,
): T[] {
  if (scored.length === 0) return [];
  if (scored.length <= limit) return scored.map((s) => s.item);

  const { topRatio } = diversitySplit(noveltySeeking);
  const topCount = Math.round(limit * topRatio);
  const diverCount = limit - topCount;

  const topBand = shuffle(scored.slice(0, Math.max(topCount * 2, topCount)));
  const top = topBand.slice(0, topCount).map((s) => s.item);
  const picked = new Set<T>(top);

  const rest = scored.filter((s) => !picked.has(s.item));
  const divers = shuffle(rest).slice(0, diverCount).map((s) => s.item);
  for (const d of divers) picked.add(d);

  const result = [...top, ...divers];
  for (const s of scored) {
    if (result.length >= limit) break;
    if (!picked.has(s.item)) {
      result.push(s.item);
      picked.add(s.item);
    }
  }

  return result.slice(0, limit);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
