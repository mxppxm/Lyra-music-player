import type { MusicProfile } from "../types/musicProfile";
import type { SoulState } from "../types";
import { expandWithSynonyms, areSynonyms, getSynonyms } from "./moodSynonyms";

/** Trust multiplier applied to the composite profile score. */
export function profileQualityMultiplier(profile: MusicProfile | null | undefined): number {
  if (!profile) return 0.72;
  if (profile.recognized) return 1.08;
  if (profile.llm_unknown) return 0.62;
  if (profile.recognized === false) return 0.82;
  return 0.95;
}

/** Overlap between user labels / query tokens and song mood or lyrical themes.
 *  Supports cross-language synonym matching via moodSynonyms — "无聊" can
 *  match "melancholic", "lonely", "bored", etc. */
export function tagOverlap(
  userLabels: string[],
  queryTokens: string[],
  songTags: string[],
): number {
  const merged = [...userLabels, ...queryTokens];
  if (merged.length === 0 || songTags.length === 0) return 0;

  // Expand user tokens with cross-language synonyms
  const expandedUser = expandWithSynonyms(merged.map((l) => l.toLowerCase()).filter((l) => l.length > 1));
  const songSet = songTags.map((m) => m.toLowerCase());

  let overlap = 0;
  for (const m of songSet) {
    for (const u of expandedUser) {
      // Direct substring match OR synonym match
      if (m.includes(u) || u.includes(m) || areSynonyms(m, u)) {
        overlap++;
        break;
      }
    }
  }
  return overlap / Math.max(expandedUser.length, 1);
}

/** Soul genre affinity vs track profile genres. */
export function genreAffinityScore(
  profile: MusicProfile | null | undefined,
  soul: SoulState | undefined,
): number {
  if (!profile || profile.genre.length === 0 || !soul) return 0;
  const affinity = soul.musical_taste_base.affinity_genres;
  if (affinity.length === 0) return 0;

  const affLower = affinity.map((g) => g.toLowerCase());
  const genreLower = profile.genre.map((g) => g.toLowerCase());
  let hits = 0;
  for (const g of genreLower) {
    for (const a of affLower) {
      if (g.includes(a) || a.includes(g)) {
        hits++;
        break;
      }
    }
  }
  return Math.min(hits / Math.max(affinity.length, 1), 1);
}

const ENERGY_RANK: Record<MusicProfile["energy_level"], number> = {
  very_low: 0,
  low: 1,
  medium: 2,
  high: 3,
  very_high: 4,
};

/** Match energy_level to user arousal (pad.a). */
export function energyMatchScore(
  profile: MusicProfile | null | undefined,
  arousal: number,
): number {
  if (!profile) return 0;
  const targetRank =
    arousal >= 0.55 ? 4 : arousal >= 0.2 ? 3 : arousal >= -0.2 ? 2 : arousal >= -0.55 ? 1 : 0;
  const songRank = ENERGY_RANK[profile.energy_level] ?? 2;
  const dist = Math.abs(targetRank - songRank);
  return 1 - dist / 4;
}

/** Text haystack for keyword fallback — uses canonical identity when profile exists.
 *  Expands English mood tags with Chinese synonyms for cross-language keyword matching. */
export function profileSearchHaystack(
  track: { title?: string; artist?: string; album?: string },
  profile: MusicProfile | null | undefined,
): string {
  // Expand mood tags with cross-language synonyms
  const moodWithSynonyms: string[] = [];
  if (profile?.mood) {
    for (const m of profile.mood) {
      moodWithSynonyms.push(m);
      // Add Chinese synonyms for English mood tags
      moodWithSynonyms.push(...getSynonyms(m));
    }
  }

  const parts = [
    track.title,
    track.artist,
    track.album,
    profile?.canonical_work,
    ...(profile?.genre ?? []),
    ...moodWithSynonyms,
    ...(profile?.lyrical_themes ?? []),
    ...(profile?.best_for ?? []),
    ...(profile?.instrumentation ?? []),
    profile?.vocal_style,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Detect whether a string contains CJK ideographs (Chinese/Japanese kanji). */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * Extract Chinese bigram tokens from a CJK segment.
 * "深夜下班" → ["深夜", "夜下", "下班"]
 * Segments of length 1 are kept as-is; segments of length 2 are kept whole.
 */
function chineseBigrams(segment: string): string[] {
  if (segment.length <= 2) return [segment];
  const out: string[] = [];
  for (let i = 0; i < segment.length - 1; i++) {
    out.push(segment.slice(i, i + 2));
  }
  return out;
}

export function tokenize(target: string): string[] {
  const raw = target
    .toLowerCase()
    .split(/[\s,，。.！!?？:：;；\-—()（）\[\]"']+/u)
    .filter((s) => s.length > 0);

  const tokens: string[] = [];
  for (const seg of raw) {
    if (CJK_RE.test(seg) && seg.length > 2) {
      // CJK segment longer than 2 chars: emit bigrams + the whole segment
      // (whole segment helps exact-match scenarios like "深夜下班" ↔ "深夜下班")
      tokens.push(...chineseBigrams(seg));
      tokens.push(seg);
    } else if (seg.length > 1) {
      tokens.push(seg);
    }
  }
  return tokens;
}

export function keywordScoreFromHaystack(hay: string, tokens: string[]): number {
  let score = 0;
  for (const t of tokens) if (hay.includes(t)) score++;
  return score;
}
