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
} from "../recommendation";

const DEFAULT_LIMIT = 30;

type LibraryRepoLike = { listAll(): Promise<LibraryTrack[]> };
type MusicProfileRepoLike = {
  getBatch(ids: string[]): Promise<Map<string, MusicProfile>>;
};

/** Minimal keyword score — fallback when no music profile exists. */
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

// ── Profile-based scoring ───────────────────────────────────────────────────

/** PAD distance in [0, 1], lower = closer match */
function padDistance(userPad: PAD, songPad: { p: number; a: number; d: number }): number {
  const dp = userPad.p - songPad.p;
  const da = userPad.a - songPad.a;
  const dd = userPad.d - songPad.d;
  const dist = Math.sqrt(dp * dp + da * da + dd * dd);
  return 1 - dist / Math.sqrt(3); // invert: 1 = perfect match
}

/** Overlap score between user emotion labels and song mood tags */
function moodOverlap(userLabels: string[], songMood: string[]): number {
  if (userLabels.length === 0 || songMood.length === 0) return 0;
  const userSet = new Set(userLabels.map(l => l.toLowerCase()));
  const songSet = new Set(songMood.map(m => m.toLowerCase()));
  let overlap = 0;
  for (const m of songSet) {
    for (const u of userSet) {
      if (m.includes(u) || u.includes(m)) {
        overlap++;
        break;
      }
    }
  }
  return overlap / Math.max(userSet.size, songSet.size);
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
    (isNight && /安静|安静|独处/i.test(lower)) ||
    (isMorning && /清新|清醒|新鲜/i.test(lower)) ||
    (isAfternoon && /悠闲|慵懒/i.test(lower)) ||
    (isEvening && /放松|收官/i.test(lower))
  ) {
    return 0.3;
  }

  return 0;
}

/** Scenario match: user utterance keywords vs best_for */
function scenarioScore(target: string, bestFor: string[]): number {
  if (bestFor.length === 0) return 0;
  const tokens = tokenize(target);
  if (tokens.length === 0) return 0;
  const lowerBest = bestFor.map(b => b.toLowerCase());
  let hits = 0;
  for (const t of tokens) {
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
 * Score a single track against the current emotional state.
 * Returns [0, 1] composite score before fatigue / feedback adjustments.
 */
function profileScore(
  track: LibraryTrack,
  profile: MusicProfile | null,
  pad: PAD,
  labels: string[],
  target: string,
  nowHour: number,
  audioPad?: PADProfile,
  noveltySeeking = 0.5,
): number {
  let padScore = 0;
  const effectivePad = audioPad ?? profile?.pad_estimate;
  if (effectivePad) {
    padScore = padDistance(pad, effectivePad) * 0.30;
  } else if (!profile || profile.llm_unknown) {
    const tokens = tokenize(target);
    const maxHits = Math.max(tokens.length, 1);
    const kw = keywordScore(track, tokens) / maxHits;
    return kw * 0.3;
  }

  // Jitter scales with novelty_seeking — explorers get a wider candidate band
  const jitterMax = 0.10 + noveltySeeking * 0.20;

  const scores = {
    pad: padScore,
    mood: moodOverlap(labels, profile?.mood ?? []) * 0.25,
    time: timeColorScore(nowHour, profile?.time_color ?? "") * 0.15,
    scenario: scenarioScore(target, profile?.best_for ?? []) * 0.15,
    jitter: Math.random() * jitterMax,
  };
  return scores.pad + scores.mood + scores.time + scores.scenario + scores.jitter;
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

// ── LibraryAgent ────────────────────────────────────────────────────────────

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
    /** bvid → real audio PAD from FFT extraction (takes priority over LLM guess) */
    audioPadMap?: Map<string, PADProfile>,
  ): Promise<LibraryTrack[]> {
    const all = await this.repo.listAll();
    const excludeIds = recCtx?.excludeIds;
    const filtered = excludeIds
      ? all.filter((t) => !excludeIds.has(t.id))
      : all;

    if (filtered.length === 0) return [];

    const profileMap = await this.profileRepo.getBatch(filtered.map((t) => t.id));
    const labels = target.split(/\s+/).filter(s => s.length <= 6);
    const nowHour = new Date().getHours();
    const noveltySeeking = recCtx?.noveltySeeking ?? 0.5;

    const scored = filtered.map((track) => {
      const bvid = track.id.startsWith("bili:") ? track.id.slice(5) : null;
      const audioPad = bvid ? audioPadMap?.get(bvid) : undefined;
      const base = profileScore(
        track, profileMap.get(track.id) ?? null, pad, labels, target, nowHour, audioPad, noveltySeeking,
      );
      return {
        track,
        score: applyRecommendationAdjustments(base, track.id, recCtx),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const sampled = stratifiedSample(
      scored.map((s) => ({ item: s.track, score: s.score })),
      limit,
      noveltySeeking,
    );

    return sampled;
  }
}
