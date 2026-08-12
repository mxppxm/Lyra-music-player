// moodSummary/summarizeMood.test.ts — 心情总结数据层测试。

import { describe, it, expect } from "vitest";
import type { DialogueTurn, PAD } from "../types/dialogue";
import {
  extractPadSeries,
  computeMoodTrajectory,
  aggregateByPeriod,
  summarizeMood,
  trajectoryStat,
} from "./summarizeMood";

function turn(ts: number, pad: PAD): DialogueTurn {
  return {
    id: `t${ts}`,
    timestamp: ts,
    current_emotion: { pad, labels: [], confidence: 0.8, source: "emotion-agent-inferred" },
    user_utterance: { modality: "text", content: "hi" },
    agent_response: { song_id: "s1", rationale: "x" },
    user_reaction: {
      behavioral: { listen_duration_ms: 1000, completed: true, skipped: false, repeated: 0, volume_delta: 0 },
    },
    emotion_delta: { p: 0, a: 0, d: 0 },
  };
}

describe("extractPadSeries", () => {
  it("sorts by ts and keeps only turns with a pad", () => {
    const series = extractPadSeries([
      turn(3000, { p: 0.5, a: 0.1, d: 0 }),
      turn(1000, { p: -0.2, a: 0.3, d: 0.1 }),
    ]);
    expect(series.map((p) => p.ts)).toEqual([1000, 3000]);
  });

  it("returns empty for no turns", () => {
    expect(extractPadSeries([])).toEqual([]);
  });
});

describe("trajectoryStat", () => {
  const series = extractPadSeries([
    turn(1, { p: 0.1, a: 0, d: 0 }),
    turn(2, { p: 0.5, a: 0, d: 0 }),
    turn(3, { p: -0.3, a: 0, d: 0 }),
  ]);

  it("computes start/end/max/min/mean/spread on one axis", () => {
    const s = trajectoryStat(series, "p");
    expect(s).not.toBeNull();
    expect(s!.start).toBeCloseTo(0.1);
    expect(s!.end).toBeCloseTo(-0.3);
    expect(s!.max).toBeCloseTo(0.5);
    expect(s!.min).toBeCloseTo(-0.3);
    expect(s!.mean).toBeCloseTo(0.1);
    expect(s!.spread).toBeCloseTo(0.8);
  });
});

describe("computeMoodTrajectory", () => {
  it("returns null on empty series", () => {
    expect(computeMoodTrajectory([])).toBeNull();
  });

  it("reports flat series volatility ~0", () => {
    const series = extractPadSeries([
      turn(1, { p: 0.2, a: 0.1, d: 0.1 }),
      turn(2, { p: 0.2, a: 0.1, d: 0.1 }),
    ]);
    const t = computeMoodTrajectory(series)!;
    expect(t.volatility).toBeLessThan(0.1);
    expect(t.sample_count).toBe(2);
  });

  it("reports wild swings volatility near 1", () => {
    const series = extractPadSeries([
      turn(1, { p: 1, a: 1, d: 1 }),
      turn(2, { p: -1, a: -1, d: -1 }),
    ]);
    const t = computeMoodTrajectory(series)!;
    expect(t.volatility).toBeGreaterThan(0.9);
    expect(t.start_pad.p).toBe(1);
    expect(t.end_pad.p).toBe(-1);
  });
});

describe("aggregateByPeriod", () => {
  it("groups pads into time periods with mean pad", () => {
    // 10:00 → morning, 15:00 → afternoon, 22:00 → night
    const base = new Date("2026-08-05T10:00:00+08:00").getTime();
    const series = extractPadSeries([
      turn(base, { p: 0.4, a: 0.2, d: 0.1 }),
      turn(base + 5 * 3600_000, { p: 0.6, a: 0.1, d: 0 }),
      turn(base + 12 * 3600_000, { p: 0.2, a: 0.4, d: 0.2 }),
    ]);
    const agg = aggregateByPeriod(series);
    const morning = agg.find((p) => p.period === "morning");
    const afternoon = agg.find((p) => p.period === "afternoon");
    const night = agg.find((p) => p.period === "night");
    expect(morning).toBeDefined();
    expect(morning!.count).toBe(1);
    expect(afternoon!.mean_pad.p).toBeCloseTo(0.6);
    expect(night!.count).toBe(1);
    expect(night!.label).toBe("20–23时");
  });

  it("orders periods chronologically, not alphabetically by id", () => {
    // afternoon / evening / lunch / morning — alphabetical would be wrong
    const day = "2026-08-12T";
    const mk = (hh: string) =>
      turn(new Date(`${day}${hh}:00:00+08:00`).getTime(), {
        p: -0.25,
        a: -0.1,
        d: 0,
      });
    const series = extractPadSeries([
      mk("15"), // afternoon
      mk("19"), // evening
      mk("12"), // lunch
      mk("10"), // morning
    ]);
    const agg = aggregateByPeriod(series);
    expect(agg.map((p) => p.period)).toEqual([
      "morning",
      "lunch",
      "afternoon",
      "evening",
    ]);
  });
});

describe("summarizeMood", () => {
  it("returns null with no emotional turns", () => {
    expect(summarizeMood([])).toBeNull();
  });

  it("produces trajectory + periods + window", () => {
    const base = new Date("2026-08-05T09:00:00+08:00").getTime();
    const data = summarizeMood([
      turn(base, { p: -0.5, a: 0.3, d: 0 }),
      turn(base + 3600_000, { p: 0.3, a: 0.4, d: 0.1 }),
    ])!;
    expect(data.turn_count).toBe(2);
    expect(data.trajectory.sample_count).toBe(2);
    expect(data.window_start).toBe(base);
    expect(data.periods.length).toBeGreaterThan(0);
  });
});
