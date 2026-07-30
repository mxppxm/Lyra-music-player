// perception/coarsening.ts — level-string mapper for LLMPerceptionAgent input.
//
// Only the 4 new Sprint 13 dims are coarsened. The 10 pre-Sprint-13 dims stay
// numeric because LLMPerceptionAgent's prompt was tuned against those. This
// module exists solely to honor the website PRIVACY promise: raw new-dim
// counts never leave the local process over the network.

import type { BehavioralFeatures } from "./aggregator";

export type CoarseLevel = "low" | "medium" | "high";
export type HesitationLevel = "none" | "some" | "many";

export type CoarseSignals = {
  hover_attention: CoarseLevel;
  input_hesitation: HesitationLevel;
  quiet_presence: CoarseLevel;
  scroll_activity: CoarseLevel;
};

function bucket(value: number, [mid, hi]: [number, number]): CoarseLevel {
  if (!Number.isFinite(value) || value < mid) return "low";
  if (value < hi) return "medium";
  return "high";
}

function bucketHesitation(value: number): HesitationLevel {
  if (value <= 0) return "none";
  if (value < 3) return "some";
  return "many";
}

export function coarsen(f: BehavioralFeatures): CoarseSignals {
  const quietRatio =
    f.windowMs > 0 ? (f.focusIdleMs ?? 0) / f.windowMs : 0;
  return {
    hover_attention: bucket(f.hoverDwellCount ?? 0, [2, 5]),
    input_hesitation: bucketHesitation(f.abandonedInputs ?? 0),
    quiet_presence: bucket(quietRatio, [0.2, 0.5]),
    scroll_activity: bucket(f.scrollEvents ?? 0, [3, 10]),
  };
}
