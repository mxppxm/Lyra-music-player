import { describe, it, expect } from "vitest";
import { coarsen } from "./coarsening";
import type { BehavioralFeatures } from "./aggregator";

const base: BehavioralFeatures = {
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

describe("coarsen", () => {
  it("hover_attention buckets 0-1 low, 2-4 medium, 5+ high", () => {
    expect(coarsen({ ...base, hoverDwellCount: 0 }).hover_attention).toBe("low");
    expect(coarsen({ ...base, hoverDwellCount: 1 }).hover_attention).toBe("low");
    expect(coarsen({ ...base, hoverDwellCount: 2 }).hover_attention).toBe("medium");
    expect(coarsen({ ...base, hoverDwellCount: 4 }).hover_attention).toBe("medium");
    expect(coarsen({ ...base, hoverDwellCount: 5 }).hover_attention).toBe("high");
  });

  it("input_hesitation buckets 0 none, 1-2 some, 3+ many", () => {
    expect(coarsen({ ...base, abandonedInputs: 0 }).input_hesitation).toBe("none");
    expect(coarsen({ ...base, abandonedInputs: 1 }).input_hesitation).toBe("some");
    expect(coarsen({ ...base, abandonedInputs: 2 }).input_hesitation).toBe("some");
    expect(coarsen({ ...base, abandonedInputs: 3 }).input_hesitation).toBe("many");
  });

  it("quiet_presence buckets focusIdleMs/windowMs at 0.2 and 0.5", () => {
    expect(coarsen({ ...base, focusIdleMs: 0 }).quiet_presence).toBe("low");
    expect(coarsen({ ...base, focusIdleMs: 12_000 }).quiet_presence).toBe("medium"); // 0.20
    expect(coarsen({ ...base, focusIdleMs: 20_000 }).quiet_presence).toBe("medium");
    expect(coarsen({ ...base, focusIdleMs: 30_000 }).quiet_presence).toBe("high"); // 0.50
    expect(coarsen({ ...base, focusIdleMs: 45_000 }).quiet_presence).toBe("high");
  });

  it("scroll_activity buckets 0-2 low, 3-9 medium, 10+ high", () => {
    expect(coarsen({ ...base, scrollEvents: 0 }).scroll_activity).toBe("low");
    expect(coarsen({ ...base, scrollEvents: 3 }).scroll_activity).toBe("medium");
    expect(coarsen({ ...base, scrollEvents: 9 }).scroll_activity).toBe("medium");
    expect(coarsen({ ...base, scrollEvents: 10 }).scroll_activity).toBe("high");
  });

  it("handles zero windowMs by treating quiet_presence as 'low' (not NaN/crash)", () => {
    expect(coarsen({ ...base, windowMs: 0, focusIdleMs: 999 }).quiet_presence).toBe("low");
  });
});
