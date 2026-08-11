import type { DialogueTurn, LibraryTrack, PAD, CurrentEmotion } from "../types";
import type { EmotionAgent } from "../agents/EmotionAgent";
import type { CompanionAgent } from "../agents/CompanionAgent";
import type { LibraryAgent } from "../agents/LibraryAgent";
import type { SoulState } from "../types";
import { foldReactionEvents, computeEmotionDelta } from "./reactionCapture";
import type { ReactionEvent } from "./reactionCapture";
import { getMemoryContext } from "../memory/context";
import { detectSalientMoment } from "../moments/salient";
import { currentTagsFor } from "./currentTags";
import { insertSharedMemory } from "../db/repo/sharedMemoryRepo";
import { appendSalientMomentToMemoryMd } from "../memory/appendSalient";
import type { ProactiveIntent } from "../proactive/types";
import { setBreathing } from "../tray/trayBridge";
import type { PerceptionBias } from "../perception/PerceptionAgent";
import type { EventBus } from "../perception/events";
import * as musicProfileRepo from "../db/repo/musicProfileRepo";
import type { TrackFeedback } from "../types/musicProfile";
import { buildRecommendationContext } from "../recommendation";
import {
  computeTimeContext,
  type WeatherContext,
} from "../recommendation/timeContext";
import * as libraryRepo from "../db/repo/libraryRepo";
import { parseArtistIntent } from "../library/parseArtistIntent";
import {
  resolveSongIntent,
} from "../library/songIntent";
import { songDisplayArtist, songDisplayTitle } from "../library/display";
import { resolveAndPersistLyrics } from "../library/resolveLyrics";
import { looksLikePartialLyrics } from "../agents/LyricsAgent";

export type PrefetchNextResult = {
  url: string;
  songId: string;
  title: string;
  artist: string;
  durationMs: number;
  coverUrl?: string;
};

export type SoulStoreLike = {
  load(): Promise<SoulState>;
  apply?: (delta: PAD) => Promise<SoulState>;
};

type SoulStore = SoulStoreLike;

export type OrchestratorState =
  | { kind: "idle" }
  | { kind: "thinking"; user_utterance: string }
  | {
      kind: "playing";
      turn: DialogueTurn;
      song: LibraryTrack;
      paused?: boolean;
      /** Fresh replay copy is still being written — UI may show a light loader. */
      rationalePending?: boolean;
      /** 锁定播放（单曲循环）开启。 */
      trackLocked?: boolean;
    }
  | { kind: "error"; message: string }
  | { kind: "proactive-pending"; intent: ProactiveIntent; song: LibraryTrack; rationale: string };

export type OrchestratorDeps = {
  emotion: EmotionAgent;
  companion: CompanionAgent;
  library: LibraryAgent;
  soulStore: SoulStore;
  turnRepo: {
    insertTurn(t: DialogueTurn): Promise<void>;
    updateTurn?(t: DialogueTurn): Promise<void>;
    listRecentTurns?(limit: number): Promise<DialogueTurn[]>;
    setTurnLatency?(id: string, ms: number): Promise<void>;
  };
  /** On-demand lyrics via LLM (iOS note-card flip). */
  lyrics?: {
    fetch(input: { title: string; artist?: string }): Promise<string>;
  };
  audio: {
    // playFile may return the Rust playback id (a number) so the caller can
    // correlate the "audio-complete" event. Orchestrator itself doesn't use
    // the id; the correlation is done at the App/subscriber level.
    // `durationMs` is a hint used by Rust to arm a duration-based safety
    // net so auto-advance still fires on tracks where Sink::empty() never
    // flips. Null/undefined skips it.
    playFile(path: string, durationMs?: number | null): Promise<number | void>;
    stop(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
  };
  /** Resolve library path → playable URL (Bilibili DASH, etc.). iOS prefetch. */
  resolvePlayUrl?: (path: string) => Promise<string | null>;
  /** Optional perception event bus — if provided, Orchestrator emits
   * input_submit / skip / complete events for the aggregator. */
  eventBus?: EventBus;
  clock?: () => number;
  idGen?: () => string;
};

/** Context from the song that just ended, so the next rationale can make a
 *  natural DJ-like transition instead of repeating a template. */
export type AutoAdvanceContext = {
  previousRationale: string;
  previousSong: { title: string; artist?: string };
};

/** What the user (or the auto-advance flow) last asked the Orchestrator to
 *  do — replayed by `onRetry()` so the “点一下重试” affordance on the error
 *  note can re-run the exact same intent. */
type RetryIntent =
  | { kind: "text"; text: string }
  | { kind: "lyra-start" }
  | {
      kind: "auto-advance";
      emotion: import("../types").CurrentEmotion;
      autoCtx?: AutoAdvanceContext;
    };

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };

/** Sentinel returned when a cancelled advance stops waiting on its own work. */
const ADVANCE_CANCELLED = Symbol("advance-cancelled");

/** Session stack entry for immersive previous / undo-skip. */
type PlayStackEntry = {
  track: LibraryTrack;
  rationale: string;
  emotion: CurrentEmotion;
};

type NativeQueuePlanEntry = {
  song: LibraryTrack;
  baseEmotion: CurrentEmotion;
  rationale: string;
  playUrl: string;
};

/** Neighbor display pack for immersive swipe (more than just a cover). */
export type SwipeNeighbor = {
  songId: string;
  coverUrl: string | null;
  title: string;
  artist: string;
  rationale: string;
  pad: PAD;
};

function toSwipeNeighbor(
  track: LibraryTrack,
  rationale: string,
  emotion: CurrentEmotion,
): SwipeNeighbor {
  const coverRaw = track.metadata?.cover;
  return {
    songId: track.id,
    coverUrl: typeof coverRaw === "string" ? coverRaw : null,
    title: songDisplayTitle(track),
    artist: songDisplayArtist(track),
    rationale,
    pad: emotion.pad,
  };
}

export class Orchestrator {
  private state: OrchestratorState = { kind: "idle" };
  private subs = new Set<(s: OrchestratorState) => void>();
  private deps: OrchestratorDeps;

