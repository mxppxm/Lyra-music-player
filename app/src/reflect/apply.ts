import type { ParsedMemory, Fact } from "../memory/types";
import type { ReflectResult } from "./ReflectAgent";

function tagsMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((t) => setA.has(t));
}

function findFact(facts: Fact[], tags: string[], conclusion: string): Fact | undefined {
  return facts.find(
    (f) => f.conclusion === conclusion && tagsMatch(f.tags, tags),
  );
}

function ewma(current: number): number {
  // confidence + 0.2 * (0.85 - confidence)
  return current + 0.2 * (0.85 - current);
}

function currentHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function applyReflectResult(
  current: ParsedMemory,
  result: ReflectResult,
  todayISO: string,
): ParsedMemory {
  // Deep-clone facts so we don't mutate the input
  const facts: Fact[] = current.facts.map((f) => ({ ...f, tags: [...f.tags] }));

  // Apply fact mutations
  for (const mut of result.factMutations) {
    if (mut.op === "add") {
      const existing = findFact(facts, mut.tags, mut.conclusion);
      if (!existing) {
        facts.push({
          tags: [...mut.tags],
          conclusion: mut.conclusion,
          confidence: mut.startConfidence ?? 0.5,
          n: 1,
          lastVerifiedISO: todayISO,
        });
      }
      // else: no-op
    } else if (mut.op === "increment") {
      const existing = findFact(facts, mut.tags, mut.conclusion);
      if (existing) {
        existing.n += mut.deltaN ?? 1;
        existing.confidence = ewma(existing.confidence);
        existing.lastVerifiedISO = todayISO;
      } else {
        console.warn(
          `[ReflectAgent] increment: no matching fact for tags=${JSON.stringify(mut.tags)} conclusion="${mut.conclusion}" — skipping`,
        );
      }
    } else if (mut.op === "adjust") {
      const existing = findFact(facts, mut.tags, mut.conclusion);
      if (existing) {
        existing.confidence = mut.newConfidence;
        existing.lastVerifiedISO = todayISO;
      } else {
        console.warn(
          `[ReflectAgent] adjust: no matching fact for tags=${JSON.stringify(mut.tags)} conclusion="${mut.conclusion}" — skipping`,
        );
      }
    }
  }

  // Living portrait — split on double newlines
  const paragraphs = result.livingPortrait
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Dream — prepend with current local time
  const timestampISO = `${todayISO}T${currentHHMM()}`;
  const dreams = [
    { timestampISO, narrative: result.dreamNarrative },
    ...current.dreams,
  ];

  return {
    ...current,
    facts,
    livingPortrait: { paragraphs },
    dreams,
  };
}
