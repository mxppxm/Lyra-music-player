import type { LibraryTrack, PAD } from "../types";
import type { MusicProfile } from "../types/musicProfile";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as musicProfileRepo from "../db/repo/musicProfileRepo";
import * as lyricsEmbeddingsRepo from "../db/repo/lyricsEmbeddingsRepo";
import { createEmbeddingProvider } from "../providers/embeddingProvider";
import type { PADProfile } from "../bilibili/audioFeatures";
import type { RecommendationContext } from "../recommendation";
import {
  fatiguePenaltyWeight,
  feedbackPenalty,
  stratifiedSample,
  tagOverlap,
  genreAffinityScore,
  energyMatchScore,
  profileQualityMultiplier,
  profileSearchHaystack,
  tokenize,
  keywordScoreFromHaystack,
} from "../recommendation";
import { expandWithSynonyms, areSynonyms } from "../recommendation/moodSynonyms";

const DEFAULT_LIMIT = 30;

/** Cosine similarity between two Float32Arrays. Returns 0 if either is empty. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

type LibraryRepoLike = { listAll(): Promise<LibraryTrack[]> };
type MusicProfileRepoLike = {
  getBatch(ids: string[]): Promise<Map<string, MusicProfile>>;
};

/** PAD distance in [0, 1], lower = closer match */
function padDistance(userPad: PAD, songPad: { p: number; a: number; d: number }): number {
  const dp = userPad.p - songPad.p;
  const da = userPad.a - songPad.a;
  const dd = userPad.d - songPad.d;
  const dist = Math.sqrt(dp * dp + da * da + dd * dd);
  return 1 - dist / Math.sqrt(3);
}

/** Time-of-day match: current hour → song's time_color hint */
function timeColorScore(hour: number, timeColor: string): number {
  const lower = timeColor.toLowerCase();
  const isNight = hour >= 22 || hour < 5;
  const isMorning = hour >= 5 && hour < 11;
  const isAfternoon = hour >= 11 && hour < 17;
  const isEvening = hour >= 17 && hour < 22;

  if (
    (isNight && /凌晨|深夜|夜晚|半夜|夜|dark|night/i.test(lower)) ||
    (isMorning && /早晨|清晨|早上|日出|morning|dawn/i.test(lower)) ||
    (isAfternoon && /午后|下午|午后|afternoon/i.test(lower)) ||
    (isEvening && /傍晚|黄昏|晚上|dusk|evening/i.test(lower))
  ) {
    return 1;
  }

  if (
    (isNight && /晚/i.test(lower)) ||
    (isMorning && /早|晨/i.test(lower)) ||
    (isAfternoon && /午|太阳/i.test(lower)) ||
    (isEvening && /晚|夕|暮/i.test(lower))
  ) {
    return 0.5;
  }

  if (
    (isNight && /安静|独处/i.test(lower)) ||
    (isMorning && /清新|清醒|新鲜/i.test(lower)) ||
    (isAfternoon && /悠闲|慵懒/i.test(lower)) ||
    (isEvening && /放松|收官/i.test(lower))
  ) {
    return 0.3;
  }

  return 0;
}

/** Scenario match: user utterance keywords vs best_for.
 *  Supports cross-language synonym matching — "无聊" can match "情绪低落时". */
function scenarioScore(queryTokens: string[], bestFor: string[]): number {
  if (bestFor.length === 0 || queryTokens.length === 0) return 0;
  // Expand query tokens with synonyms for cross-language matching
  const expandedTokens = expandWithSynonyms(queryTokens);
  const lowerBest = bestFor.map((b) => b.toLowerCase());
  let hits = 0;
  for (const t of expandedTokens) {
    const tLow = t.toLowerCase();
    for (const b of lowerBest) {
      if (b.includes(tLow) || tLow.includes(b) || areSynonyms(tLow, b)) {
        hits++;
        break;
      }
    }
  }
  return Math.min(hits / bestFor.length, 1);
}

/**
 * Score a single track against the current emotional state + recommendation context.
 */