  /** The turn that is currently playing, accumulating reaction events. */
  private currentTurn: DialogueTurn | null = null;
  /** The song that is currently playing (paired with currentTurn). */
  private currentSong: LibraryTrack | null = null;
  /** Pending reaction events for the current turn. */
  private pendingEvents: ReactionEvent[] = [];
  /** Latest perception bias — blended into onUserInput emotion when set. */
  private perceptionBias: PerceptionBias | null = null;
  /** 天气上下文（由 App 的天气 tick 注入）—— 推荐打分与伪目标文案感知天气。 */
  private weatherContext: WeatherContext | null = null;
  /** Guard against concurrent fulfillProactive calls. */
  private proactiveInFlight = false;
  /**
   * Songs left via skip / natural complete — right-swipe / previous pops.
   * Cleared on history replay (fresh listen path).
   */
  private playStack: PlayStackEntry[] = [];
  /**
   * Bumped to cancel an in-flight auto-advance (skip/complete) before it
   * starts playing the next track — used when the user goes previous during
   * thinking/loading.
   */
  private advanceEpoch = 0;
  /** Woken when advanceEpoch changes so a cancelled advance stops awaiting
   *  its (slow) LLM pick and releases the transition chain immediately. */
  private advanceCancelWaiters = new Set<() => void>();
  /** Serialises all state transitions (auto-advance, native sync, skip, user
   *  input). Without this, concurrent play events (onSongComplete vs
   *  onNativeAutoAdvanced, ended + progress fallback) interleave mid-flight
   *  and stomp each other's currentTurn / pendingEvents / nativeQueuePlan /
   *  emit — visible as "thinking…" while audio plays, then a sudden swap. */
  private transitionChain: Promise<void> = Promise.resolve();
  /** Ordered plan for native queue — head plays after the current track. */
  private nativeQueuePlan: NativeQueuePlanEntry[] = [];
  /** songId → LLM rationale, survives nativeQueuePlan clears so background
   *  auto-advance never falls back to canned copy. Session-scoped. */
  private rationaleBySongId = new Map<string, string>();
  /** Resolved URLs survive back/forward navigation within this session. */
  private playUrlBySongId = new Map<string, string>();
  /** Persists across auto-advance until the user submits new input in the text box. */
  private activeArtistFilter: string | null = null;
  /** Tracks which artist-pool songs were played in the current artist session. */
  private artistSessionPlayedIds = new Set<string>();
  /**
   * 会话心情锚点：记录这条播放流的「心情入口」。
   * - 用户心情输入 → EmotionAgent 标签 + 原话（locked）
   * - 点歌命中 → 首曲直达该曲；同一句输入当心情分析并锁定，后续连播跟锚点
   * - 点我试试 → 时间上下文默认心情 + 时间伪目标（unlocked）
   * 连播时持续用它做 pseudoTarget，直到用户下一次新输入才更新。
   */
  private sessionMoodAnchor: { labels: string[]; pseudoTarget: string; locked: boolean } | null = null;
  /** Last user/auto-advance intent — replayed by onRetry() after an error. */
  private lastIntent: RetryIntent | null = null;
  /** In-flight lyrics fetches keyed by song id — flip spam shares one request. */
  private lyricsInFlight = new Map<string, Promise<string>>();
  /** Session-only single-track loop; cleared on skip / previous / new input / replay. */
  private trackLock: {
    enabled: boolean;
    songId: string;
    playCount: number;
  } | null = null;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
  }

  /**
   * Resolve plain-text lyrics for the currently playing song.
   * Cache order: current turn → recent turns with same song_id → LLM.
   * Persists onto the current dialogue turn when newly resolved.
   * Pass `{ force: true }` to bypass cache and overwrite with a fresh LLM fetch.
   */
  async getLyrics(opts?: { force?: boolean }): Promise<string> {
    if (
      this.state.kind !== "playing" ||
      !this.currentTurn ||
      !this.currentSong
    ) {
      throw new Error("lyrics only available while playing");
    }
    const turnId = this.currentTurn.id;
    const songId = this.currentSong.id;
    const force = Boolean(opts?.force);

    if (!force) {
      const cachedRaw = this.currentTurn.agent_response.lyrics?.trim();
      // Ignore chorus-only / truncated cache — re-fetch full lyrics.
      if (cachedRaw && !looksLikePartialLyrics(cachedRaw)) return cachedRaw;

      const existing = this.lyricsInFlight.get(songId);
      if (existing) return existing;
    } else {
      this.lyricsInFlight.delete(songId);
    }

    const { turnRepo, lyrics } = this.deps;
    if (!turnRepo.listRecentTurns || !turnRepo.updateTurn) {
      throw new Error("lyrics persistence unavailable");
    }
    if (!lyrics) {
      throw new Error("lyrics fetcher unavailable");
    }

    const turnSnapshot = this.currentTurn;
    const songSnapshot = this.currentSong;
    const promise = (async () => {
      try {
        return await resolveAndPersistLyrics({
          turn: turnSnapshot,
          title: songDisplayTitle(songSnapshot),
          artist: songDisplayArtist(songSnapshot) || undefined,
          force,
          listRecentTurns: (limit) => turnRepo.listRecentTurns!(limit),
          updateTurn: async (t) => {
            // Song/turn changed mid-flight — do not write the stale turn.
            if (
              this.currentTurn?.id !== turnId ||
              this.currentSong?.id !== songId
            ) {
              return;
            }
            const lyricsText = t.agent_response.lyrics?.trim();
            if (!lyricsText) return;
            // Merge onto the live turn so mid-play reaction fields are kept.
            const merged: DialogueTurn = {
              ...this.currentTurn,
              agent_response: {
                ...this.currentTurn.agent_response,
                lyrics: lyricsText,
              },
            };
            await turnRepo.updateTurn!(merged);
            this.currentTurn = merged;
            if (this.state.kind === "playing") {
              this.emit({ ...this.state, turn: merged });
            }
          },
          fetchLyrics: (input) => lyrics.fetch(input),
        });
      } finally {
        this.lyricsInFlight.delete(songId);
      }
    })();

    this.lyricsInFlight.set(songId, promise);
    return promise;
  }

  /**
   * Store the latest PerceptionBias derived by the App-level PerceptionAgent.
   * Pass `null` to clear. onUserInput consumes this to blend PAD before
   * running companion song selection.
   */
  setPerceptionBias(bias: PerceptionBias | null): void {
    this.perceptionBias = bias;
  }

  /** Active artist-only session, if any. Cleared when user sends non-artist input. */
  getActiveArtistFilter(): string | null {
    return this.activeArtistFilter;
  }

  /**
   * 搜索歌手播放 —— 暂时禁用（用户需求）。
   * 保留函数与调用点，activeArtistFilter 永为 null，歌手会话不再触发；
   * 后续要恢复只需把下面这行 return 移除。
   */
  private async updateArtistFilterFromUserInput(text: string): Promise<void> {
    return; // [暂时禁用] 搜索歌手播放。下面的歌手解析逻辑保留未删。
    const artist = parseArtistIntent(text);
    if (artist) {
      // Validate against the library — if no track matches this "artist",
      // it's almost certainly a mood/scene word that slipped through the regex.
      const exists = await libraryRepo.artistExists(artist!);
      if (!exists) {
        console.log(`[lyra] artist session skipped: "${artist}" not found in library (likely mood/scene)`);
        // Don't set the filter — let the utterance fall through to mood matching.
        // Also clear any previous artist session so the user isn't stuck.
        if (this.activeArtistFilter) {
          this.activeArtistFilter = null;
          this.nativeQueuePlan = [];
          this.artistSessionPlayedIds.clear();
        }
        return;
      }
      if (this.activeArtistFilter !== artist) {
        this.nativeQueuePlan = [];
        this.artistSessionPlayedIds.clear();
      }
      this.activeArtistFilter = artist;
      console.log(`[lyra] artist session: ${artist}`);
      return;
    }
    if (text.trim() && this.activeArtistFilter) {
      console.log("[lyra] artist session cleared");
      this.activeArtistFilter = null;
      this.nativeQueuePlan = [];
      this.artistSessionPlayedIds.clear();
    }
  }

  private recordArtistSessionPlay(songId: string): void {
    if (!this.activeArtistFilter) return;
    this.artistSessionPlayedIds.add(songId);
  }

  private withArtistScopedContext<T extends { artistFilter?: string }>(
    recCtx: T,
  ): T {
    if (!this.activeArtistFilter) return recCtx;
    return { ...recCtx, artistFilter: this.activeArtistFilter };
  }

  private pseudoTargetWithArtist(base: string): string {
    const trimmed = base.trim();
    if (!this.activeArtistFilter) return trimmed;
    return `${this.activeArtistFilter} ${trimmed}`.trim();
  }

  private captureAutoAdvanceContext(): AutoAdvanceContext | undefined {
    const prevRationale = this.currentTurn?.agent_response.rationale ?? "";
    const prevSong = this.currentSong
      ? { title: this.currentSong.title ?? "", artist: this.currentSong.artist }
      : undefined;
    if (!prevRationale || !prevSong?.title) return undefined;
    return { previousRationale: prevRationale, previousSong: prevSong };
  }

  getState(): OrchestratorState {
    return this.state;
  }

  /** Toggle single-track lock-play. Binds to current song; playCount starts at 1. */
  setTrackLock(enabled: boolean): void {
    if (!enabled) {
      this.clearTrackLock();
      if (this.state.kind === "playing") {
        this.emit({ ...this.state, trackLocked: false });
      }
      return;
    }
    if (!this.currentSong || this.state.kind !== "playing") return;
    this.trackLock = {
      enabled: true,
      songId: this.currentSong.id,
      playCount: 1,
    };
    // Drop planned next so lock completion cannot consume a queued track.
    this.nativeQueuePlan = [];
    this.emit({ ...this.state, trackLocked: true });
  }

  isTrackLockEnabled(): boolean {
    return Boolean(this.trackLock?.enabled);
  }

  getTrackLockPlayCount(): number {
    return this.trackLock?.enabled ? this.trackLock.playCount : 0;
  }

  clearTrackLock(): void {
    this.trackLock = null;
  }

  /** True when immersive previous / undo-skip has a song to restore. */
  canGoPrevious(): boolean {
    return this.playStack.length > 0;
  }

  /** True when a prefetched next track is ready to swipe into (no thinking gap). */
  canGoNext(): boolean {
    return this.nativeQueuePlan.length > 0;
  }

  /**
   * Neighbors for immersive swipe — previous = play-stack top,
   * next = native queue head. Full display pack (cover + copy + pad).
   */
  peekPrevious(): SwipeNeighbor | null {
    const entry = this.playStack[this.playStack.length - 1];
    return entry
      ? toSwipeNeighbor(entry.track, entry.rationale, entry.emotion)
      : null;
  }

  peekNext(): SwipeNeighbor | null {
    const entry = this.nativeQueuePlan[0];
    return entry
      ? toSwipeNeighbor(entry.song, entry.rationale, entry.baseEmotion)
      : null;
  }

  private pushPlayStackFromCurrent(): void {
    if (!this.currentSong || !this.currentTurn) return;
    this.playStack.push({
      track: this.currentSong,
      rationale: this.currentTurn.agent_response.rationale,
      emotion: this.currentTurn.current_emotion,
    });
  }

  private clearPlayStack(): void {
    this.playStack = [];
  }

  /**
   * Invalidate the in-flight auto-advance. Discarding its result is not
   * enough: the transition chain stays blocked until it stops awaiting, so a
   * user-driven previous/replay would only be heard after the LLM answered.
   */
  private cancelInFlightAdvance(): void {
    this.advanceEpoch += 1;
    const waiters = [...this.advanceCancelWaiters];
    this.advanceCancelWaiters.clear();
    for (const wake of waiters) wake();
  }

  private raceAdvanceCancel<T>(
    epoch: number,
    work: Promise<T>,
  ): Promise<T | typeof ADVANCE_CANCELLED> {
    if (epoch !== this.advanceEpoch) {
      // Swallow the abandoned work's failure — nobody is listening anymore.
      void work.catch(() => {});
      return Promise.resolve(ADVANCE_CANCELLED);
    }
    let wake!: () => void;
    const cancelled = new Promise<typeof ADVANCE_CANCELLED>((resolve) => {
      wake = () => resolve(ADVANCE_CANCELLED);
      this.advanceCancelWaiters.add(wake);
    });
    return Promise.race([work, cancelled]).finally(() => {
      this.advanceCancelWaiters.delete(wake);
    });
  }

  subscribe(cb: (s: OrchestratorState) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  /**
   * 注入当前天气上下文（由 App 的天气 tick 周期调用）。
   * 推荐打分（timeContextScore 天气维度）与伪目标文案（「…，下雨天」）随即感知天气。
   */
  setWeatherContext(weather: WeatherContext | null): void {
    this.weatherContext = weather;
  }

  private emit(s: OrchestratorState): void {
    this.state = s;
    for (const cb of this.subs) cb(s);
  }

  /** Run a state transition serially: later transitions wait for earlier
   *  ones to finish, so two play events can never interleave. The chain stays
   *  alive even when a transition rejects. */
  private enqueueTransition<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.transitionChain.then(fn, fn);
    this.transitionChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Finalise the previous turn: fold events, optionally apply verbal, update soul, persist. */
  private async finalisePreviousTurn(verbalText?: string, postPad?: PAD): Promise<void> {
    if (!this.currentTurn) return;

    const { soulStore, turnRepo } = this.deps;
    let events = [...this.pendingEvents];

    // If there's a verbal follow-up from the next utterance and the turn has no verbal yet
    const hasVerbal = this.currentTurn.user_reaction.verbal !== undefined
      || events.some((e) => e.kind === "verbal_next");

    if (verbalText !== undefined && !hasVerbal) {
      events.push({
        kind: "verbal_next",
        content: verbalText,
        parsed_valence: "neutral",
      });
    }

    // Fold all events into the turn
    const folded = foldReactionEvents(this.currentTurn, events);

    // Compute emotion delta and update soul
    if (postPad !== undefined && soulStore.apply) {
      const prePad = folded.current_emotion.pad;
      const delta = computeEmotionDelta(prePad, postPad);
      await soulStore.apply(delta);
    }

    // Update the turn's emotion_delta if we have postPad
    const finalTurn: DialogueTurn = postPad !== undefined
      ? {
          ...folded,
          emotion_delta: computeEmotionDelta(folded.current_emotion.pad, postPad),
        }
      : folded;

    // Persist the updated turn
    if (turnRepo.updateTurn) {
      await turnRepo.updateTurn(finalTurn);
    }

    // Detect salient moment and persist to shared_memory + memory.md
    const currentSong = this.currentSong;
    if (currentSong) {
      try {
        const moment = detectSalientMoment({
          turn: finalTurn,
          song: currentSong,
          currentTags: currentTagsFor(new Date()),
        });
        if (moment) {
          try {
            await insertSharedMemory(moment);
          } catch (e) {
            console.warn("[lyra] sharedMemoryRepo.insertSharedMemory failed:", e);
          }
          try {
            await appendSalientMomentToMemoryMd(moment);
          } catch (e) {
            console.warn("[lyra] appendSalientMomentToMemoryMd failed:", e);
          }
        }
      } catch (e) {
        console.warn("[lyra] detectSalientMoment failed:", e);
      }

      // Write track feedback for taste evolution
      try {
        const fb = turnToFeedback(finalTurn, currentSong.id);
        if (fb) {
          await musicProfileRepo.insertFeedback(fb);
        }
      } catch (e) {
        console.warn("[lyra] insertFeedback failed:", e);
      }
    }

    this.currentTurn = null;
    this.currentSong = null;
    this.pendingEvents = [];
  }

  /**
   * Run a full turn given an already-analysed emotion + a user utterance +
   * a modality. Shared between `onUserInput` (modality "text", with a fresh
   * EmotionAgent analysis) and `autoAdvance` (modality "proactive-open",
   * carrying the ended turn's emotion forward).
   *
   * Assumes `finalisePreviousTurn` has already been called by the caller.
   * Does NOT emit `thinking` — the caller emits it (to preserve the correct
   * `user_utterance` in the state).
   */
  private buildTurn(
    emotion: import("../types").CurrentEmotion,
    userUtterance: string,
    modality: "text" | "voice" | "proactive-open",
    song: LibraryTrack,
    rationale: string,
  ): DialogueTurn {
    const clock = this.deps.clock ?? Date.now;
    const idGen = this.deps.idGen ?? (() => crypto.randomUUID());
    return {
      id: idGen(),
      timestamp: clock(),
      current_emotion: emotion,
      user_utterance: { modality, content: userUtterance },
      agent_response: { song_id: song.id, rationale },
      user_reaction: {
        behavioral: {
          listen_duration_ms: 0,
          completed: false,
          skipped: false,
          repeated: 0,
          volume_delta: 0,
        },
        silence_positive: false,
      },
      emotion_delta: ZERO_PAD,
    };
  }

  private async pickNextSong(
    emotion: import("../types").CurrentEmotion,
    userUtterance: string,
    pseudoTargetOverride?: string,
    extraExcludeIds?: Iterable<string>,
    autoAdvanceContext?: AutoAdvanceContext,
  ): Promise<{ song: LibraryTrack; rationale: string } | null> {
    const { companion, library, soulStore } = this.deps;
    const soul = await soulStore.load();

    const recCtx = await buildRecommendationContext(soul, {
      emotionLabels: emotion.labels,
      moodLocked: this.sessionMoodAnchor?.locked ?? false,
      weather: this.weatherContext ?? undefined,
    });
    const excludeIds = new Set(recCtx.excludeIds);
    const immediateExcludeIds = new Set<string>();
    if (extraExcludeIds) {
      for (const id of extraExcludeIds) {
        excludeIds.add(id);
        immediateExcludeIds.add(id);
      }
    }
    const scopedCtx = this.withArtistScopedContext({
      ...recCtx,
      excludeIds,
      immediateExcludeIds:
        immediateExcludeIds.size > 0 ? immediateExcludeIds : undefined,
      artistSessionPlayedIds: this.artistSessionPlayedIds,
    });
    const target = this.pseudoTargetWithArtist(
      pseudoTargetOverride ??
        `${userUtterance} ${emotion.labels.join(" ")}`.trim(),
    );

    const candidates = await library.prefilter(
      target,
      emotion.pad,
      30,
      scopedCtx,
    );
    if (candidates.length === 0) {
      const artist = this.activeArtistFilter;
      this.emit({
        kind: "error",
        message: artist
          ? `曲库里暂时没有${artist}的歌，换个歌手或说说心情？`
          : "B 站上暂时没搜到合适的歌，换种心情说说看？",
      });
      return null;
    }

    const profileMap = await musicProfileRepo.getBatch(candidates.map((c) => c.id));
    const { livingPortrait, topFacts } = getMemoryContext();
    let chosen;
    try {
      console.log(`[lyra] companion.choose LLM 调用中…（candidates=${candidates.length}）`);
      chosen = await companion.choose({
        userUtterance,
        currentEmotion: emotion,
        soul,
        candidates: candidates.map((c) => ({
          ...c,
          musicProfile: profileMap.get(c.id) ?? null,
        })),
        livingPortrait,
        topFacts,
        recommendation: recCtx,
        previousRationale: autoAdvanceContext?.previousRationale,
        previousSong: autoAdvanceContext?.previousSong,
      });
      console.log(`[lyra] companion.choose 返回 song_id=${chosen.song_id}`);
    } catch (e) {
      console.error("[lyra] companion.choose LLM 调用失败:", e);
      throw e;
    }
    const song = candidates.find((c) => c.id === chosen.song_id);
    if (!song) return null;
    return { song, rationale: chosen.rationale };
  }

  /**
   * Play a song matched by name (first hit plays that track).
   * The same utterance is also treated as mood: EmotionAgent analyzes it and
   * locks sessionMoodAnchor so subsequent prefetch / auto-advance continue
   * around that mood. If analysis fails, still play the song and degrade the
   * anchor to the raw input text (option A).
   */
  private async playSongByIntent(
    song: LibraryTrack,
    text: string,
  ): Promise<void> {
    this.emit({ kind: "thinking", user_utterance: text });
    const clock = this.deps.clock ?? Date.now;
    const idGen = this.deps.idGen ?? (() => crypto.randomUUID());

    try {
      const { companion, soulStore, emotion: emotionAgent } = this.deps;
      const soul = await soulStore.load();
      const trimmed = text.trim();

      // ── Mood from the same utterance (for turn + subsequent queue) ──
      let mood: CurrentEmotion;
      try {
        const analyzed = await emotionAgent.analyze({ userUtterance: text });
        mood = blendEmotionWithBias(analyzed, this.perceptionBias);
      } catch (err) {
        // Option A: playback must not fail with emotion — degrade anchor to text.
        console.warn("[lyra] playSongByIntent emotion analyze failed, degrading:", err);
        mood = {
          pad: soul.dynamic_mood.current_pad,
          labels: trimmed ? [trimmed.slice(0, 24)] : [],
          confidence: 0.2,
          source: "emotion-agent-inferred",
        };
      }

      this.sessionMoodAnchor = {
        labels:
          mood.labels.length > 0
            ? [...mood.labels]
            : trimmed
              ? [trimmed.slice(0, 24)]
              : [],
        pseudoTarget: trimmed || mood.labels.join(" ") || songDisplayTitle(song),
        locked: true,
      };

      // ── Rationale: companion.choose single-candidate, or template ──
      let rationale = "";
      try {
        const profileMap = await musicProfileRepo.getBatch([song.id]);
        const { livingPortrait, topFacts } = getMemoryContext();
        const recCtx = await buildRecommendationContext(soul, {
          emotionLabels: mood.labels,
          moodLocked: true,
          weather: this.weatherContext ?? undefined,
        });
        const chosen = await companion.choose({
          userUtterance: text,
          currentEmotion: mood,
          soul,
          candidates: [
            { ...song, musicProfile: profileMap.get(song.id) ?? null },
          ],
          livingPortrait,
          topFacts,
          recommendation: recCtx,
        });
        rationale = chosen.rationale;
      } catch {
        // companion failed — use template
      }
      if (!rationale) {
        const display =
          song.title?.match(/《([^》]+)》/)?.[1] ??
          song.title ??
          "这首歌";
        rationale = `你点的《${display}》`;
      }

      // ── Build & insert turn ──
      const turn: DialogueTurn = {
        id: idGen(),
        timestamp: clock(),
        current_emotion: mood,
        user_utterance: { modality: "text", content: text },
        agent_response: { song_id: song.id, rationale },
        user_reaction: {
          behavioral: {
            listen_duration_ms: 0,
            completed: false,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
        },
        emotion_delta: ZERO_PAD,
      };
      await this.deps.turnRepo.insertTurn(turn);

      // ── Play ──
      try {
        await this.deps.audio.playFile(song.path, song.duration_ms ?? null);
      } catch (err) {
        console.error("[lyra] playSongByIntent playback failed:", err);
        this.emit({
          kind: "error",
          message: "播放失败，检查下网络或音频设备？",
        });
        return;
      }

      this.currentTurn = turn;
      this.currentSong = song;
      this.pendingEvents = [];
      this.rationaleBySongId.set(song.id, rationale);
      this.emit({ kind: "playing", turn, song });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] playSongByIntent error:", err);
      this.emit({ kind: "error", message: msg });
    }
  }

  private computeAutoAdvanceBaseEmotion(
    _turnTimestamp: number,
    endedEmotion: import("../types").CurrentEmotion,
  ): import("../types").CurrentEmotion {
    return endedEmotion;
  }

  private prefetchPayload(
    song: LibraryTrack,
    url: string,
  ): PrefetchNextResult {
    const coverRaw = song.metadata?.cover;
    return {
      url,
      songId: song.id,
      title: song.title?.trim() ?? song.id,
      artist: song.artist?.trim() ?? "",
      durationMs: song.duration_ms ?? 0,
      coverUrl: typeof coverRaw === "string" ? coverRaw : undefined,
    };
  }

  private async runTurnWithEmotion(
    emotion: import("../types").CurrentEmotion,
    userUtterance: string,
    modality: "text" | "voice" | "proactive-open",
    pseudoTargetOverride?: string,
    options?: { skipPlay?: boolean },
    autoAdvanceContext?: AutoAdvanceContext,
  ): Promise<void> {
    const { turnRepo, audio } = this.deps;
    const t0 = performance.now();
    const epoch = this.advanceEpoch;

    const picked = await this.raceAdvanceCancel(
      epoch,
      this.pickNextSong(
        emotion,
        userUtterance,
        pseudoTargetOverride,
        undefined,
        autoAdvanceContext,
      ),
    );
    if (picked === ADVANCE_CANCELLED) {
      console.log("[lyra] runTurnWithEmotion cancelled while picking (previous)");
      return;
    }
    if (epoch !== this.advanceEpoch) {
      console.log("[lyra] runTurnWithEmotion aborted after pick (previous/cancel)");
      return;
    }
    if (!picked) {
      console.warn("[lyra] pickNextSong 没选到歌（candidates 空或 companion 失败）");
      return;
    }
    console.log(
      `[lyra] 选中歌曲: id=${picked.song.id} title=${picked.song.title ?? ""} path=${String(picked.song.path).slice(0, 100)}`,
    );

    this.rationaleBySongId.set(picked.song.id, picked.rationale);

    const turn = this.buildTurn(
      emotion,
      userUtterance,
      modality,
      picked.song,
      picked.rationale,
    );

    await turnRepo.insertTurn(turn);
    if (epoch !== this.advanceEpoch) {
      console.log("[lyra] runTurnWithEmotion aborted before play (previous/cancel)");
      return;
    }
    if (!options?.skipPlay) {
      await audio.playFile(picked.song.path, picked.song.duration_ms ?? null);
      if (epoch !== this.advanceEpoch) {
        // User went previous while playFile was resolving — don't keep this track.
        try {
          await audio.stop();
        } catch {
          /* ignore */
        }
        console.log("[lyra] runTurnWithEmotion aborted after play (previous/cancel)");
        return;
      }
    }

    const turn_latency_ms = Math.round(performance.now() - t0);
    if (turnRepo.setTurnLatency) {
      void turnRepo.setTurnLatency(turn.id, turn_latency_ms).catch(() => {});
    }

    this.currentTurn = turn;
    this.currentSong = picked.song;
    this.recordArtistSessionPlay(picked.song.id);
    this.pendingEvents = [];
    this.nativeQueuePlan = [];
    this.emit({ kind: "playing", turn, song: picked.song });
  }

  /**
   * Install a proactive-pending state without playing audio. The song will
   * only start when the user interacts (types or clicks). Does NOT call
   * audio.playFile — presentation only.
   */
  startProactiveIntent(
    intent: ProactiveIntent,
    song: LibraryTrack,
    rationale: string,
  ): void {
    this.emit({ kind: "proactive-pending", intent, song, rationale });
  }

  /**
   * Select a song for a proactive intent and enter `proactive-pending`.
   * Does NOT play audio. No-ops when busy, library empty, or selection fails.
   */
  async fulfillProactive(intent: ProactiveIntent): Promise<void> {
    const kind = this.state.kind;
    if (kind === "thinking" || kind === "playing" || kind === "proactive-pending" || this.proactiveInFlight) {
      console.debug(
        `[lyra] fulfillProactive skipped: busy state=${kind} inFlight=${this.proactiveInFlight} kind=${intent.kind}`,
      );
      return;
    }

    this.proactiveInFlight = true;
    try {
      const { companion, library, soulStore } = this.deps;

      const soul = await soulStore.load();
      const pad = soul.dynamic_mood.current_pad;
      const pseudoTarget = [
        intent.targetProfile,
        intent.hint,
        intent.seed?.songHint,
      ]
        .filter((s): s is string => Boolean(s && s.trim()))
        .join(" ")
        .trim();

      const recCtx = await buildRecommendationContext(soul, {
        emotionLabels: [],
        weather: this.weatherContext ?? undefined,
      });

      const candidates = await library.prefilter(
        pseudoTarget || intent.hint,
        pad,
        30,
        recCtx,
      );
      if (candidates.length === 0) {
        console.debug("[lyra] fulfillProactive skipped: empty library");
        return;
      }

      // Load music profiles
      const profileMap = await musicProfileRepo.getBatch(candidates.map((c) => c.id));

      const { livingPortrait, topFacts } = getMemoryContext();
      const emotion: CurrentEmotion = {
        pad,
        labels: [],
        confidence: 0.2,
        source: "emotion-agent-inferred",
      };
      const chosen = await companion.choose({
        userUtterance: "",
        currentEmotion: emotion,
        soul,
        candidates: candidates.map((c) => ({
          ...c,
          musicProfile: profileMap.get(c.id) ?? null,
        })),
        livingPortrait,
        topFacts,
        recommendation: recCtx,
      });
      const song = candidates.find((c) => c.id === chosen.song_id);
      if (!song) {
        console.warn(`[lyra] fulfillProactive: companion chose missing song_id=${chosen.song_id}`);
        return;
      }
      this.startProactiveIntent(intent, song, chosen.rationale);
    } catch (err) {
      console.warn("[lyra] fulfillProactive failed:", err);
    } finally {
      this.proactiveInFlight = false;
    }
  }

  async onUserInput(text: string): Promise<void> {
    // User input is always valid — but it must not interleave with an
    // in-flight auto-advance / native-sync / skip transition, or two of them
    // would finalise the same turn and call playFile twice. Queue it like
    // every other transition.
    return this.enqueueTransition(async () => {
    this.clearTrackLock();
    this.lastIntent = { kind: "text", text };
    const emotionAgent = this.deps.emotion;

    // ── Song name intent: 《山丘》 or short song-name-like input ──
    // Check BEFORE emotion analysis — if it's a song name, skip the mood pipeline.
    const songIntent = await resolveSongIntent(text);
    if (songIntent.kind === "song") {
      // Finalise any in-flight turn as a skip so stats stay honest
      if (this.currentTurn) {
        this.pendingEvents.push({ kind: "skip" });
        await this.finalisePreviousTurn(
          undefined,
          this.currentTurn.current_emotion.pad,
        );
      }
      this.nativeQueuePlan = [];
      this.activeArtistFilter = null;
      await this.playSongByIntent(songIntent.song, text);
      return;
    }

    // If we have a proactive-pending intent, commit it as a real turn first
    // (backdated with modality "proactive-open"), then process the utterance.
    const currentState = this.state;
    if (currentState.kind === "proactive-pending") {
      // User is consuming the proactive intent — stop the breathing animation
      setBreathing(false).catch(() => {/* best-effort; tray unavailable in tests */});

      const { song, rationale } = currentState;
      const clock = this.deps.clock ?? Date.now;
      const idGen = this.deps.idGen ?? (() => crypto.randomUUID());
      const { soulStore, turnRepo } = this.deps;

      try {
        const soul = await soulStore.load();
        const pendingTurn: DialogueTurn = {
          id: idGen(),
          timestamp: clock(),
          current_emotion: {
            pad: soul.dynamic_mood.current_pad,
            labels: [],
            confidence: 0,
            source: "emotion-agent-inferred" as const,
          },
          user_utterance: { modality: "proactive-open", content: "" },
          agent_response: { song_id: song.id, rationale },
          user_reaction: {
            behavioral: {
              listen_duration_ms: 0,
              completed: false,
              skipped: false,
              repeated: 0,
              volume_delta: 0,
            },
            silence_positive: false,
          },
          emotion_delta: ZERO_PAD,
        };
        await turnRepo.insertTurn(pendingTurn);
        // Set as current turn (no audio yet — user consumed it by typing)
        this.currentTurn = pendingTurn;
        this.currentSong = song;
        this.pendingEvents = [];
      } catch (err) {
        console.warn("[lyra] failed to commit proactive-pending turn:", err);
      }
    }

    // Clear sulk on any user input (user is actively engaging)
    // (SulkStore instance is not held here; callers wire clearSulk separately
    //  via the proactive engine's recordOutcome path — this is the Orchestrator's
    //  responsibility boundary in v0.2.)

    // The user just asked for something new, so silence the current track the
    // moment they hit send instead of letting it play through the whole
    // thinking gap (emotion analysis + pick can take seconds). Unlike
    // auto-advance there is no continuity to preserve here — hearing the old
    // song keep going after submitting reads as the input being ignored. Only
    // the "playing" path has live audio; proactive-pending never started any.
    if (currentState.kind === "playing") {
      await this.deps.audio.stop();
    }

    this.emit({ kind: "thinking", user_utterance: text });

    await this.updateArtistFilterFromUserInput(text);

    // Emit input_submit event for perception aggregator (best-effort, optional).
    try {
      const clock = this.deps.clock ?? Date.now;
      this.deps.eventBus?.emit({
        kind: "input_submit",
        at: clock(),
        charCount: text.length,
      });
    } catch {
      /* bus errors are non-fatal */
    }

    // Overall timeout guard — if the full turn pipeline hangs (LLM API,
    // Bilibili search, etc.), bail out so the user isn't stuck in "thinking"
    // forever. 90s → 180s: the retry + provider-fallback layer
    // (agents/route.ts chatWithFallback) tries the cheap sensenova primary
    // first (6×40s retries ≈ up to 240s budget); because that alone exceeds
    // this 180s ceiling, the turn timeout is the practical backstop and the
    // DeepSeek fallback may be cut short on a hung sensenova.
    const TURN_TIMEOUT_MS = 180_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`turn timed out after ${TURN_TIMEOUT_MS / 1000}s`)), TURN_TIMEOUT_MS),
    );

    try {
      await Promise.race([
        (async () => {
          const emotion = await emotionAgent.analyze({ userUtterance: text });
          const blended = blendEmotionWithBias(emotion, this.perceptionBias);
          // 心情入口锚点：用户这条输入是什么情绪，后续连播就延续什么。
          if (blended.labels.length > 0) {
            this.sessionMoodAnchor = {
              labels: [...blended.labels],
              pseudoTarget: text.trim() || blended.labels.join(" "),
              locked: true,
            };
          }
          await this.finalisePreviousTurn(text, blended.pad);
          await this.runTurnWithEmotion(blended, text, "text");
        })(),
        timeoutPromise,
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] orchestrator error:", err);
      this.emit({ kind: "error", message: msg });
    }
    });
  }

  /** Record listen progress — keeps running maximum of ms listened. */
  onListenProgress(ms: number): void {
    this.pendingEvents.push({ kind: "listen_progress", ms });
  }

  /**
   * One-tap start from the idle slogan: skip EmotionAgent, use soul's current
   * mood, and let Companion pick a song (same path as auto-advance).
   * No-ops while already thinking / playing / pending.
   */
  async onLyraStart(): Promise<void> {
    return this.enqueueTransition(async () => {
    this.lastIntent = { kind: "lyra-start" };
    const kind = this.state.kind;
    if (kind === "thinking" || kind === "playing" || kind === "proactive-pending") {
      return;
    }

    this.emit({ kind: "thinking", user_utterance: "" });
    console.log("[lyra] onLyraStart 进入 → 时间上下文入口");

    try {
      const soul = await this.deps.soulStore.load();
      const timeCtx = computeTimeContext(undefined, this.weatherContext ?? undefined);
      console.log(
        `[lyra] timeCtx: defaultMoodTags=${timeCtx.defaultMoodTags.join(",")} pseudoTarget=${timeCtx.pseudoTarget}`,
      );
      // 点我试试：没有用户输入，就用「时间上下文」当心情入口 ——
      // 深夜 → 平静/内省，早通勤 → 清醒/出发 …… 推荐器和文案都有据可依。
      const defaultLabels = [...timeCtx.defaultMoodTags];
      const emotion: CurrentEmotion = {
        pad: soul.dynamic_mood.current_pad,
        labels: defaultLabels,
        confidence: 0.2,
        source: "emotion-agent-inferred",
      };
      this.sessionMoodAnchor = {
        labels: defaultLabels,
        pseudoTarget: timeCtx.pseudoTarget,
        locked: false,
      };
      await this.runTurnWithEmotion(
        emotion,
        "",
        "proactive-open",
        timeCtx.pseudoTarget,
      );
      console.log("[lyra] onLyraStart → runTurnWithEmotion 完成（已进入 playing 或已播放）");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] lyra-start error（LLM/选歌/provider 异常）:", err);
      this.emit({ kind: "error", message: msg });
    }
    });
  }

  /**
   * Replay the last user/auto-advance intent after an error — the
   * “点一下重试” affordance on the error note. No-ops unless we're in the
   * error state; replays through the transition queue so the retry can never
   * interleave with an in-flight transition.
   */
  async onRetry(): Promise<void> {
    const intent = this.lastIntent;
    if (this.state.kind !== "error" || !intent) return;

    if (intent.kind === "text") return this.onUserInput(intent.text);
    if (intent.kind === "lyra-start") return this.onLyraStart();

    // auto-advance retry: same shape as onLyraStart but carries the ended
    // turn's emotion + DJ context forward, and keeps the session mood anchor.
    return this.enqueueTransition(async () => {
      this.emit({ kind: "thinking", user_utterance: "" });
      try {
        const anchorTarget = this.sessionMoodAnchor?.pseudoTarget;
        const labelsTarget = intent.emotion.labels.join(" ").trim();
        await this.runTurnWithEmotion(
          intent.emotion,
          "",
          "proactive-open",
          anchorTarget || labelsTarget || undefined,
          undefined,
          intent.autoCtx,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[lyra] retry error:", err);
        this.emit({ kind: "error", message: msg });
      }
    });
  }

  /**
   * User skipped the song. Fold skip event into current turn, finalise it,
   * then auto-advance to the next song — same flow as onSongComplete.
   */
  async onSkip(): Promise<void> {
    // Capture the turn being skipped. If another transition already advanced
    // past it while we were queued, the song the user wanted to skip is
    // already gone — stop() must never kill the audio that replaced it.
    const targetTurn = this.currentTurn;
    return this.enqueueTransition(async () => {
    if (this.currentTurn !== targetTurn) return;
    if (!this.currentTurn) return;

    this.clearTrackLock();

    // Emit perception skip event (best-effort, optional bus).
    try {
      const clock = this.deps.clock ?? Date.now;
      this.deps.eventBus?.emit({
        kind: "skip",
        at: clock(),
        turnId: this.currentTurn.id,
      });
    } catch {
      /* bus errors are non-fatal */
    }

    // Remember for immersive previous before finalise clears current*.
    this.pushPlayStackFromCurrent();

    // Prefer the already-prefetched next track so immersive swipe stays
    // continuous (the cover the user saw is the song that plays).
    const planned = this.nativeQueuePlan.shift() ?? null;

    // Stop audio immediately
    await this.deps.audio.stop();
    if (!planned) {
      this.nativeQueuePlan = [];
    }

    // Fold skip event into current turn
    this.pendingEvents.push({ kind: "skip" });
    this.currentTurn = foldReactionEvents(this.currentTurn, this.pendingEvents);
    this.pendingEvents = [];

    // Remember what emotion we were on
    const endedEmotion = this.currentTurn.current_emotion;
    const autoCtx = this.captureAutoAdvanceContext();

    this.lastIntent = {
      kind: "auto-advance",
      emotion: endedEmotion,
      autoCtx,
    };

    try {
      await this.finalisePreviousTurn(undefined, endedEmotion.pad);

      if (planned) {
        const turn = this.buildTurn(
          planned.baseEmotion,
          "",
          "proactive-open",
          planned.song,
          planned.rationale,
        );
        await this.deps.turnRepo.insertTurn(turn);
        try {
          // Prefer the pre-resolved URL so swipe → play is immediate.
          await this.deps.audio.playFile(
            planned.playUrl || planned.song.path,
            planned.song.duration_ms ?? null,
          );
        } catch (err) {
          console.error("[lyra] skip prefetched playback failed:", err);
          this.emit({
            kind: "error",
            message: "播放失败，检查下网络或音频设备？",
          });
          return;
        }
        this.currentTurn = turn;
        this.currentSong = planned.song;
        this.pendingEvents = [];
        this.recordArtistSessionPlay(planned.song.id);
        this.rationaleBySongId.set(planned.song.id, planned.rationale);
        this.emit({ kind: "playing", turn, song: planned.song });
        return;
      }

      // No prefetch — fall back to thinking + pick.
      this.emit({ kind: "thinking", user_utterance: "" });
      await this.runTurnWithEmotion(
        endedEmotion,
        "",
        "proactive-open",
        endedEmotion.labels.join(" ").trim() || undefined,
        undefined,
        autoCtx,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] skip auto-advance error:", err);
      this.emit({ kind: "error", message: msg });
    }
    });
  }

  /**
   * Pop the session play stack and restore that song (immersive previous /
   * undo skip during thinking). Bumps advanceEpoch immediately so an
   * in-flight skip/complete cannot stomp the restore.
   */
  async onPrevious(): Promise<void> {
    if (this.playStack.length === 0) return;
    this.cancelInFlightAdvance();
    return this.enqueueTransition(async () => {
      this.clearTrackLock();
      const entry = this.playStack.pop();
      if (!entry) return;

      // Browser-style forward history: when moving back, the song we're
      // leaving becomes the next item again, followed by the untouched plan.
      if (this.currentSong && this.currentTurn) {
        const currentSongId = this.currentSong.id;
        this.nativeQueuePlan = [
          {
            song: this.currentSong,
            baseEmotion: this.currentTurn.current_emotion,
            rationale: this.currentTurn.agent_response.rationale,
            playUrl:
              this.playUrlBySongId.get(currentSongId) ?? this.currentSong.path,
          },
          ...this.nativeQueuePlan.filter(
            (planned) => planned.song.id !== currentSongId,
          ),
        ];
      }
      await this.deps.audio.stop();

      if (this.currentTurn) {
        this.pendingEvents.push({ kind: "skip" });
        await this.finalisePreviousTurn(
          undefined,
          this.currentTurn.current_emotion.pad,
        );
      }

      const clock = this.deps.clock ?? Date.now;
      const idGen = this.deps.idGen ?? (() => crypto.randomUUID());
      const turn: DialogueTurn = {
        id: idGen(),
        timestamp: clock(),
        current_emotion: entry.emotion,
        user_utterance: { modality: "proactive-open", content: "" },
        agent_response: { song_id: entry.track.id, rationale: entry.rationale },
        user_reaction: {
          behavioral: {
            listen_duration_ms: 0,
            completed: false,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
        },
        emotion_delta: ZERO_PAD,
      };

      try {
        await this.deps.audio.playFile(
          entry.track.path,
          entry.track.duration_ms ?? null,
        );
      } catch (err) {
        console.error("[lyra] previous playback failed:", err);
        this.emit({
          kind: "error",
          message: "播放失败，检查下网络或音频设备？",
        });
        return;
      }

      this.currentTurn = turn;
      this.currentSong = entry.track;
      this.pendingEvents = [];
      this.rationaleBySongId.set(entry.track.id, entry.rationale);
      this.emit({ kind: "playing", turn, song: entry.track });
    });
  }

  /**
   * Replay a song from history / favorites. Starts playback immediately;
   * companion copy is generated in the background and patched onto the
   * playing turn (historical rationale is ignored).
   *
   * Deliberately does NOT insert a new dialogue_turn row — the history
   * stays clean. The in-memory turn still wires pause/skip/complete, so
   * a finished replay auto-advances normally like any other song.
   */
  async onReplaySong(
    track: LibraryTrack,
    _staleRationale: string,
    emotion: CurrentEmotion,
  ): Promise<void> {
    // User replay is a full transition (stop + playFile) — must not interleave
    // with an in-flight auto-advance, or stop() would kill the wrong audio.
    this.cancelInFlightAdvance();
    this.clearPlayStack();
    return this.enqueueTransition(async () => {
    this.clearTrackLock();
    await this.deps.audio.stop();

    // Finalise any in-flight turn as a skip so its stats stay honest.
    if (this.currentTurn) {
      this.pendingEvents.push({ kind: "skip" });
      await this.finalisePreviousTurn(undefined, this.currentTurn.current_emotion.pad);
    }

    const clock = this.deps.clock ?? Date.now;
    const idGen = this.deps.idGen ?? (() => crypto.randomUUID());
    const turn: DialogueTurn = {
      id: idGen(),
      timestamp: clock(),
      current_emotion: emotion,
      user_utterance: { modality: "proactive-open", content: "" },
      agent_response: { song_id: track.id, rationale: "" },
      user_reaction: {
        behavioral: {
          listen_duration_ms: 0,
          completed: false,
          skipped: false,
          repeated: 0,
          volume_delta: 0,
        },
        silence_positive: false,
      },
      emotion_delta: ZERO_PAD,
    };

    try {
      await this.deps.audio.playFile(track.path, track.duration_ms ?? null);
    } catch (err) {
      console.error("[lyra] replay playback failed:", err);
      this.emit({
        kind: "error",
        message: "播放失败，检查下网络或音频设备？",
      });
      return;
    }

    this.currentTurn = turn;
    this.currentSong = track;
    this.pendingEvents = [];
    this.emit({ kind: "playing", turn, song: track, rationalePending: true });
    void this.fillReplayRationale(turn.id, track, emotion);
    });
  }

  /** Background: write a fresh rationale onto an in-flight replay turn. */
  private async fillReplayRationale(
    turnId: string,
    track: LibraryTrack,
    emotion: CurrentEmotion,
  ): Promise<void> {
    let rationale =
      (await this.rationaleForNativeSong(track, emotion)) ?? "";
    if (!rationale.trim()) {
      const display =
        track.title?.match(/《([^》]+)》/)?.[1] ??
        track.title ??
        "这首歌";
      rationale = `再听一遍《${display}》`;
    }

    if (this.currentTurn?.id !== turnId) return;
    if (this.state.kind !== "playing") return;

    const turn: DialogueTurn = {
      ...this.currentTurn,
      agent_response: {
        ...this.currentTurn.agent_response,
        rationale,
      },
    };
    this.currentTurn = turn;
    this.rationaleBySongId.set(track.id, rationale);
    this.emit({
      kind: "playing",
      turn,
      song: this.currentSong ?? track,
      paused: this.state.paused,
      rationalePending: false,
    });
  }

  async onPause(): Promise<void> {
    if (this.state.kind !== "playing") return;
    await this.deps.audio.pause();
    this.emit({ ...this.state, paused: true });
  }

  async onResume(): Promise<void> {
    if (this.state.kind !== "playing" || !this.state.paused) return;
    await this.deps.audio.resume();
    this.emit({ ...this.state, paused: false });
  }

  /**
   * Pick and resolve up to `count` upcoming tracks while the current song
   * plays. Only selects — native AVPlayer plays them when each ends.
   */
  async prefetchMore(
    count: number,
    alreadyQueuedSongIds: string[] = [],
  ): Promise<PrefetchNextResult[]> {
    if (!this.currentTurn || !this.currentSong || count <= 0) return [];
    if (this.state.kind !== "playing" || this.state.paused) return [];
    const resolve = this.deps.resolvePlayUrl;
    if (!resolve) return [];

    const endedEmotion = this.currentTurn.current_emotion;
    const baseEmotion = this.computeAutoAdvanceBaseEmotion(
      this.currentTurn.timestamp,
      endedEmotion,
    );
    const autoCtx = this.captureAutoAdvanceContext();
    // pseudoTarget 用会话心情锚点（入口心情/时间上下文），连播不走样，与 onSongComplete 对齐。
    const pseudoTarget =
      this.sessionMoodAnchor?.pseudoTarget ||
      baseEmotion.labels.join(" ").trim() ||
      undefined;

    const nativeQueued = new Set(alreadyQueuedSongIds);
    // Reuse resolved entries already held by JS but missing from native
    // (e.g. native queue was cleared for previous/next navigation).
    // If native still has a suffix of our plan, entries before that suffix
    // may already be playing; never append them behind their successors.
    const lastNativePlanIndex = alreadyQueuedSongIds.reduce(
      (furthest, songId) =>
        Math.max(
          furthest,
          this.nativeQueuePlan.findIndex((entry) => entry.song.id === songId),
        ),
      -1,
    );
    const reusablePlan =
      alreadyQueuedSongIds.length === 0
        ? this.nativeQueuePlan
        : lastNativePlanIndex >= 0
          ? this.nativeQueuePlan.slice(lastNativePlanIndex + 1)
          : [];
    const reusable = reusablePlan
      .filter((entry) => !nativeQueued.has(entry.song.id))
      .slice(0, count);
    const results: PrefetchNextResult[] = reusable.map((entry) =>
      this.prefetchPayload(entry.song, entry.playUrl),
    );

    const exclude = new Set<string>([
      this.currentSong.id,
      ...alreadyQueuedSongIds,
      ...this.nativeQueuePlan.map((e) => e.song.id),
    ]);

    for (let i = results.length; i < count; i++) {
      const picked = await this.pickNextSong(
        baseEmotion,
        "",
        pseudoTarget,
        exclude,
        autoCtx,
      );
      if (!picked) break;

      const url = await resolve(picked.song.path);
      if (!url) break;

      this.nativeQueuePlan.push({
        song: picked.song,
        baseEmotion,
        rationale: picked.rationale,
        playUrl: url,
      });
      this.playUrlBySongId.set(picked.song.id, url);
      this.rationaleBySongId.set(picked.song.id, picked.rationale);
      exclude.add(picked.song.id);
      results.push(this.prefetchPayload(picked.song, url));
    }

    // Notify UI (cover rail) that neighbors may have changed.
    if (results.length > 0 && this.state.kind === "playing") {
      this.emit({ ...this.state });
    }

    return results;
  }

  /** @deprecated Prefer prefetchMore — kept for single-track callers. */
  async prefetchNext(): Promise<PrefetchNextResult | null> {
    const batch = await this.prefetchMore(1);
    return batch[0] ?? null;
  }

  clearPrefetchedNext(): void {
    this.nativeQueuePlan = [];
  }

  /**
   * Native AVPlayer already started the prefetched next track (background).
   * Fold the completed turn and sync Orchestrator state without calling play.
   */
  async onNativeAutoAdvanced(songId: string): Promise<void> {
    // Duplicate event — native already synced this song.
    if (this.currentSong?.id === songId) return;
    // Capture the turn this native advance refers to. If another transition
    // (manual playFile, skip, completion) already moved past it while we were
    // queued, the prefetched track is no longer next — drop the event instead
    // of re-emitting a stale "playing" and fighting the audio that's on.
    const targetTurn = this.currentTurn;
    return this.enqueueTransition(async () => {
    if (this.currentSong?.id === songId) return;
    if (this.currentTurn !== targetTurn) return;
    if (!this.currentTurn) return;
    if (this.state.kind === "playing" && this.state.paused) return;

    try {
      const clockFn = this.deps.clock ?? Date.now;
      this.deps.eventBus?.emit({
        kind: "complete",
        at: clockFn(),
        turnId: this.currentTurn.id,
      });
    } catch {
      /* bus errors are non-fatal */
    }

    this.pendingEvents.push({ kind: "complete" });
    this.currentTurn = foldReactionEvents(this.currentTurn, this.pendingEvents);
    this.pendingEvents = [];

    const endedEmotion = this.currentTurn.current_emotion;
    const turnTimestamp = this.currentTurn.timestamp;
    const autoCtx = this.captureAutoAdvanceContext();

    try {
      this.pushPlayStackFromCurrent();
      await this.finalisePreviousTurn(undefined, endedEmotion.pad);

      // Native may have skipped past plan entries (or the plan was cleared
      // while JS was suspended) — search the whole plan, not just the head.
      const planIdx = this.nativeQueuePlan.findIndex((e) => e.song.id === songId);
      const planEntry =
        planIdx >= 0 ? this.nativeQueuePlan.splice(0, planIdx + 1).pop() ?? null : null;

      let song: LibraryTrack | null = null;
      let baseEmotion = this.computeAutoAdvanceBaseEmotion(
        turnTimestamp,
        endedEmotion,
      );
      // Never canned copy — prefer the plan, then the session cache, then a
      // real LLM rationale for this specific track.
      let rationale = this.rationaleBySongId.get(songId) ?? "";

      if (planEntry) {
        song = planEntry.song;
        baseEmotion = planEntry.baseEmotion;
        rationale = planEntry.rationale;
      } else {
        song = await libraryRepo.getTrack(songId);
        if (!song) {
          console.warn("[lyra] native auto-advanced but song not in library:", songId);
          return;
        }
        if (!rationale) {
          rationale = (await this.rationaleForNativeSong(song, baseEmotion, autoCtx)) ?? "";
          if (rationale) this.rationaleBySongId.set(song.id, rationale);
        }
      }
      if (!rationale) {
        // Absolute last resort: carry the previous LLM copy forward rather
        // than showing a template.
        rationale = autoCtx?.previousRationale ?? "";
      }

      const turn = this.buildTurn(
        baseEmotion,
        "",
        "proactive-open",
        song,
        rationale,
      );

      await this.deps.turnRepo.insertTurn(turn);
      this.currentTurn = turn;
      this.currentSong = song;
      this.recordArtistSessionPlay(song.id);
      this.pendingEvents = [];
      this.emit({ kind: "playing", turn, song });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] native auto-advance sync error:", err);
      this.emit({ kind: "error", message: msg });
    }
    });
  }

  /**
   * Generate a real LLM rationale for a track that native already started
   * but whose copy we don't have (plan + cache both missed). Single-candidate
   * companion.choose — best-effort; returns null on any failure so the caller
   * falls back to the previous rationale instead of a template.
   */
  private async rationaleForNativeSong(
    song: LibraryTrack,
    baseEmotion: import("../types").CurrentEmotion,
    autoCtx?: AutoAdvanceContext,
    lockOpts?: { lockPlayCount: number; previousRationale: string },
  ): Promise<string | null> {
    const { companion, soulStore } = this.deps;
    try {
      const soul = await soulStore.load();
      const recCtx = await buildRecommendationContext(soul, {
        emotionLabels: baseEmotion.labels,
        weather: this.weatherContext ?? undefined,
      });
      const profileMap = await musicProfileRepo.getBatch([song.id]);
      const { livingPortrait, topFacts } = getMemoryContext();
      const chosen = await companion.choose({
        userUtterance: "",
        currentEmotion: baseEmotion,
        soul,
        candidates: [{ ...song, musicProfile: profileMap.get(song.id) ?? null }],
        livingPortrait,
        topFacts,
        recommendation: recCtx,
        ...(lockOpts
          ? {
              lockPlayCount: lockOpts.lockPlayCount,
              previousRationale: lockOpts.previousRationale,
            }
          : {
              previousRationale: autoCtx?.previousRationale,
              previousSong: autoCtx?.previousSong,
            }),
      });
      return chosen.rationale || null;
    } catch (err) {
      console.warn("[lyra] rationaleForNativeSong failed, keeping previous copy:", err);
      return null;
    }
  }

  /** Background: rewrite rationale for a locked single-track loop. */
  private async fillTrackLockRationale(
    turnId: string,
    track: LibraryTrack,
    emotion: import("../types").CurrentEmotion,
    previousRationale: string,
    lockPlayCount: number,
  ): Promise<void> {
    let rationale =
      (await this.rationaleForNativeSong(track, emotion, undefined, {
        lockPlayCount,
        previousRationale,
      })) ?? "";
    if (!rationale.trim()) {
      const display =
        track.title?.match(/《([^》]+)》/)?.[1] ??
        track.title ??
        "这首歌";
      rationale = `再听一遍《${display}》`;
    }

    if (this.currentTurn?.id !== turnId) return;
    if (this.state.kind !== "playing") return;

    const turn: DialogueTurn = {
      ...this.currentTurn,
      agent_response: {
        ...this.currentTurn.agent_response,
        rationale,
      },
    };
    this.currentTurn = turn;
    this.rationaleBySongId.set(track.id, rationale);
    if (this.deps.turnRepo.updateTurn) {
      try {
        await this.deps.turnRepo.updateTurn(turn);
      } catch (e) {
        console.warn("[lyra] track-lock rationale updateTurn failed:", e);
      }
    }
    this.emit({
      kind: "playing",
      turn,
      song: this.currentSong ?? track,
      paused: this.state.paused,
      trackLocked: this.isTrackLockEnabled(),
      rationalePending: false,
    });
  }

  /**
   * Song played to completion. Fold the `complete` event into the current
   * turn, finalise it (soul mood update, Salient Moment detection), then
   * auto-advance to the next song using the ended turn's emotion as the
   * baseline. "Prediction" in v0.1 is honestly "carry the previous emotion
   * forward" — soul.dynamic_mood has already been shifted by the delta.
   *
   * The user experience is: song ends → tiny "…" thinking state → new
   * song plays. Nothing auto-advances if there's no `currentTurn` (i.e.,
   * we're in idle/error state and the event arrived stale).
   */
  async onSongComplete(): Promise<void> {
    // Capture the turn this completion refers to. If another transition
    // (native auto-advance, skip, a prior completion) already advanced past
    // it while we were queued, this completion is stale — drop it instead of
    // picking a second song and stomping the one already playing.
    const targetTurn = this.currentTurn;
    return this.enqueueTransition(async () => {
    if (this.currentTurn !== targetTurn) return;
    if (!this.currentTurn) return;
    // Manual pause takes priority — never auto-advance while paused.
    if (this.state.kind === "playing" && this.state.paused) return;

    // Locked single-track loop: replay same song + rewrite rationale.
    if (
      this.trackLock?.enabled &&
      this.currentSong &&
      this.trackLock.songId === this.currentSong.id
    ) {
      try {
        const clockFn = this.deps.clock ?? Date.now;
        this.deps.eventBus?.emit({
          kind: "complete",
          at: clockFn(),
          turnId: this.currentTurn.id,
        });
      } catch {
        /* bus errors are non-fatal */
      }

      this.pendingEvents.push({ kind: "complete" });
      let folded = foldReactionEvents(this.currentTurn, this.pendingEvents);
      this.pendingEvents = [];
      const behavioral = {
        ...folded.user_reaction.behavioral,
        completed: true,
        repeated: folded.user_reaction.behavioral.repeated + 1,
      };
      folded = {
        ...folded,
        user_reaction: {
          ...folded.user_reaction,
          behavioral,
          silence_positive:
            behavioral.completed &&
            !behavioral.skipped &&
            folded.user_reaction.verbal === undefined,
        },
      };
      this.currentTurn = folded;
      if (this.deps.turnRepo.updateTurn) {
        try {
          await this.deps.turnRepo.updateTurn(folded);
        } catch (e) {
          console.warn("[lyra] track-lock complete updateTurn failed:", e);
        }
      }

      this.trackLock = {
        ...this.trackLock,
        playCount: this.trackLock.playCount + 1,
      };

      const song = this.currentSong;
      const prevRationale = folded.agent_response.rationale;
      const emotion = folded.current_emotion;
      const turnId = folded.id;
      const lockPlayCount = this.trackLock.playCount;

      try {
        await this.deps.audio.playFile(song.path, song.duration_ms ?? null);
      } catch (err) {
        console.error("[lyra] track-lock replay failed:", err);
        this.emit({
          kind: "error",
          message: "播放失败，检查下网络或音频设备？",
        });
        return;
      }

      this.emit({
        kind: "playing",
        turn: folded,
        song,
        trackLocked: true,
        rationalePending: true,
      });
      void this.fillTrackLockRationale(
        turnId,
        song,
        emotion,
        prevRationale,
        lockPlayCount,
      );
      return;
    }

    // Emit perception complete event (best-effort, optional bus).
    try {
      const clockFn = this.deps.clock ?? Date.now;
      this.deps.eventBus?.emit({
        kind: "complete",
        at: clockFn(),
        turnId: this.currentTurn.id,
      });
    } catch {
      /* bus errors are non-fatal */
    }

    // Fold complete event into current turn's reaction
    this.pendingEvents.push({ kind: "complete" });
    this.currentTurn = foldReactionEvents(this.currentTurn, this.pendingEvents);
    this.pendingEvents = [];

    // Remember what emotion we were on so the next turn can continue from it
    const endedEmotion = this.currentTurn.current_emotion;
    // Capture timestamp before finalisePreviousTurn clears currentTurn
    const turnTimestamp = this.currentTurn.timestamp;
    const autoCtx = this.captureAutoAdvanceContext();

    // Session previous stack — same as skip.
    this.pushPlayStackFromCurrent();
    const planned = this.nativeQueuePlan.shift() ?? null;

    // A known forward item is an immediate transition; thinking is only for
    // the genuinely empty-queue recommendation path.
    if (!planned) {
      this.emit({ kind: "thinking", user_utterance: "" });
    }

    try {
      // Finalise: no verbal (user is silent), no emotion shift (no new signal)
      await this.finalisePreviousTurn(undefined, endedEmotion.pad);

      if (planned) {
        const turn = this.buildTurn(
          planned.baseEmotion,
          "",
          "proactive-open",
          planned.song,
          planned.rationale,
        );
        await this.deps.turnRepo.insertTurn(turn);
        await this.deps.audio.playFile(
          planned.playUrl,
          planned.song.duration_ms ?? null,
        );
        this.currentTurn = turn;
        this.currentSong = planned.song;
        this.pendingEvents = [];
        this.recordArtistSessionPlay(planned.song.id);
        this.rationaleBySongId.set(planned.song.id, planned.rationale);
        this.emit({ kind: "playing", turn, song: planned.song });
        return;
      }

      const baseEmotion = this.computeAutoAdvanceBaseEmotion(
        turnTimestamp,
        endedEmotion,
      );

      // Continue the flow: play history excludes recent songs automatically.
      // pseudoTarget 用会话心情锚点（入口心情/时间上下文），连播不走样。
      const anchorTarget = this.sessionMoodAnchor?.pseudoTarget;
      const labelsTarget = baseEmotion.labels.join(" ").trim();
      this.lastIntent = {
        kind: "auto-advance",
        emotion: baseEmotion,
        autoCtx,
      };
      await this.runTurnWithEmotion(
        baseEmotion,
        "",
        "proactive-open",
        anchorTarget || labelsTarget || undefined,
        undefined,
        autoCtx,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] auto-advance error:", err);
      this.emit({ kind: "error", message: msg });
    }
    });
  }
}

