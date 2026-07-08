import type { LibraryTrack, PAD } from "../types";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as featuresRepo from "../db/repo/libraryFeaturesRepo";
import * as lyricsRepo from "../db/repo/lyricsEmbeddingsRepo";
import type { LibraryFeatures } from "../db/repo/libraryFeaturesRepo";
import type { LyricsEmbedding } from "../db/repo/lyricsEmbeddingsRepo";
import { createEmbeddingProvider } from "../providers/embeddingProvider";
import type { EmbeddingProvider } from "../providers/embeddingProvider";
import type { TargetProfile } from "./types";

export type LibraryRepoLike = { listAll(): Promise<LibraryTrack[]> };
export type FeaturesRepoLike = {
  getBatch(ids: string[]): Promise<Map<string, LibraryFeatures>>;
};
export type LyricsRepoLike = {
  getBatch(ids: string[]): Promise<Map<string, LyricsEmbedding>>;
};
export type ProviderFactory = () => Promise<EmbeddingProvider | null>;

const DEFAULT_LIMIT = 30;

/** Full weights when all three signals are present. Missing signals drop
 *  out and remaining weights are renormalized (see combineWeighted).
 *  Sprint 9 formula (kw 0.4 / pad 0.6) is preserved exactly when sem is
 *  absent, because 0.2/(0.2+0.3) = 0.4 and 0.3/(0.2+0.3) = 0.6. */
const WEIGHTS = { kw: 0.2, pad: 0.3, sem: 0.5 } as const;
type SignalKey = keyof typeof WEIGHTS;

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

function normaliseKeyword(score: number, maxHits: number): number {
  return maxHits === 0 ? 0 : score / maxHits;
}

function padDistance(pad: PAD, f: LibraryFeatures): number {
  if (f.energy === null || f.valence === null) return 1;
  const targetA = (pad.a + 1) / 2;
  const targetP = (pad.p + 1) / 2;
  return (Math.abs(targetA - f.energy) + Math.abs(targetP - f.valence)) / 2;
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return 1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Weighted average, automatically renormalized over signals that are present. */
function combineWeighted(scores: Partial<Record<SignalKey, number>>): number {
  const entries = (Object.entries(scores) as [SignalKey, number][]).filter(
    ([, v]) => v !== undefined,
  );
  if (entries.length === 0) return 0;
  const total = entries.reduce((s, [k]) => s + WEIGHTS[k], 0);
  return entries.reduce((s, [k, v]) => s + v * WEIGHTS[k], 0) / total;
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
  private lyrics: LyricsRepoLike;
  private makeProvider: ProviderFactory;

  constructor(
    opts: {
      repo?: LibraryRepoLike;
      features?: FeaturesRepoLike;
      lyrics?: LyricsRepoLike;
      makeProvider?: ProviderFactory;
    } = {},
  ) {
    this.repo = opts.repo ?? { listAll: libraryRepo.listAll };
    this.features = opts.features ?? { getBatch: featuresRepo.getBatch };
    this.lyrics = opts.lyrics ?? { getBatch: lyricsRepo.getBatch };
    this.makeProvider = opts.makeProvider ?? createEmbeddingProvider;
  }

  async prefilter(
    target: TargetProfile,
    currentPAD: PAD,
    limit = DEFAULT_LIMIT,
  ): Promise<LibraryTrack[]> {
    const tokens = tokenize(target);
    const all = await this.repo.listAll();
    if (all.length === 0) return [];
    const ids = all.map((t) => t.id);

    const provider = await this.makeProvider().catch(() => null);
    const [featuresByTrack, lyricsByTrack, targetVec] = await Promise.all([
      this.features.getBatch(ids).catch(() => new Map<string, LibraryFeatures>()),
      this.lyrics.getBatch(ids).catch(() => new Map<string, LyricsEmbedding>()),
      provider
        ? provider.embed(target).catch(() => null)
        : Promise.resolve(null),
    ]);

    const rawKeyword = all.map((t) => keywordScore(t, tokens));
    const maxHits = Math.max(...rawKeyword, 0);
    const anyKeyword = maxHits > 0;
    // "any features" means at least one row has a usable (non-null) axis.
    // A features table full of all-null rows must NOT count — otherwise the
    // scored path yields identical zeros for every track and JS stable sort
    // degrades to insertion order (deterministic same-N-forever).
    let anyFeatures = false;
    for (const f of featuresByTrack.values()) {
      if (f.energy !== null || f.valence !== null) {
        anyFeatures = true;
        break;
      }
    }
    const anySem = targetVec !== null && lyricsByTrack.size > 0;

    if (!anyKeyword && !anyFeatures && !anySem) {
      return shuffle(all).slice(0, limit);
    }

    const scored = all.map((t, i) => {
      const scores: Partial<Record<SignalKey, number>> = {};
      if (anyKeyword) scores.kw = normaliseKeyword(rawKeyword[i], maxHits);
      const feats = featuresByTrack.get(t.id);
      if (feats && (feats.energy !== null || feats.valence !== null)) {
        scores.pad = 1 - padDistance(currentPAD, feats);
      }
      const lyrEmb = lyricsByTrack.get(t.id);
      if (
        targetVec &&
        lyrEmb &&
        lyrEmb.embedding.length === targetVec.length
      ) {
        scores.sem = 1 - cosineDistance(targetVec, lyrEmb.embedding);
      }
      return { t, score: combineWeighted(scores) };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.t);
  }
}
