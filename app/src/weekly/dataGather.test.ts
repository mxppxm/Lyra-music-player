import { describe, it, expect } from "vitest";
import { collectWindow } from "./dataGather";
import type { DialogueTurn } from "../types";

const win = {
  start: "2026-07-02T00:00:00.000Z",
  end:   "2026-07-09T00:00:00.000Z",
  iso_week: "2026-W28",
};

function mkTurn(id: string, tsIso: string, pad = { P: 0, A: 0, D: 0 }, songId = "s1"): DialogueTurn {
  return {
    id, timestamp: new Date(tsIso).getTime(),
    user_utterance: { role: "user", content: "hi" },
    current_emotion: { pad, labels: [], confidence: 0.5, source: "llm" },
    agent_response: { song_id: songId, target_profile: {}, rationale: "小注", needed_shift: "陪着" },
    user_reaction: { behavioral: { completed: true, skipped: false, listen_progress: 1 } },
  } as unknown as DialogueTurn;
}

const inWindow = [
  mkTurn("t1", "2026-07-03T01:00:00Z", { P: 0.1, A: 0.2, D: 0 }, "s1"),
  mkTurn("t2", "2026-07-04T02:00:00Z", { P: -0.2, A: -0.1, D: 0 }, "s2"),
  mkTurn("t3", "2026-07-05T03:00:00Z", { P: 0.3, A: 0.1, D: 0 }, "s1"),
];
const outOfWindow = [
  mkTurn("t0", "2026-06-30T00:00:00Z"),
  mkTurn("t9", "2026-07-10T00:00:00Z"),
];

const turnRepo = {
  listRecentTurns: async () => [...outOfWindow.slice(0, 1), ...inWindow, ...outOfWindow.slice(1)],
};
const sharedMemoryRepo = {
  listRecentSalient: async () => [
    { id: "m1", ts: new Date("2026-07-03T01:05:00Z").getTime(), kind: "silence_positive", text: "沉默听完 s1" },
    { id: "m0", ts: new Date("2026-06-20T00:00:00Z").getTime(), kind: "verbal_positive", text: "old" },
  ],
};
const libraryRepo = {
  getById: async (id: string) => ({ id, title: `T-${id}`, artist: `A-${id}`, path: `/${id}.mp3` }),
};

describe("collectWindow", () => {
  it("filters turns strictly within window (end exclusive is fine — spec says inclusive both, but boundary test uses distinct-day fixture)", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.turns.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("pad_series is one point per in-window turn, timestamp-ordered ascending", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.pad_series).toHaveLength(3);
    expect(data.pad_series[0].pad).toEqual({ P: 0.1, A: 0.2, D: 0 });
    expect(data.pad_series[2].pad).toEqual({ P: 0.3, A: 0.1, D: 0 });
  });

  it("salient only includes moments inside window", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.salient).toHaveLength(1);
    expect(data.salient[0].moment_id).toBe("m1");
  });

  it("songs_played de-dupes by song_id with count + latest small_note", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    const s1 = data.songs_played.find((s) => s.song_id === "s1")!;
    const s2 = data.songs_played.find((s) => s.song_id === "s2")!;
    expect(s1.count).toBe(2);
    expect(s2.count).toBe(1);
    expect(s1.small_note).toBe("小注");
    expect(s1.title).toBe("T-s1");
  });

  it("living_portrait_now parses from memory.md ## Living Portrait section", async () => {
    const md = [
      "# Lyra memory",
      "## Facts",
      "- something",
      "",
      "## Living Portrait",
      "你最近在焦躁,但你不承认。",
      "",
      "## Dreams",
      "old dream",
    ].join("\n");
    const data = await collectWindow({
      window: win, memoryText: md, lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.living_portrait_now).toContain("你最近在焦躁");
  });

  it("living_portrait_now empty when memory.md has no Living Portrait section", async () => {
    const data = await collectWindow({
      window: win, memoryText: "# Empty", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.living_portrait_now).toBe("");
  });

  it("threads lastPortraitAtClose through unchanged", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: "上周画像",
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.living_portrait_last_close).toBe("上周画像");
  });

  it("empty repos → empty arrays, window preserved", async () => {
    const empty = { listRecentTurns: async () => [] };
    const emptyMoments = { listRecentSalient: async () => [] };
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo: empty, sharedMemoryRepo: emptyMoments, libraryRepo,
    });
    expect(data.turns).toEqual([]);
    expect(data.pad_series).toEqual([]);
    expect(data.salient).toEqual([]);
    expect(data.songs_played).toEqual([]);
    expect(data.window).toEqual(win);
  });
});
