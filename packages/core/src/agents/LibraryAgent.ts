import type { LibraryTrack, PAD } from "../types";
import type { MusicProfile } from "../types/musicProfile";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as musicProfileRepo from "../db/repo/musicProfileRepo";
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
import { trackMatchesArtist } from "../library/parseArtistIntent";
import { timeContextScore } from "../recommendation/timeContext";

const DEFAULT_LIMIT = 30;

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
 *  Also translates English mood tags to Chinese for cross-language matching. */
function scenarioScore(queryTokens: string[], bestFor: string[]): number {
  if (bestFor.length === 0 || queryTokens.length === 0) return 0;
  const lowerBest = bestFor.map((b) => b.toLowerCase());
  let hits = 0;
  for (const t of queryTokens) {
    for (const b of lowerBest) {
      if (b.includes(t) || t.includes(b)) {
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
  moodLocked = false,
): number {
  const effectivePad = audioPad ?? profile?.pad_estimate;

  if (!profile && !effectivePad) {
    const hay = profileSearchHaystack(track, null);
    const maxHits = Math.max(queryTokens.length, 1);
    return (keywordScoreFromHaystack(hay, queryTokens) / maxHits) * 0.25;
  }

  if (profile?.llm_unknown && !effectivePad) {
    const hay = profileSearchHaystack(track, profile);
    const maxHits = Math.max(queryTokens.length, 1);
    return (keywordScoreFromHaystack(hay, queryTokens) / maxHits) * 0.22;
  }

  let padScore = 0;
  if (effectivePad) {
    padScore = padDistance(pad, effectivePad) * (moodLocked ? 0.38 : 0.28);
  }

  const moodScore = tagOverlap(emotionLabels, queryTokens, profile?.mood ?? []) * (moodLocked ? 0.32 : 0.22);
  const themeScore =
    tagOverlap(emotionLabels, queryTokens, profile?.lyrical_themes ?? []) * (moodLocked ? 0.08 : 0.1);
  const genreScore = genreAffinityScore(profile, recCtx?.soul) * (moodLocked ? 0.06 : 0.08);
  const energyScore = energyMatchScore(profile, pad.a) * (moodLocked ? 0.06 : 0.07);

  // 时间维度：优先用时间上下文（季节/星期/时段/上班休息 → best_for + time_color），
  // 无上下文时退回原有「小时 × time_color」匹配。
  const timeCtx = recCtx?.timeContext;
  const timeMatch = timeCtx
    ? timeContextScore(timeCtx, profile?.best_for ?? [], profile?.time_color ?? "")
    : timeColorScore(nowHour, profile?.time_color ?? "");
  const timeScore = timeMatch * (moodLocked ? 0.06 : 0.12);
  const scenario = scenarioScore(queryTokens, profile?.best_for ?? []) * (moodLocked ? 0.04 : 0.1);

  const jitterMax = moodLocked ? 0.04 + noveltySeeking * 0.06 : 0.08 + noveltySeeking * 0.18;
  const jitter = Math.random() * jitterMax;

  let total =
    padScore + moodScore + themeScore + genreScore + energyScore + timeScore + scenario + jitter;

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
  const moodLocked = recCtx.moodLocked ?? false;
  const fatigue = recCtx.fatigueByTrack.get(trackId) ?? 0;
  if (fatigue > 0) {
    score -= fatigue * fatiguePenaltyWeight(recCtx.noveltySeeking, moodLocked);
  }

  const fb = recCtx.feedbackStats.get(trackId);
  const fbPen = feedbackPenalty(fb, recCtx.noveltySeeking, moodLocked);
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
    const artistFilter = recCtx?.artistFilter?.trim();

    let filtered: LibraryTrack[];
    let profileMap: Map<string, MusicProfile>;

    if (artistFilter) {
      profileMap = await this.profileRepo.getBatch(all.map((t) => t.id));
      const artistPool = all.filter((t) =>
        trackMatchesArtist(t, profileMap.get(t.id) ?? null, artistFilter),
      );
      if (artistPool.length === 0) return [];

      const sessionPlayed = recCtx?.artistSessionPlayedIds;
      const unplayedInSession = sessionPlayed?.size
        ? artistPool.filter((t) => !sessionPlayed.has(t.id))
        : artistPool;

      if (unplayedInSession.length > 0) {
        filtered = unplayedInSession;
        const excludeIds = recCtx?.excludeIds;
        if (excludeIds?.size) {
          const afterExclude = filtered.filter((t) => !excludeIds.has(t.id));
          // Prefer fresh songs, but never empty the pool while session still has unplayed tracks.
          if (afterExclude.length > 0) filtered = afterExclude;
        }
      } else {
        // Artist pool exhausted this session — cycle, avoiding only current/queued.
        filtered = artistPool;
        const immediate = recCtx?.immediateExcludeIds;
        if (immediate?.size) {
          const afterImmediate = filtered.filter((t) => !immediate.has(t.id));
          if (afterImmediate.length > 0) filtered = afterImmediate;
        }
      }
    } else {
      const excludeIds = recCtx?.excludeIds;
      filtered = excludeIds ? all.filter((t) => !excludeIds.has(t.id)) : all;
      if (filtered.length === 0) return [];
      profileMap = await this.profileRepo.getBatch(filtered.map((t) => t.id));
    }

    if (filtered.length === 0) return [];

    const emotionLabels = recCtx?.emotionLabels ?? [];
    const queryTokens = tokenize(target);
    const nowHour = new Date().getHours();
    const noveltySeeking = recCtx?.noveltySeeking ?? 0.5;
    const moodLocked = recCtx?.moodLocked ?? false;

    const scored = filtered.map((track) => {
      const bvid = track.id.startsWith("bili:") ? track.id.slice(5) : null;
      const audioPad = bvid ? audioPadMap?.get(bvid) : undefined;
      const profile = profileMap.get(track.id) ?? null;
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
        moodLocked,
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
      moodLocked,
    );
  }
}
