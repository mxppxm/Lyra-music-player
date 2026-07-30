import { describe, it, expect } from "vitest";
import { padToBpm } from "./padToBpm";

describe("padToBpm", () => {
  it("high arousal maps to ≥140 BPM", () => {
    const { targetBpm } = padToBpm({ p: 0, a: 1, d: 0 });
    expect(targetBpm).toBeGreaterThanOrEqual(140);
  });

  it("low arousal maps to ≤70 BPM", () => {
    const { targetBpm } = padToBpm({ p: 0, a: -1, d: 0 });
    expect(targetBpm).toBeLessThanOrEqual(70);
  });

  it("neutral arousal lands in the [95, 115] mid range", () => {
    const { targetBpm } = padToBpm({ p: 0, a: 0, d: 0 });
    expect(targetBpm).toBeGreaterThanOrEqual(95);
    expect(targetBpm).toBeLessThanOrEqual(115);
  });

  it("dominance nudges tempo up at the same arousal", () => {
    const withHighD = padToBpm({ p: 0, a: 0.5, d: 1 });
    const withLowD = padToBpm({ p: 0, a: 0.5, d: -1 });
    expect(withHighD.targetBpm).toBeGreaterThan(withLowD.targetBpm);
  });

  it("clamps target BPM into the [50, 180] musically-meaningful range", () => {
    const superHigh = padToBpm({ p: 0, a: 2, d: 2 });
    const superLow = padToBpm({ p: 0, a: -2, d: -2 });
    expect(superHigh.targetBpm).toBeLessThanOrEqual(180);
    expect(superLow.targetBpm).toBeGreaterThanOrEqual(50);
  });

  it("returns a positive tolerance window covering ±25 BPM of casual drift", () => {
    const { tolerance } = padToBpm({ p: 0, a: 0, d: 0 });
    expect(tolerance).toBeGreaterThan(0);
    expect(tolerance).toBeLessThanOrEqual(25);
    expect(tolerance).toBeGreaterThanOrEqual(15);
  });

  it("pleasure has no effect on tempo (arousal-driven)", () => {
    const sad = padToBpm({ p: -0.8, a: 0, d: 0 });
    const happy = padToBpm({ p: 0.8, a: 0, d: 0 });
    expect(sad.targetBpm).toBe(happy.targetBpm);
  });
});