function profileScore(
  track: LibraryTrack,
  profile: MusicProfile | null,
  pad: PAD,
  emotionLabels: string[],
  queryTokens: string[],
  nowHour: number,
  recCtx: RecommendationContext | undefined,
  audioPad?: PADProfile,
  noveltySeeking = 0.5,
  semanticSim = 0,
): number {
  const effectivePad = audioPad ?? profile?.pad_estimate;

  if (!profile && !effectivePad) {
    const hay = profileSearchHaystack(track, null);
    const maxHits = Math.max(queryTokens.length, 1);
    const kwBase = (keywordScoreFromHaystack(hay, queryTokens) / maxHits) * 0.25;
    // Semantic score can rescue tracks with no profile
    const semBoost = semanticSim * 0.15;
    return kwBase + semBoost;
  }

  if (profile?.llm_unknown && !effectivePad) {
    const hay = profileSearchHaystack(track, profile);
    const maxHits = Math.max(queryTokens.length, 1);
    const kwBase = (keywordScoreFromHaystack(hay, queryTokens) / maxHits) * 0.22;
    const semBoost = semanticSim * 0.12;
    return kwBase + semBoost;
  }

  let padScore = 0;
  if (effectivePad) {
    padScore = padDistance(pad, effectivePad) * 0.28;
  }

  const moodScore = tagOverlap(emotionLabels, queryTokens, profile?.mood ?? []) * 0.22;
  const themeScore =
    tagOverlap(emotionLabels, queryTokens, profile?.lyrical_themes ?? []) * 0.1;
  const genreScore = genreAffinityScore(profile, recCtx?.soul) * 0.08;
  const energyScore = energyMatchScore(profile, pad.a) * 0.07;
  const timeScore = timeColorScore(nowHour, profile?.time_color ?? "") * 0.1;
  const scenario = scenarioScore(queryTokens, profile?.best_for ?? []) * 0.1;
  // Semantic similarity from lyrics embeddings — captures meaning beyond keywords
  const semScore = semanticSim * 0.15;

  const jitterMax = 0.08 + noveltySeeking * 0.18;
  const jitter = Math.random() * jitterMax;

  let total =
    padScore + moodScore + themeScore + genreScore + energyScore + timeScore + scenario + semScore + jitter;

  total *= profileQualityMultiplier(profile);

  if (!profile) {
    const hay = profileSearchHaystack(track, null);
    const kw = keywordScoreFromHaystack(hay, queryTokens);
    if (kw > 0) total += (kw / Math.max(queryTokens.length, 1)) * 0.12;
  }

  return total;
}

function applyRecommendationAdjustments(
  baseScore: number,
  trackId: string,
  recCtx: RecommendationContext | undefined,
): number {
  if (!recCtx) return baseScore;

  let score = baseScore;
  const fatigue = recCtx.fatigueByTrack.get(trackId) ?? 0;
  if (fatigue > 0) {
    score -= fatigue * fatiguePenaltyWeight(recCtx.noveltySeeking);
  }

  const fb = recCtx.feedbackStats.get(trackId);
  const fbPen = feedbackPenalty(fb, recCtx.noveltySeeking);
  score -= fbPen;

  return score;
}

export class LibraryAgent {
  private repo: LibraryRepoLike;
  private profileRepo: MusicProfileRepoLike;

  constructor(opts: {
    repo?: LibraryRepoLike;
    profileRepo?: MusicProfileRepoLike;
  } = {}) {
    this.repo = opts.repo ?? libraryRepo;
    this.profileRepo = opts.profileRepo ?? musicProfileRepo;
  }

  async prefilter(
    target: string,
    pad: PAD,
    limit: number = DEFAULT_LIMIT,
    recCtx?: RecommendationContext,
    audioPadMap?: Map<string, PADProfile>,
  ): Promise<LibraryTrack[]> {
    const all = await this.repo.listAll();
    const excludeIds = recCtx?.excludeIds;
    const filtered = excludeIds ? all.filter((t) => !excludeIds.has(t.id)) : all;

    if (filtered.length === 0) return [];

    const profileMap = await this.profileRepo.getBatch(filtered.map((t) => t.id));
    const emotionLabels = recCtx?.emotionLabels ?? [];
    const queryTokens = tokenize(target);
    const nowHour = new Date().getHours();
    const noveltySeeking = recCtx?.noveltySeeking ?? 0.5;

    // ── Semantic search via lyrics embeddings ──
    // Embed the query, load all track embeddings, compute cosine similarity.
    // Graceful degradation: if embedding provider is unavailable or no
    // embeddings exist, semanticSim defaults to 0 for all tracks.
    const semanticMap = new Map<string, number>();
    try {
      const provider = await createEmbeddingProvider();
      if (provider) {
        const queryEmbedding = await provider.embed(target);
        if (queryEmbedding.length > 0) {
          const embMap = await lyricsEmbeddingsRepo.getBatch(filtered.map((t) => t.id));
          for (const track of filtered) {
            const emb = embMap.get(track.id);
            if (emb && emb.embedding.length === queryEmbedding.length) {
              semanticMap.set(track.id, cosineSimilarity(queryEmbedding, emb.embedding));
            }
          }
        }
      }
    } catch (e) {
      // Embedding provider or DB failure — degrade silently
      console.warn("[lyra] semantic search unavailable, falling back to keyword+pad:", e);
    }

    const scored = filtered.map((track) => {
      const bvid = track.id.startsWith("bili:") ? track.id.slice(5) : null;
      const audioPad = bvid ? audioPadMap?.get(bvid) : undefined;
      const profile = profileMap.get(track.id) ?? null;
      const semanticSim = semanticMap.get(track.id) ?? 0;
      const base = profileScore(
        track,
        profile,
        pad,
        [...emotionLabels],
        queryTokens,
        nowHour,
        recCtx,
        audioPad,
        noveltySeeking,
        semanticSim,
      );
      return {
        track,
        score: applyRecommendationAdjustments(base, track.id, recCtx),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return stratifiedSample(
      scored.map((s) => ({ item: s.track, score: s.score })),
      limit,
      noveltySeeking,
    );
  }
}
