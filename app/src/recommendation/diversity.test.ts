import { describe, it, expect } from "vitest";
import {
  diversitySplit,
  feedbackPenalty,
  stratifiedSample,
} from "./diversity";

describe("diversitySplit", () => {
  it("returns more diverse pool when novelty_seeking is high", () => {
    const low = diversitySplit(0);
    const high = diversitySplit(1);
    expect(high.diverseRatio).toBeGreaterThan(low.diverseRatio);
  });
});

describe("feedbackPenalty", () => {
  it("penalizes heavily skipped tracks more at low novelty", () => {
    const stats = { completed: 1, skipped: 9, repeated: 0 };
    const lowNov = feedbackPenalty(stats, 0);
    const highNov = feedbackPenalty(stats, 1);
    expect(lowNov).toBeGreaterThan(highNov);
  });
});

describe("stratifiedSample", () => {
  it("returns `limit` items from a larger scored pool", () => {
    const scored = Array.from({ length: 50 }, (_, i) => ({
      item: `t${i}`,
      score: 50 - i,
    }));
    const out = stratifiedSample(scored, 30, 0.5);
    expect(out).toHaveLength(30);
    const unique = new Set(out);
    expect(unique.size).toBe(30);
  });
});
