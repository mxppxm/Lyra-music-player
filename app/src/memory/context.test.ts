import { describe, it, expect, beforeEach } from "vitest";
import { getMemoryContext, setMemoryContext } from "./context";
import { EMPTY_MEMORY } from "./parser";
import type { ParsedMemory, Fact } from "./types";

function makeFact(tags: string[], conclusion: string, n: number, confidence: number): Fact {
  return { tags, conclusion, confidence, n, lastVerifiedISO: "2026-07-07" };
}

function makeMemory(facts: Fact[], paragraphs: string[] = []): ParsedMemory {
  return {
    ...EMPTY_MEMORY,
    facts,
    livingPortrait: { paragraphs },
  };
}

describe("setMemoryContext / getMemoryContext", () => {
  beforeEach(() => {
    // Reset to empty before each test
    setMemoryContext(EMPTY_MEMORY);
  });

  it("returns empty defaults from EMPTY_MEMORY", () => {
    const ctx = getMemoryContext();
    expect(ctx.livingPortrait).toBe("");
    expect(ctx.topFacts).toEqual([]);
  });

  it("sorts facts by n × confidence descending and slices to topN=5", () => {
    const facts = [
      makeFact(["#a"], "low score", 1, 0.1),    // score: 0.1
      makeFact(["#b"], "high score", 10, 0.9),   // score: 9.0
      makeFact(["#c"], "mid score", 5, 0.5),     // score: 2.5
      makeFact(["#d"], "med-high", 4, 0.8),      // score: 3.2
      makeFact(["#e"], "just ok", 3, 0.6),       // score: 1.8
      makeFact(["#f"], "extra", 2, 0.7),         // score: 1.4
    ];
    setMemoryContext(makeMemory(facts));
    const ctx = getMemoryContext();
    expect(ctx.topFacts).toHaveLength(5);
    // First should be highest score: #b (9.0)
    expect(ctx.topFacts[0].conclusion).toBe("high score");
    // Second: #d (3.2)
    expect(ctx.topFacts[1].conclusion).toBe("med-high");
    // Third: #c (2.5)
    expect(ctx.topFacts[2].conclusion).toBe("mid score");
    // Fourth: #e (1.8)
    expect(ctx.topFacts[3].conclusion).toBe("just ok");
    // Fifth: #f (1.4)
    expect(ctx.topFacts[4].conclusion).toBe("extra");
    // Excluded: #a (0.1)
  });

  it("respects custom topN parameter", () => {
    const facts = [
      makeFact(["#a"], "a", 10, 0.9),
      makeFact(["#b"], "b", 9, 0.9),
      makeFact(["#c"], "c", 8, 0.9),
    ];
    setMemoryContext(makeMemory(facts), 2);
    expect(getMemoryContext().topFacts).toHaveLength(2);
  });

  it("joins portrait paragraphs with double newline", () => {
    const paragraphs = ["她喜欢深夜的宁静", "古典钢琴是她的庇护所"];
    setMemoryContext(makeMemory([], paragraphs));
    expect(getMemoryContext().livingPortrait).toBe("她喜欢深夜的宁静\n\n古典钢琴是她的庇护所");
  });

  it("returns empty string for portrait when no paragraphs", () => {
    setMemoryContext(makeMemory([], []));
    expect(getMemoryContext().livingPortrait).toBe("");
  });

  it("does not mutate the original facts array", () => {
    const facts = [
      makeFact(["#a"], "a", 1, 0.5),
      makeFact(["#b"], "b", 10, 0.9),
    ];
    const original = [...facts];
    setMemoryContext(makeMemory(facts));
    expect(facts).toEqual(original);
  });
});
