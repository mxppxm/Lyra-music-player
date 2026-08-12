// daily/buildDayMoodBrief.test.ts
import { describe, it, expect } from "vitest";
import type { DialogueTurn } from "../types";
import { buildDailyDigest } from "./buildDailyDigest";
import { deriveConclusions } from "./deriveConclusions";
import { buildDayMoodBrief, formatDayMoodBriefForPrompt } from "./buildDayMoodBrief";

function turn(partial: Partial<DialogueTurn> & { id: string; timestamp: number }): DialogueTurn {
  return {
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
    ...partial,
  };
}

describe("buildDayMoodBrief", () => {
  it("merges mood trajectory, utterances, conclusions, and song notes without raw ids", () => {
    const dayKey = "2026-08-11";
    const digest = buildDailyDigest({
      dayKey,
      events: [
        {
          id: "1",
          ts: 1,
          day_key: dayKey,
          name: "track_lock_on",
          song_id: "bili:BV1xx",
          turn_id: null,
          props_json: "{}",
          platform: "ios",
        },
        {
          id: "2",
          ts: 2,
          day_key: dayKey,
          name: "track_lock_loop",
          song_id: "bili:BV1xx",
          turn_id: null,
          props_json: '{"play_count":5}',
          platform: "ios",
        },
        {
          id: "3",
          ts: 3,
          day_key: dayKey,
          name: "lyrics_open",
          song_id: "bili:BV1xx",
          turn_id: null,
          props_json: "{}",
          platform: "ios",
        },
      ],
      sessions: [
        {
          id: "s1",
          day_key: dayKey,
          song_id: "bili:BV1xx",
          turn_id: null,
          source: "track_lock_loop",
          started_at: 1,
          ended_at: 2,
          listen_ms: 300_000,
          pause_ms: 0,
          duration_ms: 200_000,
          end_reason: "lock_loop_boundary",
          max_position_ms: 200_000,
          seek_count: 0,
          was_background_ms: 60_000,
          lyrics_open_count: 1,
          under_track_lock: 1,
          lock_play_count: 5,
          consecutive_repeat_index: 1,
        },
      ],
    });
    const conclusions = deriveConclusions(digest);
    const turns = [
      turn({
        id: "t1",
        timestamp: new Date(2026, 7, 11, 21, 5).getTime(),
      }),
    ];
    const brief = buildDayMoodBrief({
      dayKey,
      digest,
      conclusions,
      turns,
      titleOf: (id) => (id === "bili:BV1xx" ? "山丘" : "未知曲目"),
      artistOf: () => "李宗盛",
    });

    expect(brief.sparse).toBe(false);
    expect(brief.mood).not.toBeNull();
    expect(brief.mood!.trajectory.sample_count).toBe(1);
    expect(brief.utterances[0]?.text).toBe("有点累");
    expect(brief.songs[0]?.title).toBe("山丘");
    expect(brief.songs[0]?.note).toMatch(/锁定|遍|分/);
    expect(brief.conclusions.length).toBeGreaterThan(0);
    expect(JSON.stringify(brief)).not.toContain("bili:");

    const prompt = formatDayMoodBriefForPrompt(brief);
    expect(prompt).toContain("山丘");
    expect(prompt).toContain("有点累");
    expect(prompt).not.toContain("bili:");
    expect(prompt).not.toMatch(/p=-?\d/);
    expect(prompt).not.toContain("lyra_start");
    expect(prompt).toMatch(/随便听听|锁定|停住/);
  });
});
