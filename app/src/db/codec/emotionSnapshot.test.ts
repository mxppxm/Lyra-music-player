import { describe, it, expect } from "vitest";
import { toRow, fromRow } from "./emotionSnapshot";
import type { CurrentEmotion } from "../../types";

const sampleEmotion: CurrentEmotion = {
  pad: { p: 0.3, a: -0.2, d: 0.1 },
  labels: ["疲惫", "有希望"],
  confidence: 0.82,
  source: "emotion-agent-inferred",
};

describe("emotionSnapshot codec", () => {
  it("round-trips a snapshot with turn_id", () => {
    const row = toRow(sampleEmotion, { id: "snap-1", timestamp: 1000, turnId: "turn-1" });
    expect(row.id).toBe("snap-1");
    expect(row.timestamp).toBe(1000);
    expect(row.turn_id).toBe("turn-1");
    expect(row.pad_p).toBe(0.3);
    expect(row.pad_a).toBe(-0.2);
    expect(row.pad_d).toBe(0.1);
    expect(row.confidence).toBe(0.82);
    expect(row.source).toBe("emotion-agent-inferred");
    expect(fromRow(row)).toEqual(sampleEmotion);
  });

  it("round-trips a snapshot without turn_id (standalone emotion sample)", () => {
    const row = toRow(sampleEmotion, { id: "snap-2", timestamp: 2000 });
    expect(row.turn_id).toBeNull();
    expect(fromRow(row)).toEqual(sampleEmotion);
  });

  it("fromRow drops predicted_trajectory (v0.2 feature; not persisted in 1a)", () => {
    const row = toRow(sampleEmotion, { id: "snap-3", timestamp: 3000 });
    const restored = fromRow(row);
    expect(restored.predicted_trajectory).toBeUndefined();
  });

  it("preserves unicode labels", () => {
    const withUnicode: CurrentEmotion = {
      ...sampleEmotion,
      labels: ["🌙 疲惫", "有希望"],
    };
    const row = toRow(withUnicode, { id: "snap-4", timestamp: 4000 });
    expect(fromRow(row).labels).toEqual(["🌙 疲惫", "有希望"]);
  });
});
