import { describe, it, expect } from "vitest";
import { parseMemoryMd, EMPTY_MEMORY } from "./parser";

const CANONICAL = `# Lyra Memory

## Facts (Conditional Preferences)
- #天气:雨天 → 佛教音乐 / 环境音乐 (conf: 0.82, n=6, 2026-06-30)
- #时段:深夜 #状态:疲惫 → 慢速古典钢琴 (conf: 0.87, n=9, 2026-07-06)

## Aversions
- #风格:过度修饰的流行 → 反感 (conf: 0.85, n=7, 2026-06-20)

## Salient Moments
- **2026-11-03T02:47** #时段:深夜 #状态:疲惫
  → 《Nuvole Bianche》完整听完，沉默正向。

## Living Portrait
你最近在追一个 side project，深夜情绪信号是"疲惫但不封闭"。
你在过去三个月开始搜"环境音乐"越来越频繁。

## Dreams
- **2026-07-07T03:14**
  回想昨天，你说"累"但没跳歌。这已经是本周第三次深夜。梦到一个模式：你不是要治愈，是要被承认。

## Evolutions
- **2026-Q3** novelty_seeking 0.4→0.5 (rollback: evo-2026Q3-a1b2)
  你今年开始搜"环境音乐"越来越频繁。

## Our Songs
- 《Nuvole Bianche》 - Ludovico Einaudi → 深夜疲惫锚点
`;

describe("memory/parser", () => {
  it("empty string returns EMPTY_MEMORY shape", () => {
    const result = parseMemoryMd("");
    expect(result.facts).toEqual([]);
    expect(result.aversions).toEqual([]);
    expect(result.salientMoments).toEqual([]);
    expect(result.livingPortrait.paragraphs).toEqual([]);
    expect(result.dreams).toEqual([]);
    expect(result.evolutions).toEqual([]);
    expect(result.ourSongs).toEqual([]);
  });

  it("EMPTY_MEMORY exported constant has correct shape", () => {
    expect(EMPTY_MEMORY.facts).toEqual([]);
    expect(EMPTY_MEMORY.aversions).toEqual([]);
    expect(EMPTY_MEMORY.livingPortrait.paragraphs).toEqual([]);
  });

  describe("facts parsing", () => {
    it("parses single-tag fact", () => {
      const result = parseMemoryMd(CANONICAL);
      const f = result.facts[0];
      expect(f.tags).toEqual(["#天气:雨天"]);
      expect(f.conclusion).toBe("佛教音乐 / 环境音乐");
      expect(f.confidence).toBeCloseTo(0.82);
      expect(f.n).toBe(6);
      expect(f.lastVerifiedISO).toBe("2026-06-30");
    });

    it("parses multi-tag fact", () => {
      const result = parseMemoryMd(CANONICAL);
      const f = result.facts[1];
      expect(f.tags).toEqual(["#时段:深夜", "#状态:疲惫"]);
      expect(f.conclusion).toBe("慢速古典钢琴");
      expect(f.confidence).toBeCloseTo(0.87);
      expect(f.n).toBe(9);
    });

    it("skips malformed fact lines silently", () => {
      const content = `# Lyra Memory\n\n## Facts (Conditional Preferences)\n- not a valid fact line\n- #tag → valid (conf: 0.50, n=1, 2026-01-01)\n`;
      const result = parseMemoryMd(content);
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0].tags).toEqual(["#tag"]);
    });
  });

  describe("aversions parsing", () => {
    it("parses aversion fact", () => {
      const result = parseMemoryMd(CANONICAL);
      expect(result.aversions).toHaveLength(1);
      expect(result.aversions[0].tags).toEqual(["#风格:过度修饰的流行"]);
      expect(result.aversions[0].conclusion).toBe("反感");
    });
  });

  describe("salient moments parsing", () => {
    it("parses salient moment with tags and narrative", () => {
      const result = parseMemoryMd(CANONICAL);
      expect(result.salientMoments).toHaveLength(1);
      const m = result.salientMoments[0];
      expect(m.timestampISO).toBe("2026-11-03T02:47");
      expect(m.tags).toEqual(["#时段:深夜", "#状态:疲惫"]);
      expect(m.narrative).toBe("《Nuvole Bianche》完整听完，沉默正向。");
      expect(m.songTitle).toBe("《Nuvole Bianche》");
    });
  });

  describe("living portrait parsing", () => {
    it("parses paragraphs", () => {
      const result = parseMemoryMd(CANONICAL);
      expect(result.livingPortrait.paragraphs).toHaveLength(1);
      expect(result.livingPortrait.paragraphs[0]).toContain("side project");
    });
  });

  describe("dreams parsing", () => {
    it("parses dream with timestamp and narrative", () => {
      const result = parseMemoryMd(CANONICAL);
      expect(result.dreams).toHaveLength(1);
      const d = result.dreams[0];
      expect(d.timestampISO).toBe("2026-07-07T03:14");
      expect(d.narrative).toContain("没跳歌");
    });
  });

  describe("evolutions parsing", () => {
    it("parses evolution with rollbackId", () => {
      const result = parseMemoryMd(CANONICAL);
      expect(result.evolutions).toHaveLength(1);
      const e = result.evolutions[0];
      expect(e.quarter).toBe("2026-Q3");
      expect(e.rollbackId).toBe("evo-2026Q3-a1b2");
      expect(e.narrative).toContain("环境音乐");
    });
  });

  describe("our songs parsing", () => {
    it("parses our song entry", () => {
      const result = parseMemoryMd(CANONICAL);
      expect(result.ourSongs).toHaveLength(1);
      const s = result.ourSongs[0];
      expect(s.title).toBe("《Nuvole Bianche》");
      expect(s.artist).toBe("Ludovico Einaudi");
      expect(s.anchor).toBe("深夜疲惫锚点");
    });
  });

  it("preserves raw content", () => {
    const result = parseMemoryMd(CANONICAL);
    expect(result.raw).toBe(CANONICAL);
  });

  it("handles unicode in narratives", () => {
    const content = `# Lyra Memory\n\n## Salient Moments\n- **2026-01-01T00:00** #tag:测试\n  → 音乐让人平静，心灵得到安慰。\n`;
    const result = parseMemoryMd(content);
    expect(result.salientMoments[0].narrative).toBe("音乐让人平静，心灵得到安慰。");
  });
});
