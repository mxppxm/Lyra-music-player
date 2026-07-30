import { describe, it, expect } from "vitest";
import type { DialogueTurn } from "../types";
import {
  extractPlayHistory,
  buildExcludeSet,
  buildFatigueMap,
} from "./playHistory";
import { RECOMMENDATION_DEFAULTS } from "./types";

function turn(songId: string, ts: number, skipped = false, completed = false): DialogueTurn {
  return {
    id: `t-${ts}`,
    timestamp: ts,
    current_emotion: {
      pad: { p: 0, a: 0, d: 0 },
      labels: [],
      confidence: 0.5,
      source: "emotion-agent-inferred",
    },
    user_utterance: { modality: "text", content: "" },
    agent_response: { song_id: songId, rationale: "x" },
    user_reaction: {
      behavioral: {
        listen_duration_ms: 0,
        completed,
        skipped,
        repeated: 0,
        volume_delta: 0,
      },
      silence_positive: false,
    },
    emotion_delta: { p: 0, a: 0, d: 0 },
  };
}

describe("extractPlayHistory", () => {
  it("orders newest first and skips turns without song_id", () => {
    const noSong = { ...turn("a", 1), agent_response: { song_id: "", rationale: "" } };
    const history = extractPlayHistory([turn("b", 3), noSong, turn("a", 2)]);
    expect(history.map((h) => h.songId)).toEqual(["b", "a"]);
    expect(history[0].turnsAgo).toBe(0);
    expect(history[1].turnsAgo).toBe(2);
  });
});

describe("buildExcludeSet", () => {
  it("excludes up to HARD_EXCLUDE_WINDOW unique recent songs", () => {
    const plays = Array.from({ length: 25 }, (_, i) =>
      extractPlayHistory([turn(`s${i}`, i)])[0],
    );
    const exclude = buildExcludeSet(plays);
    expect(exclude.size).toBe(RECOMMENDATION_DEFAULTS.HARD_EXCLUDE_WINDOW);
    expect(exclude.has("s0")).toBe(true);
    expect(exclude.has("s24")).toBe(false);
  });

  it("shrinks exclude window when library is tiny", () => {
    const plays = extractPlayHistory([
      turn("a", 3),
      turn("b", 2),
      turn("c", 1),
      turn("d", 0),
    ]);
    const exclude = buildExcludeSet(plays, { librarySize: 3 });
    expect(exclude.size).toBeLessThanOrEqual(2);
    expect(exclude.has("a")).toBe(true);
  });
});

describe("buildFatigueMap", () => {
  it("assigns higher fatigue to more recent plays", () => {
    const plays = extractPlayHistory([
      turn("recent", 100, false, true),
      turn("old", 99),
    ]);
    const fatigue = buildFatigueMap(plays);
    expect(fatigue.get("recent")!).toBeGreaterThan(fatigue.get("old")!);
  });

  it("boosts fatigue for skipped songs", () => {
    const plays = extractPlayHistory([
      turn("skipped", 1, true),
      turn("completed", 0, false, true),
    ]);
    const fatigue = buildFatigueMap(plays);
    expect(fatigue.get("skipped")!).toBeGreaterThan(fatigue.get("completed")!);
  });
});
