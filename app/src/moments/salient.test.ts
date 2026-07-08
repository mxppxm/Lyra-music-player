import { describe, it, expect } from "vitest";
import { detectSalientMoment, type SalientContext } from "./salient";
import type { DialogueTurn, LibraryTrack } from "../types";

const mockSong: LibraryTrack = {
  id: "song-1",
  path: "/music/example.mp3",
  origin: "local",
  title: "夜晚的歌",
  artist: "Unknown",
  duration_ms: 240000, // 4 minutes
  added_at: Date.now(),
};

const mockTurn = (overrides: Partial<DialogueTurn> = {}): DialogueTurn => ({
  id: "turn-1",
  timestamp: Date.now(),
  current_emotion: {
    pad: { p: 0.5, a: 0.3, d: 0.4 },
    labels: ["calm"],
    confidence: 0.8,
    source: "emotion-agent-inferred",
  },
  user_utterance: { modality: "text", content: "好听" },
  agent_response: {
    song_id: mockSong.id,
    rationale: "Recommended based on mood",
  },
  user_reaction: {
    behavioral: {
      listen_duration_ms: 200000,
      completed: false,
      skipped: false,
      repeated: 0,
      volume_delta: 0,
    },
    silence_positive: false,
    verbal: undefined,
  },
  emotion_delta: { p: 0.1, a: -0.1, d: 0 },
  ...overrides,
});

describe("detectSalientMoment", () => {
  it("should detect silent full listen (Rule 1)", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 220000, // 91.7% of 240000
            completed: true,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: true,
          verbal: undefined,
        },
      }),
      song: mockSong,
      currentTags: ["#时段:深夜"],
    };

    const result = detectSalientMoment(ctx);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      tags: ["#时段:深夜"],
      songTitle: "夜晚的歌",
      narrative: "《夜晚的歌》完整听完，沉默正向。",
    });
    expect(result?.timestampISO).toBeDefined();
  });

  it("should detect explicit positive verbal (Rule 2)", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 100000,
            completed: false,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
          verbal: {
            content: "这首歌太棒了！",
            parsed_valence: "positive",
          },
        },
      }),
      song: mockSong,
      currentTags: [],
    };

    const result = detectSalientMoment(ctx);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      tags: [],
      songTitle: "夜晚的歌",
      narrative: "《夜晚的歌》你说：这首歌太棒了！",
    });
  });

  it("should detect repeated listen (Rule 3)", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 100000,
            completed: false,
            skipped: false,
            repeated: 2, // 2 repeats = 3 total listens
            volume_delta: 0,
          },
          silence_positive: false,
          verbal: undefined,
        },
      }),
      song: mockSong,
      currentTags: ["#时段:深夜"],
    };

    const result = detectSalientMoment(ctx);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      tags: ["#时段:深夜"],
      songTitle: "夜晚的歌",
      narrative: "《夜晚的歌》你重听了 3 次。",
    });
  });

  it("should detect explicit rejection (Rule 4)", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 10000,
            completed: false,
            skipped: true,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
          verbal: {
            content: "不喜欢这个风格",
            parsed_valence: "negative",
          },
        },
      }),
      song: mockSong,
      currentTags: [],
    };

    const result = detectSalientMoment(ctx);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      tags: [],
      songTitle: "夜晚的歌",
      narrative: "《夜晚的歌》被你拒绝：不喜欢这个风格",
    });
  });

  it("should return null when no rule fires", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 50000,
            completed: false,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
          verbal: {
            content: "neutral comment",
            parsed_valence: "neutral",
          },
        },
      }),
      song: mockSong,
    };

    const result = detectSalientMoment(ctx);

    expect(result).toBeNull();
  });

  it("should detect full listen without silence_positive (Rule 1, loosened)", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 180000, // 75% of 240000
            completed: true,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
          verbal: undefined,
        },
      }),
      song: mockSong,
      currentTags: [],
    };

    const result = detectSalientMoment(ctx);

    expect(result).not.toBeNull();
    expect(result?.narrative).toBe("《夜晚的歌》你完整听完了。");
  });

  it("should detect single replay (Rule 3, loosened)", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 100000,
            completed: false,
            skipped: false,
            repeated: 1,
            volume_delta: 0,
          },
          silence_positive: false,
          verbal: undefined,
        },
      }),
      song: mockSong,
      currentTags: [],
    };

    const result = detectSalientMoment(ctx);

    expect(result).not.toBeNull();
    expect(result?.narrative).toBe("《夜晚的歌》你重听了 2 次。");
  });

  it("should NOT fire Rule 5 when listen is just under 60s", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 59_999, // < 60s hard floor
            completed: false,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
          verbal: undefined,
        },
      }),
      song: { ...mockSong, duration_ms: 100_000 }, // 60% would otherwise qualify
    };

    expect(detectSalientMoment(ctx)).toBeNull();
  });

  it("should detect long attentive partial listen (Rule 5)", () => {
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 130000, // 54% of 240000, and >= 60s
            completed: false,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
          verbal: undefined,
        },
      }),
      song: mockSong,
      currentTags: [],
    };

    const result = detectSalientMoment(ctx);

    expect(result).not.toBeNull();
    expect(result?.narrative).toBe("《夜晚的歌》你安静地听了一大半。");
  });

  it("should prioritize rules: Repeated > Silent > Explicit-positive > Rejection", () => {
    // Fire both Repeated and Silent positive
    const ctx: SalientContext = {
      turn: mockTurn({
        user_reaction: {
          behavioral: {
            listen_duration_ms: 220000, // 91.7% — triggers Silent
            completed: true,
            skipped: false,
            repeated: 2, // triggers Repeated (higher priority)
            volume_delta: 0,
          },
          silence_positive: true,
          verbal: undefined,
        },
      }),
      song: mockSong,
      currentTags: ["#时段:深夜"],
    };

    const result = detectSalientMoment(ctx);

    expect(result).not.toBeNull();
    // Should pick Repeated (higher priority than Silent)
    expect(result?.narrative).toBe("《夜晚的歌》你重听了 3 次。");
  });
});
