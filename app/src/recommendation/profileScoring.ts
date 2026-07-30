import type { MusicProfile } from "../types/musicProfile";
import type { SoulState } from "../types";

/** Trust multiplier applied to the composite profile score. */
export function profileQualityMultiplier(profile: MusicProfile | null | undefined): number {
  if (!profile) return 0.72;
  if (profile.recognized) return 1.08;
  if (profile.llm_unknown) return 0.62;
  if (profile.recognized === false) return 0.82;
  return 0.95;
}

/** Overlap between user labels / query tokens and song mood or lyrical themes. */
export function tagOverlap(
  userLabels: string[],
  queryTokens: string[],
  songTags: string[],
): number {
  const merged = [...userLabels, ...queryTokens];
  if (merged.length === 0 || songTags.length === 0) return 0;

  const userSet = merged.map((l) => l.toLowerCase()).filter((l) => l.length > 1);
  const songSet = songTags.map((m) => m.toLowerCase());
  let overlap = 0;
  for (const m of songSet) {
    for (const u of userSet) {
      if (m.includes(u) || u.includes(m)) {
        overlap++;
        break;
      }
    }
  }
  return overlap / Math.max(userSet.length, 1);
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

/** Text haystack for keyword fallback — uses canonical identity when profile exists. */
export function profileSearchHaystack(
  track: { title?: string; artist?: string; album?: string },
  profile: MusicProfile | null | undefined,
): string {
  const parts = [
    track.title,
    track.artist,
    track.album,
    profile?.canonical_work,
    ...(profile?.genre ?? []),
    ...(profile?.mood ?? []),
    ...(profile?.lyrical_themes ?? []),
    ...(profile?.instrumentation ?? []),
    profile?.vocal_style,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function tokenize(target: string): string[] {
  return target
    .toLowerCase()
    .split(/[\s,，。.！!?？:：;；\-—()（）\[\]"']+/u)
    .filter((s) => s.length > 1);
}

export function keywordScoreFromHaystack(hay: string, tokens: string[]): number {
  let score = 0;
  for (const t of tokens) if (hay.includes(t)) score++;
  return score;
}
