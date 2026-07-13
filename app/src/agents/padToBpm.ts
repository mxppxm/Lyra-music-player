// padToBpm — map a PAD emotion vector to a target BPM window.
// arousal is the primary driver; dominance nudges the tempo slightly.
// pleasure is intentionally ignored — a slow ballad and a slow groove both
// fit low arousal regardless of valence.

import type { PAD } from "../types";

export type BpmTarget = {
  targetBpm: number;
  tolerance: number;
};

const BASE_BPM = 100;
const AROUSAL_SLOPE = 45;
const DOMINANCE_BOOST = 5;
const MIN_BPM = 50;
const MAX_BPM = 180;
const TOLERANCE_BPM = 22;

export function padToBpm(pad: PAD): BpmTarget {
  const arousal = clamp(pad.a, -1, 1);
  const dominance = clamp(pad.d, -1, 1);
  const raw = BASE_BPM + arousal * AROUSAL_SLOPE + dominance * DOMINANCE_BOOST;
  const targetBpm = Math.round(clamp(raw, MIN_BPM, MAX_BPM));
  return { targetBpm, tolerance: TOLERANCE_BPM };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
