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
  body: "b",
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
