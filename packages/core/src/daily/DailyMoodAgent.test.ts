import { describe, it, expect, vi } from "vitest";
import {
  DailyMoodAgent,
  fallbackMoodLetter,
} from "../agents/DailyMoodAgent";
import type { DailyMoodBrief } from "./buildDailyMoodBrief";
import { buildDailyMoodBrief } from "./buildDailyMoodBrief";
import { buildDailyDigest } from "./buildDailyDigest";
import { deriveConclusions } from "./deriveConclusions";
import type { DialogueTurn } from "../types";

const emptyBrief: DailyMoodBrief = {
  dayKey: "2026-08-11",
  dayLabel: "8 月 11 日",
  sparse: true,
  turns: [],
  companionSongs: [],
  factNotes: [],
};

describe("fallbackMoodLetter", () => {
  it("writes a soft empty-day note", () => {
    const letter = fallbackMoodLetter(emptyBrief);
    expect(letter.fallback).toBe(true);
    expect(letter.body).toContain("几乎没有");
  });
});

describe("DailyMoodAgent", () => {
  it("parses LLM JSON into a letter", async () => {
    const provider = {
      id: "sensenova" as const,
      chat: vi.fn(async () => ({
        content: JSON.stringify({
          mood_arc: "从闷到缓",
          greeting: "",
          body: "今天像是慢慢松了一口气。\n\n《山丘》停得比较久。",
          closing: "— Lyra",
        }),
      })),
    };
    const agent = new DailyMoodAgent({ provider: provider as never });
    const letter = await agent.write({
      ...emptyBrief,
      sparse: false,
      companionSongs: [{ title: "山丘", note: "听了约 3 分" }],
      turns: [
        {
          time: "21:00",
          utterance: "有点累",
          labels: ["疲惫"],
          pad: { p: -0.3, a: -0.4, d: -0.3 },
          songTitle: "山丘",
          rationale: "慢一点",
        },
      ],
    });
    expect(letter.fallback).toBe(false);
    expect(letter.mood_arc).toBe("从闷到缓");
    expect(letter.body).toContain("松了一口气");
  });

  it("falls back when provider throws", async () => {
    const provider = {
      id: "sensenova" as const,
      chat: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const agent = new DailyMoodAgent({ provider: provider as never });
    const letter = await agent.write({
      ...emptyBrief,
      sparse: false,
      companionSongs: [{ title: "晴天", note: "有过停留" }],
    });
    expect(letter.fallback).toBe(true);
    expect(letter.body).toContain("晴天");
  });
});

describe("buildDailyMoodBrief", () => {
  it("uses titleOf instead of song ids", () => {
    const digest = buildDailyDigest({
      dayKey: "2026-08-11",
      events: [
        {
          id: "1",
          ts: 1,
          day_key: "2026-08-11",
          name: "lyra_start",
          song_id: null,
          turn_id: null,
          props_json: "{}",
          platform: "ios",
        },
      ],
      sessions: [
        {
          id: "s1",
          day_key: "2026-08-11",
          song_id: "bili:BV1xx",
          turn_id: null,
          source: "user_input",
          started_at: 1,
          ended_at: 2,
          listen_ms: 120_000,
          pause_ms: 0,
          duration_ms: 200_000,
          end_reason: "completed",
          max_position_ms: 120_000,
          seek_count: 0,
          was_background_ms: 0,
          lyrics_open_count: 0,
          under_track_lock: 0,
          lock_play_count: null,
          consecutive_repeat_index: 1,
        },
      ],
    });
    const turn: DialogueTurn = {
      id: "t1",
      timestamp: Date.now(),
      current_emotion: {
        pad: { p: -0.2, a: -0.3, d: -0.2 },
        labels: ["疲惫"],
        confidence: 0.7,
        source: "emotion-agent-inferred",
      },
      user_utterance: { modality: "text", content: "有点累" },
      agent_response: { song_id: "bili:BV1xx", rationale: "慢一点" },
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
    const brief = buildDailyMoodBrief({
      dayKey: "2026-08-11",
      digest,
      conclusions: deriveConclusions(digest),
      turns: [turn],
      titleOf: (id) => (id === "bili:BV1xx" ? "山丘" : "未知曲目"),
    });
    expect(brief.companionSongs[0]?.title).toBe("山丘");
    expect(brief.turns[0]?.songTitle).toBe("山丘");
    expect(JSON.stringify(brief)).not.toContain("bili:");
  });
});
