import type { ParsedMemory, Fact, SalientMoment, Dream, Evolution, OurSong } from "./types";

function serializeFact(f: Fact): string {
  return `- ${f.tags.join(" ")} → ${f.conclusion} (conf: ${f.confidence.toFixed(2)}, n=${f.n}, ${f.lastVerifiedISO})`;
}

function serializeSalientMoment(m: SalientMoment): string {
  const tagStr = m.tags.length ? ` ${m.tags.join(" ")}` : "";
  return `- **${m.timestampISO}**${tagStr}\n  → ${m.narrative}`;
}

function serializeDream(d: Dream): string {
  return `- **${d.timestampISO}**\n  ${d.narrative}`;
}

function serializeEvolution(e: Evolution): string {
  // Reconstruct the header line — we only have quarter + rollbackId, not the middle description
  // The canonical format for the header beyond the quarter is not stored separately,
  // so we only preserve what we parsed (quarter + optional rollback).
  const rollback = e.rollbackId ? ` (rollback: ${e.rollbackId})` : "";
  return `- **${e.quarter}**${rollback}\n  ${e.narrative}`;
}

function serializeOurSong(s: OurSong): string {
  return `- ${s.title} - ${s.artist} → ${s.anchor}`;
}

export function serializeMemoryMd(parsed: ParsedMemory): string {
  const lines: string[] = [];

  lines.push("# Lyra Memory");
  lines.push("");

  // Facts
  lines.push("## Facts (Conditional Preferences)");
  if (parsed.facts.length > 0) {
    for (const f of parsed.facts) lines.push(serializeFact(f));
  }
  lines.push("");

  // Aversions
  lines.push("## Aversions");
  if (parsed.aversions.length > 0) {
    for (const f of parsed.aversions) lines.push(serializeFact(f));
  }
  lines.push("");

  // Salient Moments
  lines.push("## Salient Moments");
  if (parsed.salientMoments.length > 0) {
    for (const m of parsed.salientMoments) lines.push(serializeSalientMoment(m));
  }
  lines.push("");

  // Living Portrait
  lines.push("## Living Portrait");
  if (parsed.livingPortrait.paragraphs.length > 0) {
    lines.push(parsed.livingPortrait.paragraphs.join("\n\n"));
  }
  lines.push("");

  // Dreams
  lines.push("## Dreams");
  if (parsed.dreams.length > 0) {
    for (const d of parsed.dreams) lines.push(serializeDream(d));
  }
  lines.push("");

  // Evolutions
  lines.push("## Evolutions");
  if (parsed.evolutions.length > 0) {
    for (const e of parsed.evolutions) lines.push(serializeEvolution(e));
  }
  lines.push("");

  // Our Songs
  lines.push("## Our Songs");
  if (parsed.ourSongs.length > 0) {
    for (const s of parsed.ourSongs) lines.push(serializeOurSong(s));
  }
  lines.push("");

  return lines.join("\n");
}
