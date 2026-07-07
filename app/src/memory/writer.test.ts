import { describe, it, expect } from "vitest";
import { serializeMemoryMd } from "./writer";
import { parseMemoryMd } from "./parser";
import type { ParsedMemory } from "./types";

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
- **2026-Q3** (rollback: evo-2026Q3-a1b2)
  你今年开始搜"环境音乐"越来越频繁。

## Our Songs
- 《Nuvole Bianche》 - Ludovico Einaudi → 深夜疲惠锚点
`;

const EMPTY_PARSED: ParsedMemory = {
  facts: [],
  aversions: [],
  salientMoments: [],
  livingPortrait: { paragraphs: [] },
  dreams: [],
  evolutions: [],
  ourSongs: [],
  raw: "",
};

describe("memory/writer", () => {
  it("empty parsed produces all headings with blank lines", () => {
    const out = serializeMemoryMd(EMPTY_PARSED);
    expect(out).toContain("# Lyra Memory");
    expect(out).toContain("## Facts (Conditional Preferences)");
    expect(out).toContain("## Aversions");
    expect(out).toContain("## Salient Moments");
    expect(out).toContain("## Living Portrait");
    expect(out).toContain("## Dreams");
    expect(out).toContain("## Evolutions");
    expect(out).toContain("## Our Songs");
    // No fact lines
    expect(out).not.toContain("conf:");
  });

  it("roundtrip: serialize(parse(canonical)) matches canonical (within trailing-newline tolerance)", () => {
    const parsed = parseMemoryMd(CANONICAL);
    const serialized = serializeMemoryMd(parsed);
    expect(serialized.trimEnd()).toBe(CANONICAL.trimEnd());
  });

  it("serializes a single fact correctly", () => {
    const parsed: ParsedMemory = {
      ...EMPTY_PARSED,
      facts: [
        {
          tags: ["#时段:深夜"],
          conclusion: "轻音乐",
          confidence: 0.90,
          n: 3,
          lastVerifiedISO: "2026-07-01",
        },
      ],
    };
    const out = serializeMemoryMd(parsed);
    expect(out).toContain("- #时段:深夜 → 轻音乐 (conf: 0.90, n=3, 2026-07-01)");
  });

  it("serializes our songs correctly", () => {
    const parsed: ParsedMemory = {
      ...EMPTY_PARSED,
      ourSongs: [
        { title: "《River Flows in You》", artist: "Yiruma", anchor: "晨间平静" },
      ],
    };
    const out = serializeMemoryMd(parsed);
    expect(out).toContain("- 《River Flows in You》 - Yiruma → 晨间平静");
  });

  it("serializes salient moment with tags", () => {
    const parsed: ParsedMemory = {
      ...EMPTY_PARSED,
      salientMoments: [
        {
          timestampISO: "2026-07-06T23:00",
          tags: ["#时段:深夜"],
          songTitle: "《Clair de Lune》",
          narrative: "《Clair de Lune》静静流过。",
        },
      ],
    };
    const out = serializeMemoryMd(parsed);
    expect(out).toContain("- **2026-07-06T23:00** #时段:深夜");
    expect(out).toContain("  → 《Clair de Lune》静静流过。");
  });
});
