import { describe, it, expect, vi } from "vitest";
import { runWeekly } from "./runWeekly";
import type { DialogueTurn } from "../types";

function mkTurn(id: string, ts: number, songId: string): DialogueTurn {
  return {
    id, timestamp: ts,
    user_utterance: { role: "user", content: "hi" },
    current_emotion: { pad: { p: 0, a: 0, d: 0 }, labels: [], confidence: 0.5, source: "llm" },
    agent_response: { song_id: songId, target_profile: {}, rationale: "note", needed_shift: "陪着" },
    user_reaction: { behavioral: { completed: true, skipped: false, listen_progress: 1 } },
  } as unknown as DialogueTurn;
}

const now = new Date("2026-07-09T03:14:00Z");
const winStart = "2026-07-02T03:14:00.000Z";
const winEnd = "2026-07-09T03:14:00.000Z";

const inWindowTurns = [
  mkTurn("t1", Date.parse("2026-07-03T04:00:00Z"), "s1"),
  mkTurn("t2", Date.parse("2026-07-04T05:00:00Z"), "s1"),
  mkTurn("t3", Date.parse("2026-07-05T06:00:00Z"), "s2"),
];

const okLetter = {
  greeting: "g", body: "b",
  songs: [{ song_id: "s1", one_liner: "x" }, { song_id: "s2", one_liner: "y" }],
  moments: [],
  portrait_change: "",
  closing: "c",
};

function mkDeps(overrides: Partial<Parameters<typeof runWeekly>[0]["deps"]> = {}) {
  const writeHtml = vi.fn(async () => {});
  const inserted: any[] = [];
  const rows: any[] = [];
  return {
    writeHtml,
    inserted,
    rows,
    deps: {
      settings: { dirOverride: null, autoEnabled: true },
      appDataDir: async () => "/app-data",
      pathJoin: async (a: string, b: string) => `${a}/${b}`,
      writeWeeklyHtml: writeHtml,
      turnRepo: { listRecentTurns: async () => inWindowTurns },
      sharedMemoryRepo: { listRecentSalient: async () => [] },
      libraryRepo: { getById: async (id: string) => ({ id, title: `T-${id}`, artist: null, path: `/${id}.mp3` }) },
      memoryRead: async () => "## Living Portrait\n现在的画像\n",
      weeklyRepo: {
        insert: async (row: any) => { rows.push(row); },
        latest: async () => null,
        findByWindow: async (s: string, e: string) => rows.find((r) => r.window_start === s && r.window_end === e) ?? null,
        deleteByWindow: async () => {},
      },
      agent: { run: async () => ({ letter: okLetter, fallback: false }) },
      ...overrides,
    },
  };
}

describe("runWeekly (integration)", () => {
  it("happy path: writes HTML + inserts snapshot", async () => {
    const t = mkDeps();
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    if (out.skipped) throw new Error("should not skip");
    expect(out.fallback).toBe(false);
    expect(out.html_path).toBe("/app-data/weeklies/2026-07-02_to_2026-07-09.html");
    expect(t.writeHtml).toHaveBeenCalledOnce();
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({
      window_start: winStart, window_end: winEnd,
      turn_count: 3, fallback: 0,
      living_portrait_at_close: expect.stringContaining("现在的画像"),
    });
  });

  it("HTML contains song titles + closing", async () => {
    const t = mkDeps();
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    if (out.skipped) throw new Error("should not skip");
    const [, htmlArg] = t.writeHtml.mock.calls[0] as unknown as [string, string];
    expect(htmlArg).toContain("T-s1");
    expect(htmlArg).toContain("T-s2");
    expect(htmlArg).toContain("c");
  });

  it("auto path skips when turns < 3", async () => {
    const t = mkDeps({
      turnRepo: { listRecentTurns: async () => [inWindowTurns[0]] },
    });
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    expect(out).toEqual({ skipped: true, reason: "sparse_week" });
    expect(t.writeHtml).not.toHaveBeenCalled();
    expect(t.rows).toHaveLength(0);
  });

  it("on-demand path writes even when sparse (fallback letter)", async () => {
    const t = mkDeps({
      turnRepo: { listRecentTurns: async () => [inWindowTurns[0]] },
      agent: { run: async () => ({ letter: okLetter, fallback: false }) },
    });
    const out = await runWeekly({ now, onDemand: true, deps: t.deps });
    if (out.skipped) throw new Error("should not skip on-demand");
    expect(out.fallback).toBe(true); // sparse on-demand goes fallback branch
    expect(t.writeHtml).toHaveBeenCalledOnce();
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].fallback).toBe(1);
  });

  it("auto path with auto_enabled=false skips", async () => {
    const t = mkDeps({ settings: { dirOverride: null, autoEnabled: false } });
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    expect(out).toEqual({ skipped: true, reason: "auto_disabled" });
    expect(t.writeHtml).not.toHaveBeenCalled();
  });

  it("agent fallback letter → row.fallback = 1", async () => {
    const t = mkDeps({
      agent: { run: async () => ({ letter: okLetter, fallback: true }) },
    });
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    if (out.skipped) throw new Error("should not skip");
    expect(out.fallback).toBe(true);
    expect(t.rows[0].fallback).toBe(1);
  });

  it("dirOverride bypasses appDataDir", async () => {
    const t = mkDeps({ settings: { dirOverride: "/custom", autoEnabled: true } });
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    if (out.skipped) throw new Error("should not skip");
    expect(out.html_path).toBe("/custom/2026-07-02_to_2026-07-09.html");
  });
});
