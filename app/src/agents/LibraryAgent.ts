import type { LibraryTrack, PAD } from "../types";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as featuresRepo from "../db/repo/libraryFeaturesRepo";
import type { LibraryFeatures } from "../db/repo/libraryFeaturesRepo";
import type { TargetProfile } from "./types";

export type LibraryRepoLike = { listAll(): Promise<LibraryTrack[]> };
export type FeaturesRepoLike = {
  getBatch(ids: string[]): Promise<Map<string, LibraryFeatures>>;
};

const DEFAULT_LIMIT = 30;

/** How much the PAD-distance signal counts against the keyword signal when
 *  BOTH are available. 0.6 = features dominate; 0.4 = keywords lead. Chosen
 *  empirically to keep language-anchored requests ("piano nights") from
 *  being outvoted by a random energetic pop track. */
const PAD_WEIGHT = 0.6;

function tokenize(target: string): string[] {
  return target
    .toLowerCase()
    .split(/[\s,，。.！!?？:：;；\-—()（）\[\]"']+/u)
    .filter((s) => s.length > 1);
}

function keywordScore(track: LibraryTrack, tokens: string[]): number {
  const hay = [track.title, track.artist, track.album]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const t of tokens) if (hay.includes(t)) score++;
  return score;
}

/** Rescale keyword hits to [0, 1] using the best-in-set as the ceiling. */
function normaliseKeyword(score: number, maxHits: number): number {
  if (maxHits === 0) return 0;
  return score / maxHits;
}

/** PAD ↔ features mapping:
 *  - arousal ↔ energy (RMS)   : target = (pad.a + 1) / 2
 *  - pleasure ↔ valence (centroid) : target = (pad.p + 1) / 2
 *  Distance is L1 across both axes normalised into [0, 1]. */
function padDistance(pad: PAD, f: LibraryFeatures): number {
  if (f.energy === null || f.valence === null) return 1; // maximum distance
  const targetA = (pad.a + 1) / 2;
  const targetP = (pad.p + 1) / 2;
  return (Math.abs(targetA - f.energy) + Math.abs(targetP - f.valence)) / 2;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class LibraryAgent {
  private repo: LibraryRepoLike;
  private features: FeaturesRepoLike;

  constructor(
    opts: { repo?: LibraryRepoLike; features?: FeaturesRepoLike } = {},
  ) {
    this.repo = opts.repo ?? { listAll: libraryRepo.listAll };
    this.features = opts.features ?? { getBatch: featuresRepo.getBatch };
  }

  async prefilter(
    target: TargetProfile,
    currentPAD: PAD,
    limit = DEFAULT_LIMIT,
  ): Promise<LibraryTrack[]> {
    const tokens = tokenize(target);
    const all = await this.repo.listAll();
    if (all.length === 0) return [];

    // Batch-fetch features for every track — one SQL query.
    const featuresByTrack = await this.features
      .getBatch(all.map((t) => t.id))
      .catch(() => new Map<string, LibraryFeatures>());

    const rawKeyword = all.map((t) => keywordScore(t, tokens));
    const maxHits = Math.max(...rawKeyword, 0);
    const anyKeyword = maxHits > 0;

    // If nothing matches keywords AND no features exist for any track,
    // fall back to random sampling (old behavior).
    if (!anyKeyword && featuresByTrack.size === 0) {
      return shuffle(all).slice(0, limit);
    }

    const scored = all.map((t, i) => {
      const kwNorm = normaliseKeyword(rawKeyword[i], maxHits);
      const feats = featuresByTrack.get(t.id);
      if (!feats) {
        // No features — score is purely keyword. Backward compat with
        // libraries imported before Sprint 9.
        return { t, score: kwNorm };
      }
      const padScore = 1 - padDistance(currentPAD, feats);
      const combined = kwNorm * (1 - PAD_WEIGHT) + padScore * PAD_WEIGHT;
      return { t, score: combined };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.t);
  }
}
