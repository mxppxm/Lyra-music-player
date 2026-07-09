import { describe, it, expect } from "vitest";
import { WEEKLY_SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import type { WeeklyRawData } from "./dataGather";

const raw: WeeklyRawData = {
  window: { start: "2026-07-02T00:00:00.000Z", end: "2026-07-09T00:00:00.000Z", iso_week: "2026-W28" },
  turns: [] as unknown as WeeklyRawData["turns"],
  pad_series: [{ ts: 1, pad: { p: 0.1, a: 0, d: 0 } }],
  salient: [{ moment_id: "m1", text: "silence 4min", kind: "silence_positive", ts: 1 }],
  songs_played: [{ song_id: "s1", title: "夜色温柔", artist: "陈粒", small_note: "", count: 2 }],
  living_portrait_now: "现在的画像",
  living_portrait_last_close: "上周画像",
};

describe("WEEKLY_SYSTEM_PROMPT", () => {
  it("mandates first person 我 and forbids 她", () => {
    expect(WEEKLY_SYSTEM_PROMPT).toContain("第一人称");
    expect(WEEKLY_SYSTEM_PROMPT).toContain("我");
    expect(WEEKLY_SYSTEM_PROMPT).toMatch(/不(要|得|准)?出现(过|使用)?[""]?她[""]?/);
  });

  it("specifies JSON schema with all six fields", () => {
    for (const f of ["greeting", "body", "songs", "moments", "portrait_change", "closing"]) {
      expect(WEEKLY_SYSTEM_PROMPT).toContain(f);
    }
  });

  it("constrains songs 3-5 and moments 2-3", () => {
    expect(WEEKLY_SYSTEM_PROMPT).toContain("3-5");
    expect(WEEKLY_SYSTEM_PROMPT).toContain("2-3");
  });

  it("mentions the 5-word philosophy: 静 虚 空 灵 禅", () => {
    for (const w of ["静", "虚", "空", "灵", "禅"]) {
      expect(WEEKLY_SYSTEM_PROMPT).toContain(w);
    }
  });
});

describe("buildUserMessage", () => {
  const msg = buildUserMessage(raw);

  it("includes the window range", () => {
    expect(msg).toContain("2026-07-02");
    expect(msg).toContain("2026-07-09");
  });

  it("includes song ids so LLM can only pick from them", () => {
    expect(msg).toContain("s1");
    expect(msg).toContain("夜色温柔");
  });

  it("includes moment ids", () => {
    expect(msg).toContain("m1");
  });

  it("includes both portraits when both non-empty", () => {
    expect(msg).toContain("现在的画像");
    expect(msg).toContain("上周画像");
  });

  it("marks last portrait as (无) when null", () => {
    const msg2 = buildUserMessage({ ...raw, living_portrait_last_close: null });
    expect(msg2).toContain("(无)");
  });
});
