import type { ParsedMemory, Fact } from "./types";

export type MemoryContext = {
  livingPortrait: string;
  topFacts: Fact[];
};

let _ctx: MemoryContext = { livingPortrait: "", topFacts: [] };

export function getMemoryContext(): MemoryContext {
  return _ctx;
}

export function setMemoryContext(memory: ParsedMemory, topN = 5): void {
  const facts = [...memory.facts]
    .sort((a, b) => b.n * b.confidence - a.n * a.confidence)
    .slice(0, topN);
  const portrait = memory.livingPortrait.paragraphs.join("\n\n");
  _ctx = { livingPortrait: portrait, topFacts: facts };
}
