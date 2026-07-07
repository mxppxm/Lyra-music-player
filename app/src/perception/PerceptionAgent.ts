/**
 * perception/PerceptionAgent.ts — rule-based PerceptionBias inference (Sprint 4 T3)
 *
 * Deterministic. No LLM calls. All values in-memory.
 */

import type { PAD } from "../types";
import type { BehavioralFeatures } from "./aggregator";

export type PerceptionBias = {
  /** Additive PAD bias; all values in [-1, 1] before combining */
  pad_bias: PAD;
  /** 0..1 — how strongly to weight against user utterance */
  confidence: number;
  /** Human-readable trigger explanation */
  reason: string;
};

type Rule = {
  name: string;
  test: (f: BehavioralFeatures) => boolean;
  pad_bias: PAD;
  confidence: number;
  reason: string;
};

const RULES: Rule[] = [
  {
    name: "high_skip_ratio",
    test: (f) => f.skipRatio >= 0.6 && f.skips + f.completions >= 3,
    pad_bias: { p: -0.2, a: 0.1, d: 0 },
    confidence: 0.5,
    reason: "high skip ratio suggests frustration",
  },
  {
    name: "long_idle",
    test: (f) => f.isBlurred && f.activeMs / f.windowMs < 0.05,
    pad_bias: { p: 0, a: -0.3, d: 0 },
    confidence: 0.4,
    reason: "extended blur/idle suggests calm or away",
  },
  {
    name: "rapid_submits",
    test: (f) => !Number.isNaN(f.avgSubmitGapMs) && f.avgSubmitGapMs < 15_000 && f.submits >= 3,
    pad_bias: { p: 0, a: 0.2, d: 0.1 },
    confidence: 0.5,
    reason: "rapid succession suggests engaged agency",
  },
  {
    name: "proactive_dismisses",
    test: (f) => f.proactiveDismisses >= 2,
    pad_bias: { p: -0.15, a: 0, d: 0 },
    confidence: 0.6,
    reason: "user dismissing suggests unwelcome or busy",
  },
  {
    name: "high_completion",
    test: (f) => f.completions >= 3 && f.skips === 0,
    pad_bias: { p: 0.15, a: 0, d: 0 },
    confidence: 0.5,
    reason: "sustained listens suggest resonance",
  },
];

const NULL_BIAS: PerceptionBias = {
  pad_bias: { p: 0, a: 0, d: 0 },
  confidence: 0,
  reason: "no signal",
};

export class PerceptionAgent {
  infer(features: BehavioralFeatures): PerceptionBias {
    const fired = RULES.filter((r) => r.test(features));
    if (fired.length === 0) return NULL_BIAS;

    // Confidence-weighted average of pad_bias values; sum confidences capped at 1.
    let totalConf = 0;
    let wp = 0;
    let wa = 0;
    let wd = 0;

    for (const r of fired) {
      totalConf += r.confidence;
      wp += r.pad_bias.p * r.confidence;
      wa += r.pad_bias.a * r.confidence;
      wd += r.pad_bias.d * r.confidence;
    }

    const avgP = wp / totalConf;
    const avgA = wa / totalConf;
    const avgD = wd / totalConf;

    return {
      pad_bias: {
        p: clamp(avgP, -1, 1),
        a: clamp(avgA, -1, 1),
        d: clamp(avgD, -1, 1),
      },
      confidence: Math.min(totalConf, 1),
      reason: fired.map((r) => r.reason).join("; "),
    };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
