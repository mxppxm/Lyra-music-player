/**
 * perception/RulePerceptionAgent.ts — rule-based PerceptionBias inference.
 *
 * Deterministic. No LLM calls. All values in-memory. Extracted from the
 * original Sprint 4 PerceptionAgent so LLMPerceptionAgent (Sprint 7 T2) can
 * inject it as a fallback path.
 *
 * Sprint 8 T3: rule thresholds are no longer hardcoded — ReflectAgent
 * proposes clamped overrides via a PerceptionTuning snapshot loaded at
 * construction. See tuning.ts for the ±50% clamp.
 */

import type { PAD } from "../types";
import type { BehavioralFeatures } from "./aggregator";
import type { PerceptionAgent, PerceptionBias } from "./PerceptionAgent";
import type { PerceptionTuning } from "./tuning";
import { resolveThresholds } from "./tuning";

type Rule = {
  name: string;
  test: (f: BehavioralFeatures) => boolean;
  pad_bias: PAD;
  confidence: number;
  reason: string;
};

function buildRules(t: Required<PerceptionTuning>): Rule[] {
  return [
    {
      name: "high_skip_ratio",
      test: (f) => f.skipRatio >= t.skipRatio && f.skips + f.completions >= 3,
      pad_bias: { p: -0.2, a: 0.1, d: 0 },
      confidence: 0.5,
      reason: "high skip ratio suggests frustration",
    },
    {
      name: "long_idle",
      test: (f) => f.isBlurred && f.activeMs / f.windowMs < t.idleRatio,
      pad_bias: { p: 0, a: -0.3, d: 0 },
      confidence: 0.4,
      reason: "extended blur/idle suggests calm or away",
    },
    {
      name: "rapid_submits",
      test: (f) =>
        !Number.isNaN(f.avgSubmitGapMs) &&
        f.avgSubmitGapMs < t.submitGapMs &&
        f.submits >= 3,
      pad_bias: { p: 0, a: 0.2, d: 0.1 },
      confidence: 0.5,
      reason: "rapid succession suggests engaged agency",
    },
    {
      name: "proactive_dismisses",
      test: (f) => f.proactiveDismisses >= t.dismissThreshold,
      pad_bias: { p: -0.15, a: 0, d: 0 },
      confidence: 0.6,
      reason: "user dismissing suggests unwelcome or busy",
    },
    {
      name: "high_completion",
      test: (f) => f.completions >= t.completionThreshold && f.skips === 0,
      pad_bias: { p: 0.15, a: 0, d: 0 },
      confidence: 0.5,
      reason: "sustained listens suggest resonance",
    },
    {
      name: "attentive_hover",
      test: (f) =>
        (f.hoverDwellCount ?? 0) >= t.hoverDwellCountThreshold ||
        (f.totalHoverDwellMs ?? 0) / f.windowMs > t.hoverDwellRatioThreshold,
      pad_bias: { p: 0.1, a: 0.05, d: 0 },
      confidence: 0.4,
      reason: "hover dwell suggests attention to ambient",
    },
    {
      name: "hesitant_input",
      test: (f) => (f.abandonedInputs ?? 0) >= t.abandonedInputsThreshold,
      pad_bias: { p: -0.1, a: -0.1, d: -0.15 },
      confidence: 0.5,
      reason: "typed-then-discarded suggests hesitation",
    },
    {
      name: "quiet_presence",
      test: (f) =>
        !f.isBlurred &&
        (f.focusIdleMs ?? 0) / f.windowMs > t.quietPresenceRatioThreshold &&
        f.activeMs / f.windowMs < 0.1,
      pad_bias: { p: 0.05, a: -0.2, d: 0 },
      confidence: 0.6,
      reason: "in the room, listening — quiet presence",
    },
  ];
}

const NULL_BIAS: PerceptionBias = {
  pad_bias: { p: 0, a: 0, d: 0 },
  confidence: 0,
  reason: "no signal",
};

export class RulePerceptionAgent implements PerceptionAgent {
  private rules: Rule[];

  constructor(tuning?: PerceptionTuning) {
    this.rules = buildRules(resolveThresholds(tuning));
  }

  async infer(features: BehavioralFeatures): Promise<PerceptionBias> {
    const fired = this.rules.filter((r) => r.test(features));
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
