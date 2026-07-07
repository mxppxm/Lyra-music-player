import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyReflectResult } from "./apply";
import type { ParsedMemory, Fact } from "../memory/types";
import type { ReflectResult } from "./ReflectAgent";

const TODAY = "2026-07-07";

function makeMemory(overrides: Partial<ParsedMemory> = {}): ParsedMemory {
  return {
    facts: [],
    aversions: [],
    salientMoments: [],
    livingPortrait: { paragraphs: ["Old paragraph one.", "Old paragraph two."] },
    dreams: [],
    evolutions: [],
    ourSongs: [],
    raw: "",
    ...overrides,
  };
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    tags: ["#时段:深夜"],
    conclusion: "慢速古典钢琴",
    confidence: 0.6,
    n: 3,
    lastVerifiedISO: "2026-07-01",
    ...overrides,
  };
}

const emptyResult: ReflectResult = {
  livingPortrait: "新画像第一段。\n\n新画像第二段。\n\n新画像第三段。",
  factMutations: [],
  dreamNarrative: "昨夜的梦。",
};

describe("applyReflectResult", () => {
  // Fix Date for deterministic timestampISO
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T22:15:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("overwrites livingPortrait paragraphs from result", () => {
    const mem = makeMemory();
    const out = applyReflectResult(mem, emptyResult, TODAY);
    expect(out.livingPortrait.paragraphs).toEqual([
      "新画像第一段。",
      "新画像第二段。",
      "新画像第三段。",
    ]);
  });

  it("splits on 2+ consecutive newlines and trims", () => {
    const result: ReflectResult = {
      ...emptyResult,
      livingPortrait: "  段落一  \n\n\n  段落二  \n\n段落三",
    };
    const out = applyReflectResult(makeMemory(), result, TODAY);
    expect(out.livingPortrait.paragraphs).toEqual(["段落一", "段落二", "段落三"]);
  });

  it("prepends dream to current.dreams with correct timestampISO", () => {
    const existingDream = { timestampISO: "2026-07-06T10:00", narrative: "old dream" };
    const mem = makeMemory({ dreams: [existingDream] });
    const out = applyReflectResult(mem, emptyResult, TODAY);
    expect(out.dreams).toHaveLength(2);
    expect(out.dreams[0].narrative).toBe("昨夜的梦。");
    expect(out.dreams[0].timestampISO).toBe("2026-07-07T22:15");
    expect(out.dreams[1]).toEqual(existingDream);
  });

  it("op:add appends a new fact when no match exists", () => {
    const mem = makeMemory();
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [
        { op: "add", tags: ["#时段:深夜"], conclusion: "慢速古典钢琴", startConfidence: 0.6 },
      ],
    };
    const out = applyReflectResult(mem, result, TODAY);
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0]).toMatchObject({
      tags: ["#时段:深夜"],
      conclusion: "慢速古典钢琴",
      confidence: 0.6,
      n: 1,
      lastVerifiedISO: TODAY,
    });
  });

  it("op:add uses default confidence 0.5 when startConfidence omitted", () => {
    const mem = makeMemory();
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [{ op: "add", tags: ["#天气:雨天"], conclusion: "环境音乐" }],
    };
    const out = applyReflectResult(mem, result, TODAY);
    expect(out.facts[0].confidence).toBe(0.5);
  });

  it("op:add is a no-op when same tags+conclusion already exists (order-insensitive)", () => {
    const existing = makeFact({ tags: ["#时段:深夜", "#状态:疲惫"], conclusion: "慢速古典钢琴", n: 5 });
    const mem = makeMemory({ facts: [existing] });
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [
        // tags in reversed order — should still match
        { op: "add", tags: ["#状态:疲惫", "#时段:深夜"], conclusion: "慢速古典钢琴" },
      ],
    };
    const out = applyReflectResult(mem, result, TODAY);
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].n).toBe(5); // unchanged
  });

  it("op:increment increments n and moves confidence toward 0.85 via EWMA", () => {
    const existing = makeFact({ confidence: 0.6, n: 3 });
    const mem = makeMemory({ facts: [existing] });
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [
        { op: "increment", tags: existing.tags, conclusion: existing.conclusion, deltaN: 2 },
      ],
    };
    const out = applyReflectResult(mem, result, TODAY);
    expect(out.facts[0].n).toBe(5);
    // EWMA: 0.6 + 0.2 * (0.85 - 0.6) = 0.6 + 0.05 = 0.65
    expect(out.facts[0].confidence).toBeCloseTo(0.65);
    expect(out.facts[0].lastVerifiedISO).toBe(TODAY);
  });

  it("op:increment uses deltaN=1 when omitted", () => {
    const existing = makeFact({ n: 3 });
    const mem = makeMemory({ facts: [existing] });
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [
        { op: "increment", tags: existing.tags, conclusion: existing.conclusion },
      ],
    };
    const out = applyReflectResult(mem, result, TODAY);
    expect(out.facts[0].n).toBe(4);
  });

  it("op:increment is a no-op (silent) when no matching fact", () => {
    const mem = makeMemory();
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [
        { op: "increment", tags: ["#不存在"], conclusion: "不存在的结论" },
      ],
    };
    const out = applyReflectResult(mem, result, TODAY);
    expect(out.facts).toHaveLength(0);
  });

  it("op:adjust sets confidence and lastVerifiedISO when match found", () => {
    const existing = makeFact({ confidence: 0.8 });
    const mem = makeMemory({ facts: [existing] });
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [
        { op: "adjust", tags: existing.tags, conclusion: existing.conclusion, newConfidence: 0.4 },
      ],
    };
    const out = applyReflectResult(mem, result, TODAY);
    expect(out.facts[0].confidence).toBe(0.4);
    expect(out.facts[0].lastVerifiedISO).toBe(TODAY);
  });

  it("op:adjust is a no-op (silent) when no matching fact", () => {
    const mem = makeMemory();
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [
        { op: "adjust", tags: ["#不存在"], conclusion: "不存在", newConfidence: 0.3 },
      ],
    };
    const out = applyReflectResult(mem, result, TODAY);
    expect(out.facts).toHaveLength(0);
  });

  it("does not mutate the input ParsedMemory", () => {
    const existing = makeFact({ n: 3 });
    const mem = makeMemory({ facts: [existing] });
    const result: ReflectResult = {
      ...emptyResult,
      factMutations: [
        { op: "increment", tags: existing.tags, conclusion: existing.conclusion },
      ],
    };
    applyReflectResult(mem, result, TODAY);
    // Original is unchanged
    expect(mem.facts[0].n).toBe(3);
    expect(mem.livingPortrait.paragraphs).toEqual(["Old paragraph one.", "Old paragraph two."]);
    expect(mem.dreams).toHaveLength(0);
  });

  it("never modifies salientMoments, evolutions, ourSongs, aversions", () => {
    const salientMoment = {
      timestampISO: "2026-07-01T10:00",
      tags: ["#tag"],
      songTitle: "Song",
      narrative: "narrative",
    };
    const evolution = { quarter: "2026-Q3", narrative: "evo" };
    const ourSong = { title: "T", artist: "A", anchor: "anchor" };
    const aversion = makeFact({ conclusion: "heavy metal" });
    const mem = makeMemory({
      salientMoments: [salientMoment],
      evolutions: [evolution],
      ourSongs: [ourSong],
      aversions: [aversion],
    });
    const out = applyReflectResult(mem, emptyResult, TODAY);
    expect(out.salientMoments).toEqual([salientMoment]);
    expect(out.evolutions).toEqual([evolution]);
    expect(out.ourSongs).toEqual([ourSong]);
    expect(out.aversions).toEqual([aversion]);
  });
});
