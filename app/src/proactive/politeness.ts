import type { ProactiveIntent, PolitenessState, SkipReason, ProactiveKind } from "./types";

const COOLDOWNS: Record<ProactiveKind, number> = {
  morning: 24 * 3600_000,
  care: 6 * 3600_000,
  anniversary: 30 * 24 * 3600_000,
  share: 12 * 3600_000,
  rhythm: 90 * 60_000,
};

const KIND_BUDGETS: Record<ProactiveKind, number> = {
  morning: 1,
  care: 1,
  anniversary: 1,
  share: 1,
  rhythm: 2,
};

/**
 * Six hard-gate politeness check. Returns { pass: true } if the intent
 * is allowed to fire, or { pass: false; reason } with the first blocking
 * reason found (checks run in spec order §4.3).
 */
export function politenessGate(
  intent: ProactiveIntent,
  state: PolitenessState,
  now: number,
): { pass: true } | { pass: false; reason: SkipReason } {
  const { kind, urgency } = intent;

  // 1. Daily total budget (conservative mode drops limit to 1 — caller injects
  //    todayProactiveCount already adjusted, or passes a downgraded limit via
  //    the state object; here we read it directly).
  const dailyLimit = state.todayProactiveCount !== undefined
    ? (state as PolitenessState & { _dailyLimit?: number })._dailyLimit ?? 3
    : 3;
  if (state.todayProactiveCount >= dailyLimit) {
    return { pass: false, reason: "daily_limit" };
  }

  // 2. Per-kind budget
  const kindCount = state.todayKindCount[kind] ?? 0;
  if (kindCount >= KIND_BUDGETS[kind]) {
    return { pass: false, reason: "kind_budget" };
  }

  // 3. Per-kind cooldown
  const lastFire = state.lastKindFireAt[kind];
  if (lastFire !== undefined && now - lastFire < COOLDOWNS[kind]) {
    return { pass: false, reason: "cooldown" };
  }

  // 4. Focus or sleep — exempt only care with urgency >= 0.85
  if (state.isFocusOrSleep()) {
    const isHighUrgencyCare = kind === "care" && urgency >= 0.85;
    if (!isHighUrgencyCare) {
      return { pass: false, reason: "focus_or_sleep" };
    }
  }

  // 5. Sulk mode
  if (state.sulkUntil !== null && now < state.sulkUntil) {
    return { pass: false, reason: "sulk" };
  }

  // 6. Playing other source
  if (state.isPlayingOtherSource()) {
    return { pass: false, reason: "playing_other" };
  }

  return { pass: true };
}

export { COOLDOWNS, KIND_BUDGETS };
