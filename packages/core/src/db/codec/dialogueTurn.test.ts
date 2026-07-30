import { describe, it, expect } from "vitest";
import { toRow, fromRow } from "./dialogueTurn";
import type { DialogueTurn } from "../../types";

const sample: DialogueTurn = {
  id: "turn-01",
  timestamp: 1730000000000,
  current_emotion: {
    pad: { p: 0.3, a: -0.2, d: 0.1 },
    labels: ["疲惫", "有希望"],
    confidence: 0.82,
    source: "emotion-agent-inferred",
  },
  user_utterance: { modality: "text", content: "最近有点累" },
  agent_response: {
    song_id: "nuvole_bianche",
    rationale: "慢速温暖的钢琴，能接住此刻的疲惫",
  },
  user_reaction: {
    behavioral: {
      listen_duration_ms: 240_000,
      completed: true,
      skipped: false,
      repeated: 0,
      volume_delta: 0,
    },
    silence_positive: true,
  },
  emotion_delta: { p: 0.1, a: 0.02, d: 0 },
};

describe("dialogueTurn codec", () => {
  it("round-trips a fully populated turn", () => {
    expect(fromRow(toRow(sample))).toEqual(sample);
  });

  it("round-trips a proactive-open turn (empty utterance content)", () => {
    const t: DialogueTurn = {
      ...sample,
      user_utterance: { modality: "proactive-open", content: "" },
      agent_response: { ...sample.agent_response, proactive_kind: "morning" },
    };
    expect(fromRow(toRow(t))).toEqual(t);
  });

  it("round-trips a turn with verbal reaction", () => {
    const t: DialogueTurn = {
      ...sample,
      user_reaction: {
        ...sample.user_reaction,
        verbal: { content: "换一首", parsed_valence: "negative" },
        silence_positive: false,
      },
    };
    expect(fromRow(toRow(t))).toEqual(t);
  });

  it("preserves unicode in verbal content", () => {
    const t: DialogueTurn = {
      ...sample,
      user_reaction: {
        ...sample.user_reaction,
        verbal: { content: "好听 🎵, 再来一首", parsed_valence: "positive" },
      },
    };
    expect(fromRow(toRow(t)).user_reaction.verbal?.content).toBe("好听 🎵, 再来一首");
  });

  it("toRow produces a shape matching the DialogueTurnRow contract", () => {
    const row = toRow(sample);
    expect(row.id).toBe("turn-01");
    expect(row.timestamp).toBe(1730000000000);
    expect(typeof row.user_utterance_json).toBe("string");
    expect(typeof row.agent_response_json).toBe("string");
    expect(typeof row.user_reaction_json).toBe("string");
    expect(typeof row.current_emotion_json).toBe("string");
    expect(typeof row.emotion_delta_json).toBe("string");
    // JSON columns must be valid JSON
    expect(() => JSON.parse(row.user_utterance_json)).not.toThrow();
  });
});
