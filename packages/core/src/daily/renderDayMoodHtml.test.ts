// daily/renderDayMoodHtml.test.ts
import { describe, it, expect } from "vitest";
import { renderDayMoodHtml } from "./renderDayMoodHtml";
import type { DayMoodBrief } from "./buildDayMoodBrief";
import type { MoodSummaryJson } from "../moodSummary/MoodSummaryAgent";
import type { MoodSummaryData } from "../moodSummary/summarizeMood";

const mood: MoodSummaryData = {
  turn_count: 2,
  window_start: 1,
  window_end: 2,
  trajectory: {
    sample_count: 2,
    start_pad: { p: -0.3, a: -0.2, d: -0.1 },
    end_pad: { p: 0.1, a: 0, d: 0 },
    mean_pad: { p: -0.1, a: -0.1, d: -0.05 },
    axes: {
      p: { start: -0.3, end: 0.1, max: 0.1, min: -0.3, mean: -0.1, spread: 0.4 },
      a: { start: -0.2, end: 0, max: 0, min: -0.2, mean: -0.1, spread: 0.2 },
      d: { start: -0.1, end: 0, max: 0, min: -0.1, mean: -0.05, spread: 0.1 },
    },
    volatility: 0.12,
  },
    periods: [{ period: "night", label: "20–23时", mean_pad: { p: -0.1, a: -0.1, d: 0 }, count: 2 }],
};

const brief: DayMoodBrief = {
  dayKey: "2026-08-11",
  dayLabel: "8 月 11 日",
  headline: "昨天的心情",
  sparse: false,
  mood,
  utterances: [],
  songs: [{ title: "山丘", artist: "李宗盛", note: "锁定到第 5 遍" }],
  conclusions: [
    {
      claim: "对一首歌开了锁定播放，最高循环到第 5 遍。",
      evidence: "山丘 · 最高遍数 5",
    },
  ],
  behaviorNotes: [],
};

const summary: MoodSummaryJson = {
  opener: "晚上才慢慢缓下来。",
  body: "先是闷着，后来《山丘》陪着转了几圈。",
  song_note: "《山丘》被你锁着听，像是故意停住。",
  forward: "明天若还闷，再来一声就好。",
};

describe("renderDayMoodHtml", () => {
  it("renders mood skeleton + 读解 in human words, no tech/PAD/italic/停过的歌", () => {
    const html = renderDayMoodHtml({ brief, summary });
    expect(html).toContain("day-mood-v2");
    expect(html).toContain("昨天的心情");
    expect(html).toContain("晚上才慢慢缓下来");
    expect(html).toContain("这一天的读解");
    expect(html).toContain("锁定播放");
    expect(html).toContain(summary.song_note);
    expect(html).toContain("有点闷");
    expect(html).toContain("夜里");
    expect(html).not.toContain("停过的歌");
    expect(html).not.toContain("-0.30");
    expect(html).not.toContain("+0.10");
    expect(html).not.toContain("lyra_start");
    expect(html).not.toMatch(/font-style:\s*italic/);
  });

  it("omits 读解 section when empty", () => {
    const html = renderDayMoodHtml({
      brief: { ...brief, conclusions: [] },
      summary,
    });
    expect(html).not.toContain("这一天的读解");
  });
});
