import { describe, it, expect } from "vitest";
import { clampTuning, resolveThresholds, DEFAULT_TUNING } from "./tuning";

describe("clampTuning", () => {
  it("returns empty when input is undefined", () => {
    expect(clampTuning(undefined)).toEqual({});
  });

  it("preserves values within ±50% of default", () => {
    const t = clampTuning({ skipRatio: 0.5, idleRatio: 0.06 });
    expect(t.skipRatio).toBe(0.5);
    expect(t.idleRatio).toBe(0.06);
  });

  it("clamps values above +50% down", () => {
    const t = clampTuning({ dismissThreshold: 10 });
    expect(t.dismissThreshold).toBe(3); // 2 * 1.5
  });

  it("clamps values below -50% up", () => {
    const t = clampTuning({ dismissThreshold: 0.1 });
    expect(t.dismissThreshold).toBe(1); // 2 * 0.5
  });

  it("drops non-numeric / NaN values", () => {
    const t = clampTuning({
      skipRatio: NaN,
      // @ts-expect-error runtime path
      idleRatio: "bogus",
    });
    expect(t.skipRatio).toBeUndefined();
    expect(t.idleRatio).toBeUndefined();
  });

  it("drops Infinity", () => {
    const t = clampTuning({ submitGapMs: Infinity });
    expect(t.submitGapMs).toBeUndefined();
  });
});

describe("resolveThresholds", () => {
  it("returns defaults when tuning is undefined", () => {
    expect(resolveThresholds(undefined)).toEqual(DEFAULT_TUNING);
  });

  it("overlays clamped overrides on defaults", () => {
    const r = resolveThresholds({ skipRatio: 0.4, dismissThreshold: 99 });
    expect(r.skipRatio).toBe(0.4);
    expect(r.dismissThreshold).toBe(3); // clamped to 2 * 1.5
    expect(r.idleRatio).toBe(DEFAULT_TUNING.idleRatio);
  });
});