/**
 * Blend the user-utterance-derived emotion with a PerceptionBias.
 * The bias's pad values are scaled by its confidence before being added,
 * then clamped to [-1, 1]. When no bias is present, returns emotion as-is.
 */
export function blendEmotionWithBias(
  emotion: CurrentEmotion,
  bias: PerceptionBias | null,
): CurrentEmotion {
  if (!bias) return emotion;
  return {
    ...emotion,
    pad: {
      p: clampPad(emotion.pad.p + bias.pad_bias.p * bias.confidence),
      a: clampPad(emotion.pad.a + bias.pad_bias.a * bias.confidence),
      d: clampPad(emotion.pad.d + bias.pad_bias.d * bias.confidence),
    },
  };
}

function clampPad(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

// ── Track Feedback helper ───────────────────────────────────────────────────

/** Convert a finalised turn into a TrackFeedback entry for taste evolution. */
function turnToFeedback(
  turn: DialogueTurn,
  trackId: string,
): TrackFeedback | null {
  const { behavioral, verbal } = turn.user_reaction;

  let reaction: TrackFeedback["reaction"] | null = null;

  if (behavioral.repeated >= 1) {
    reaction = "repeated";
  } else if (verbal?.parsed_valence === "positive") {
    reaction = "verbal_positive";
  } else if (verbal?.parsed_valence === "negative") {
    reaction = "verbal_negative";
  } else if (behavioral.completed) {
    reaction = "completed";
  } else if (behavioral.skipped) {
    reaction = "skipped";
  }

  if (!reaction) return null;

  return {
    track_id: trackId,
    turn_id: turn.id,
    reaction,
    timestamp: turn.timestamp,
    emotion_delta: turn.emotion_delta,
  };
}
