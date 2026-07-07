import type { ProactiveIntent, RuleContext, DreamSeed } from "./types";

/**
 * Morning rule — fires on the first app open of the day within [05:00, 12:00).
 * Sets urgency = 0.5 and hint = "早上第一次打开".
 * If dreamSeeds contains a morning-kind seed, its hint and songHint are preferred.
 */
export function morningRule(ctx: RuleContext): ProactiveIntent | null {
  const { now, todayFirstOpen, dreamSeeds, todayKindCount } = ctx;

  // Must be the first open of the day
  if (!todayFirstOpen) return null;

  // Must be in morning hours [5, 12)
  const hour = now.getHours();
  if (hour < 5 || hour >= 12) return null;

  // Must not have already fired a morning intent today
  if ((todayKindCount.morning ?? 0) > 0) return null;

  // Check for a morning dream seed
  const morningSeed = dreamSeeds.find((s: DreamSeed) => s.kind === "morning");

  const createdAt = now.getTime();
  const intent: ProactiveIntent = {
    id: crypto.randomUUID(),
    createdAt,
    validUntil: createdAt + 30 * 60_000,
    kind: "morning",
    urgency: 0.5,
    hint: morningSeed?.hint ?? "早上第一次打开",
    targetProfile: morningSeed ? (morningSeed.hint ?? "morning") : undefined,
    ...(morningSeed
      ? {
          seed: {
            reflectDreamISO: morningSeed.createdISO,
            songHint: morningSeed.hint,
          },
        }
      : undefined),
  };

  return intent;
}

// v0.2 stub — real implementation deferred to follow-up sprint
export function careRule(_ctx: RuleContext): ProactiveIntent | null {
  return null;
}

// v0.2 stub — real implementation deferred to follow-up sprint
export function anniversaryRule(_ctx: RuleContext): ProactiveIntent | null {
  return null;
}

// v0.2 stub — real implementation deferred to follow-up sprint
export function shareRule(_ctx: RuleContext): ProactiveIntent | null {
  return null;
}

// v0.2 stub — real implementation deferred to follow-up sprint
export function rhythmRule(_ctx: RuleContext): ProactiveIntent | null {
  return null;
}
