import { describe, it, expect, vi, beforeEach } from "vitest";
import { WeeklyAgent } from "./WeeklyAgent";
import type { WeeklyRawData } from "./dataGather";

const raw: WeeklyRawData = {
  window: { start: "2026-07-02T00:00:00.000Z", end: "2026-07-09T00:00:00.000Z", iso_week: "2026-W28" },
  turns: [] as unknown as WeeklyRawData["turns"],
  pad_series: [],
  salient: [{ moment_id: "m1", text: "silence", kind: "silence_positive", ts: 1 }],
  songs_played: [{ song_id: "s1", title: "T", artist: "A", small_note: "", count: 1 }],
  living_portrait_now: "",
  living_portrait_last_close: null,
};

vi.mock("../reasoning/writeTrace", () => ({ writeTrace: vi.fn() }));

const okJson = JSON.stringify({
  greeting: "hi",
  body: "我记得你这周的沉默",
  songs: [{ song_id: "s1", one_liner: "x" }],
  moments: [{ moment_id: "m1", whisper: "y" }],
  portrait_change: "",
  closing: "bye",
});

function mkProvider(seq: Array<{ ok: true; content: string } | { ok: false; err: Error }>) {
  let i = 0;
  return {
    chat: vi.fn(async () => {
      const step = seq[i++];
      if (!step) throw new Error("provider exhausted");
      if (step.ok) return { content: step.content, usage: null };
      throw step.err;
    }),
  };
}

describe("WeeklyAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first call succeeds → letter returned, fallback false", async () => {
    const agent = new WeeklyAgent({ provider: mkProvider([{ ok: true, content: okJson }]) as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(false);
    expect(out.letter.greeting).toBe("hi");
  });

  it("first call throws → retry once → success", async () => {
    const provider = mkProvider([
      { ok: false, err: new Error("timeout") },
      { ok: true, content: okJson },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(false);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it("first call returns garbage JSON → retry → success", async () => {
    const provider = mkProvider([
      { ok: true, content: "not json at all" },
      { ok: true, content: okJson },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(false);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it("both attempts fail → returns synthesized fallback letter (fallback true)", async () => {
    const provider = mkProvider([
      { ok: false, err: new Error("timeout") },
      { ok: false, err: new Error("timeout again") },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(true);
    expect(out.letter.songs.length).toBeGreaterThan(0);
    expect(out.letter.moments.length).toBeGreaterThan(0);
  });

  it("both attempts return garbage → fallback letter", async () => {
    const provider = mkProvider([
      { ok: true, content: "garbage" },
      { ok: true, content: "still garbage" },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(true);
  });

  it("throws third_person_violation when letter contains 她, triggering retry + fallback", async () => {
    const badJson = JSON.stringify({
      greeting: "她好",
      body: "b",
      closing: "c",
      songs: [{ song_id: "s1", one_liner: "x" }],
      moments: [{ moment_id: "m1", whisper: "y" }],
      portrait_change: "",
    });
    const provider = mkProvider([
      { ok: true, content: badJson },
      { ok: true, content: badJson },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(true);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it("does not throw when letter has 我 and no 她", async () => {
    const goodJson = JSON.stringify({
      greeting: "我在这里",
      body: "我记得你周三沉默听完那首歌",
      songs: [{ song_id: "s1", one_liner: "x" }],
      moments: [{ moment_id: "m1", whisper: "y" }],
      portrait_change: "",
      closing: "c",
    });
    const provider = mkProvider([{ ok: true, content: goodJson }]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(false);
  });

  it("throws no_first_person when letter has no 我 and no 她 → retry + fallback", async () => {
    // Distinct from the 她 branch: guards against hollow letters that
    // pattern-match the schema but drop first-person tokens entirely.
    const hollowJson = JSON.stringify({
      greeting: "好",
      body: "这周平静",
      songs: [{ song_id: "s1", one_liner: "x" }],
      moments: [{ moment_id: "m1", whisper: "y" }],
      portrait_change: "",
      closing: "好",
    });
    const provider = mkProvider([
      { ok: true, content: hollowJson },
      { ok: true, content: hollowJson },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(true);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it("passes response_format json_object + agent 'weekly' to provider", async () => {
    const provider = mkProvider([{ ok: true, content: okJson }]);
    const agent = new WeeklyAgent({ provider: provider as any });
    await agent.run({ raw });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        response_format: { type: "json_object" },
        agent: "weekly",
      }),
    );
  });
});
