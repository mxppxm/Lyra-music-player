import { describe, it, expect } from "vitest";
import { RulePerceptionAgent } from "./RulePerceptionAgent";
import type { BehavioralFeatures } from "./aggregator";

const WIN = 5 * 60 * 1000;

function base(): BehavioralFeatures {
  return {
    windowMs: WIN,
    activeMs: WIN * 0.3,
    submits: 1,
    avgSubmitGapMs: NaN,
    totalChars: 20,
    skips: 0,
    completions: 0,
    skipRatio: 0,
    proactiveDismisses: 0,
    isBlurred: false,
    scrollEvents: 0,
    hoverDwellCount: 0,
    totalHoverDwellMs: 0,
    abandonedInputs: 0,
    focusIdleMs: 0,
    keyActiveCount: 0,
    mouseActiveCount: 0,
    activityDensity: 0,
    weatherCode: null,
  };
}

describe("RulePerceptionAgent.infer", () => {
  const agent = new RulePerceptionAgent();

  it("returns no-signal bias when no rule fires", async () => {
    const bias = await agent.infer(base());
    expect(bias.confidence).toBe(0);
    expect(bias.reason).toBe("no signal");
    expect(bias.pad_bias).toEqual({ p: 0, a: 0, d: 0 });
  });

  it("Rule 1: high skip ratio fires when skipRatio >= 0.6 and N >= 3", async () => {
    const f: BehavioralFeatures = {
      ...base(),
      skips: 3,
      completions: 1,
      skipRatio: 3 / 4,
    };
    const bias = await agent.infer(f);
    expect(bias.reason).toContain("high skip ratio");
    expect(bias.pad_bias.p).toBeCloseTo(-0.2, 5);
    expect(bias.pad_bias.a).toBeCloseTo(0.1, 5);
    expect(bias.confidence).toBe(0.5);
  });

  it("Rule 2: long idle fires when isBlurred and activeMs/windowMs < 0.05", async () => {
    const f: BehavioralFeatures = {
      ...base(),
      isBlurred: true,
      activeMs: WIN * 0.02,
    };
    const bias = await agent.infer(f);
    expect(bias.reason).toContain("extended blur/idle");
    expect(bias.pad_bias.a).toBeCloseTo(-0.3, 5);
    expect(bias.confidence).toBe(0.4);
  });

  it("Rule 3: rapid submits fires when avgSubmitGapMs < 15000 and submits >= 3", async () => {
    const f: BehavioralFeatures = {
      ...base(),
      submits: 4,
      avgSubmitGapMs: 8_000,
    };
    const bias = await agent.infer(f);
    expect(bias.reason).toContain("rapid succession");
    expect(bias.pad_bias.a).toBeCloseTo(0.2, 5);
    expect(bias.pad_bias.d).toBeCloseTo(0.1, 5);
    expect(bias.confidence).toBe(0.5);
  });

  it("Rule 4: proactive dismisses fires when proactiveDismisses >= 2", async () => {
    const f: BehavioralFeatures = {
      ...base(),
      proactiveDismisses: 2,
    };
    const bias = await agent.infer(f);
    expect(bias.reason).toContain("user dismissing");
    expect(bias.pad_bias.p).toBeCloseTo(-0.15, 5);
    expect(bias.confidence).toBe(0.6);
  });

  it("Rule 5: high completion fires when completions >= 3 and skips = 0", async () => {
    const f: BehavioralFeatures = {
      ...base(),
      completions: 3,
      skips: 0,
      skipRatio: 0,
    };
    const bias = await agent.infer(f);
    expect(bias.reason).toContain("sustained listens");
    expect(bias.pad_bias.p).toBeCloseTo(0.15, 5);
    expect(bias.confidence).toBe(0.5);
  });

  describe("PerceptionTuning overrides (Sprint 8 T3)", () => {
    it("lowered skipRatio threshold makes rule 1 fire earlier", async () => {
      const tuned = new RulePerceptionAgent({ skipRatio: 0.4 });
      const f: BehavioralFeatures = {
        ...base(),
        skips: 2,
        completions: 3,
        skipRatio: 0.4,
      };
      const bias = await tuned.infer(f);
      expect(bias.reason).toContain("high skip ratio");
    });

    it("raised dismissThreshold makes rule 4 stop firing at old count", async () => {
      const tuned = new RulePerceptionAgent({ dismissThreshold: 3 });
      const f: BehavioralFeatures = { ...base(), proactiveDismisses: 2 };
      const bias = await tuned.infer(f);
      // Default agent would fire on 2; tuned raises to 3 → no fire.
      expect(bias.confidence).toBe(0);
    });

    it("raised completionThreshold suppresses rule 5", async () => {
      const tuned = new RulePerceptionAgent({ completionThreshold: 4 });
      const f: BehavioralFeatures = { ...base(), completions: 3, skips: 0, skipRatio: 0 };
      const bias = await tuned.infer(f);
      expect(bias.confidence).toBe(0);
    });

    it("clamps runaway overrides to ±50% of default (safety valve)", async () => {
      // dismissThreshold default is 2; a suggestion of 100 must clamp to 3.
      const tuned = new RulePerceptionAgent({ dismissThreshold: 100 });
      const f: BehavioralFeatures = { ...base(), proactiveDismisses: 3 };
      const bias = await tuned.infer(f);
      expect(bias.reason).toContain("user dismissing");
    });

    it("undefined overrides fall back to defaults", async () => {
      const tuned = new RulePerceptionAgent({});
      const f: BehavioralFeatures = { ...base(), proactiveDismisses: 2 };
      const bias = await tuned.infer(f);
      expect(bias.reason).toContain("user dismissing");
    });
  });

  it("multiple rules combine via confidence-weighted average; confidence capped at 1", async () => {
    // Fire Rule 3 (rapid submits, conf=0.5) + Rule 4 (proactive dismisses, conf=0.6)
    const f: BehavioralFeatures = {
      ...base(),
      submits: 4,
      avgSubmitGapMs: 5_000,
      proactiveDismisses: 3,
    };
    const bias = await agent.infer(f);

    // confidence = min(0.5 + 0.6, 1.0) = 1.0
    expect(bias.confidence).toBe(1.0);

    // reason concatenates both
    expect(bias.reason).toContain("rapid succession");
    expect(bias.reason).toContain("user dismissing");

    // weighted-avg pad_bias:
    // p: (0*0.5 + -0.15*0.6) / 1.1 = -0.09/1.1
    // a: (0.2*0.5 + 0*0.6) / 1.1 = 0.1/1.1
    // d: (0.1*0.5 + 0*0.6) / 1.1 = 0.05/1.1
    expect(bias.pad_bias.p).toBeCloseTo(-0.09 / 1.1, 5);
    expect(bias.pad_bias.a).toBeCloseTo(0.1 / 1.1, 5);
    expect(bias.pad_bias.d).toBeCloseTo(0.05 / 1.1, 5);
  });

  it("fatigue_high fires on dense keyboard activity", async () => {
    const f: BehavioralFeatures = {
      ...base(),
      activityDensity: 0.5,
      keyActiveCount: 30,
      mouseActiveCount: 10,
      isBlurred: false,
    };
    const bias = await agent.infer(f);
    expect(bias.reason).toContain("fatigue");
    expect(bias.pad_bias.p).toBeCloseTo(-0.2, 5);
  });

  it("weatherCode contributes a soft bias", async () => {
    const f: BehavioralFeatures = {
      ...base(),
      weatherCode: 61, // rain
    };
    const bias = await agent.infer(f);
    expect(bias.reason).toContain("rain");
    expect(bias.pad_bias.p).toBeLessThan(0);
    expect(bias.confidence).toBeGreaterThan(0);
  });

  describe("Sprint 13 rules", () => {
    const baseF = {
      windowMs: 60_000,
      activeMs: 0,
      submits: 0,
      avgSubmitGapMs: NaN,
      totalChars: 0,
      skips: 0,
      completions: 0,
      skipRatio: 0,
      proactiveDismisses: 0,
      isBlurred: false,
      scrollEvents: 0,
      hoverDwellCount: 0,
      totalHoverDwellMs: 0,
      abandonedInputs: 0,
      focusIdleMs: 0,
      keyActiveCount: 0,
      mouseActiveCount: 0,
      activityDensity: 0,
      weatherCode: null,
    };

    it("attentive_hover fires when hoverDwellCount >= threshold", async () => {
      const agent = new RulePerceptionAgent();
      const bias = await agent.infer({ ...baseF, hoverDwellCount: 3 });
      expect(bias.reason).toContain("hover dwell");
      expect(bias.pad_bias.p).toBeGreaterThan(0);
    });

    it("attentive_hover also fires when hoverDwellRatio triggers", async () => {
      const agent = new RulePerceptionAgent();
      const bias = await agent.infer({
        ...baseF,
        hoverDwellCount: 1,
        totalHoverDwellMs: 12000, // 12000/60000 = 0.20 > 0.15
      });
      expect(bias.reason).toContain("hover dwell");
    });

    it("hesitant_input fires when abandonedInputs >= threshold; pushes P/A/D negative", async () => {
      const agent = new RulePerceptionAgent();
      const bias = await agent.infer({ ...baseF, abandonedInputs: 3 });
      expect(bias.reason).toContain("hesitation");
      expect(bias.pad_bias.p).toBeLessThan(0);
      expect(bias.pad_bias.a).toBeLessThan(0);
      expect(bias.pad_bias.d).toBeLessThan(0);
    });

    it("quiet_presence fires only when in-room (not blurred) AND focusIdleMs/windowMs>0.5 AND activeMs low", async () => {
      const agent = new RulePerceptionAgent();
      const fires = await agent.infer({
        ...baseF,
        focusIdleMs: 35_000, // 35/60 = 0.58 > 0.5
        activeMs: 3_000, // 3/60 = 0.05 < 0.1
      });
      expect(fires.reason).toContain("quiet presence");

      const noFire = await agent.infer({
        ...baseF,
        isBlurred: true,
        focusIdleMs: 40_000,
        activeMs: 0,
      });
      expect(noFire.reason).not.toContain("quiet presence");
    });

    it("multiple new rules fire together, confidence-weighted average is used", async () => {
      const agent = new RulePerceptionAgent();
      const bias = await agent.infer({
        ...baseF,
        hoverDwellCount: 3,
        abandonedInputs: 3,
        focusIdleMs: 40_000,
        activeMs: 2_000,
      });
      // three new rules should all be in the reason chain
      expect(bias.reason).toContain("hover dwell");
      expect(bias.reason).toContain("hesitation");
      expect(bias.reason).toContain("quiet presence");
      // confidence is a positive number capped at 1
      expect(bias.confidence).toBeGreaterThan(0);
      expect(bias.confidence).toBeLessThanOrEqual(1);
    });
  });
});

