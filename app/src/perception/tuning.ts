/**
 * perception/tuning.ts — bounded threshold overrides for RulePerceptionAgent
 * (Sprint 8 T3).
 *
 * ReflectAgent proposes these values based on recent perception_audit rows;
 * clampTuning() guarantees a runaway suggestion can shift a rule threshold
 * by at most ±50% before it takes effect.
 */

export type PerceptionTuning = {
  /** Rule 1 · skipRatio ≥ N triggers frustration bias. Default 0.6. */
  skipRatio?: number;
  /** Rule 2 · activeMs / windowMs < N triggers idle bias. Default 0.05. */
  idleRatio?: number;
  /** Rule 3 · avgSubmitGapMs < N triggers rapid-engagement bias. Default 15000. */
  submitGapMs?: number;
  /** Rule 4 · proactiveDismisses ≥ N triggers unwelcome bias. Default 2. */
  dismissThreshold?: number;
  /** Rule 5 · completions ≥ N + skips = 0 triggers resonance bias. Default 3. */
  completionThreshold?: number;
};

export const DEFAULT_TUNING: Required<PerceptionTuning> = {
  skipRatio: 0.6,
  idleRatio: 0.05,
  submitGapMs: 15_000,
  dismissThreshold: 2,
  completionThreshold: 3,
};

/** Clamp each supplied override so it lands within ±50% of the default. Any
 *  non-numeric / NaN value is dropped so the rule falls back to default. */
export function clampTuning(t: PerceptionTuning | undefined): PerceptionTuning {
  if (!t) return {};
  const out: PerceptionTuning = {};
  for (const key of Object.keys(DEFAULT_TUNING) as Array<keyof PerceptionTuning>) {
    const raw = t[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const def = DEFAULT_TUNING[key];
    const lo = def * 0.5;
    const hi = def * 1.5;
    out[key] = Math.max(lo, Math.min(hi, raw));
  }
  return out;
}

/** Merge overrides onto defaults, returning a full thresholds object. */
export function resolveThresholds(
  t: PerceptionTuning | undefined,
): Required<PerceptionTuning> {
  const clamped = clampTuning(t);
  return { ...DEFAULT_TUNING, ...clamped };
}
