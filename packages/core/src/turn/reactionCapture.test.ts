import { describe, it, expect } from "vitest";
import { foldReactionEvents, computeEmotionDelta } from "./reactionCapture";
import type { DialogueTurn, PAD } from "../types";

function baseTurn(): DialogueTurn {
  return {
    id: "t1",
    timestamp: 1730000000000,
    current_emotion: {
      pad: { p: 0, a: 0, d: 0 },
      labels: [],
      confidence: 0.8,
      source: "emotion-agent-inferred",
    },
    user_utterance: { modality: "text", content: "hi" },
    agent_response: { song_id: "s1", rationale: "r" },
    user_reaction: {
      behavioral: {
        listen_duration_ms: 0,
        completed: false,
        skipped: false,
        repeated: 0,
        volume_delta: 0,
      },
      silence_positive: false,
    },
    emotion_delta: { p: 0, a: 0, d: 0 },
  };
}

describe("foldReactionEvents", () => {
  it("listen_progress sets listen_duration_ms (max of existing and new)", () => {
    const turn = baseTurn();
    turn.user_reaction.behavioral.listen_duration_ms = 5000;
    const result = foldReactionEvents(turn, [{ kind: "listen_progress", ms: 3000 }]);
    expect(result.user_reaction.behavioral.listen_duration_ms).toBe(5000);

    const result2 = foldReactionEvents(turn, [{ kind: "listen_progress", ms: 8000 }]);
    expect(result2.user_reaction.behavioral.listen_duration_ms).toBe(8000);
  });

  it("multiple listen_progress events keep the max", () => {
    const turn = baseTurn();
    const result = foldReactionEvents(turn, [
      { kind: "listen_progress", ms: 2000 },
      { kind: "listen_progress", ms: 9000 },
      { kind: "listen_progress", ms: 4000 },
    ]);
    expect(result.user_reaction.behavioral.listen_duration_ms).toBe(9000);
  });

  it("complete sets completed = true", () => {
    const result = foldReactionEvents(baseTurn(), [{ kind: "complete" }]);
    expect(result.user_reaction.behavioral.completed).toBe(true);
  });

  it("skip sets skipped = true", () => {
    const result = foldReactionEvents(baseTurn(), [{ kind: "skip" }]);
    expect(result.user_reaction.behavioral.skipped).toBe(true);
  });

  it("verbal_next sets verbal field", () => {
    const result = foldReactionEvents(baseTurn(), [
      { kind: "verbal_next", content: "nice song", parsed_valence: "positive" },
    ]);
    expect(result.user_reaction.verbal).toEqual({
      content: "nice song",
      parsed_valence: "positive",
    });
  });

  it("silence_positive is true when completed && !skipped && no verbal", () => {
    const result = foldReactionEvents(baseTurn(), [{ kind: "complete" }]);
    expect(result.user_reaction.behavioral.completed).toBe(true);
    expect(result.user_reaction.behavioral.skipped).toBe(false);
    expect(result.user_reaction.verbal).toBeUndefined();
    expect(result.user_reaction.silence_positive).toBe(true);
  });

  it("silence_positive is false when skipped even if completed", () => {
    const result = foldReactionEvents(baseTurn(), [
      { kind: "complete" },
      { kind: "skip" },
    ]);
    expect(result.user_reaction.silence_positive).toBe(false);
  });

  it("silence_positive is false when verbal is present", () => {
    const result = foldReactionEvents(baseTurn(), [
      { kind: "complete" },
      { kind: "verbal_next", content: "good", parsed_valence: "positive" },
    ]);
    expect(result.user_reaction.silence_positive).toBe(false);
  });

  it("silence_positive is false when not completed", () => {
    const result = foldReactionEvents(baseTurn(), []);
    expect(result.user_reaction.silence_positive).toBe(false);
  });

  it("does not mutate the base turn (returns new object)", () => {
    const turn = baseTurn();
    const result = foldReactionEvents(turn, [{ kind: "complete" }]);
    expect(turn.user_reaction.behavioral.completed).toBe(false);
    expect(result.user_reaction.behavioral.completed).toBe(true);
  });
});

describe("computeEmotionDelta", () => {
  it("returns componentwise subtraction post - pre", () => {
    const pre: PAD = { p: 0.1, a: -0.2, d: 0.3 };
    const post: PAD = { p: 0.4, a: 0.1, d: -0.1 };
    const delta = computeEmotionDelta(pre, post);
    expect(delta.p).toBeCloseTo(0.3);
    expect(delta.a).toBeCloseTo(0.3);
    expect(delta.d).toBeCloseTo(-0.4);
  });

  it("returns zero delta when pre equals post", () => {
    const pad: PAD = { p: 0.5, a: 0.5, d: 0.5 };
    const delta = computeEmotionDelta(pad, pad);
    expect(delta).toEqual({ p: 0, a: 0, d: 0 });
  });
});
