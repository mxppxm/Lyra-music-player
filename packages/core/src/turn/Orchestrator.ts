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
import { computeTimeContext } from "../recommendation/timeContext";
import * as libraryRepo from "../db/repo/libraryRepo";
import { parseArtistIntent } from "../library/parseArtistIntent";

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
  | { kind: "playing"; turn: DialogueTurn; song: LibraryTrack; paused?: boolean }
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
    setTurnLatency?(id: string, ms: number): Promise<void>;
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

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };

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
  /** Guard against concurrent fulfillProactive calls. */
  private proactiveInFlight = false;
  /** Ordered plan for native queue — head plays after the current track. */
  private nativeQueuePlan: Array<{
    song: LibraryTrack;
    baseEmotion: import("../types").CurrentEmotion;
    rationale: string;
  }> = [];
  /** Persists across auto-advance until the user submits new input in the text box. */
  private activeArtistFilter: string | null = null;
  /** Tracks which artist-pool songs were played in the current artist session. */
  private artistSessionPlayedIds = new Set<string>();
  /**
   * 会话心情锚点：记录这条播放流的「心情入口」。
   * - 用户输入 → EmotionAgent 分析出的情绪标签 + 原话
   * - 点我试试 → 时间上下文默认心情 + 时间伪目标
   * 连播时持续用它做 pseudoTarget，保证整条流都和入口心情相关，
   * 直到用户下一次新输入才更新。
   */
  private sessionMoodAnchor: { labels: string[]; pseudoTarget: string } | null = null;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
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

  subscribe(cb: (s: OrchestratorState) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private emit(s: OrchestratorState): void {
    this.state = s;
    for (const cb of this.subs) cb(s);
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
    const chosen = await companion.choose({
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
    const song = candidates.find((c) => c.id === chosen.song_id);
    if (!song) return null;
    return { song, rationale: chosen.rationale };
  }

  private computeAutoAdvanceBaseEmotion(
    turnTimestamp: number,
    endedEmotion: import("../types").CurrentEmotion,
  ): import("../types").CurrentEmotion {
    const clock = this.deps.clock ?? Date.now;
    const elapsed_min = (clock() - turnTimestamp) / 60_000;
    const pt = endedEmotion.predicted_trajectory;
    if (pt !== undefined && elapsed_min >= 3 && elapsed_min <= pt.horizon_min) {
      return {
        pad: pt.predicted_pad,
        labels: endedEmotion.labels,
        confidence: endedEmotion.confidence,
        source: "emotion-agent-inferred",
      };
    }
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

    const picked = await this.pickNextSong(
      emotion,
      userUtterance,
      pseudoTargetOverride,
      undefined,
      autoAdvanceContext,
    );
    if (!picked) return;

    const turn = this.buildTurn(
      emotion,
      userUtterance,
      modality,
      picked.song,
      picked.rationale,
    );

    await turnRepo.insertTurn(turn);
    if (!options?.skipPlay) {
      await audio.playFile(picked.song.path, picked.song.duration_ms ?? null);
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
    const emotionAgent = this.deps.emotion;

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
    // Bilibili search, etc.), bail out after 60s so the user isn't stuck
    // in "thinking" forever.
    const TURN_TIMEOUT_MS = 60_000;
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
    const kind = this.state.kind;
    if (kind === "thinking" || kind === "playing" || kind === "proactive-pending") {
      return;
    }

    this.emit({ kind: "thinking", user_utterance: "" });

    try {
      const soul = await this.deps.soulStore.load();
      const timeCtx = computeTimeContext();
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
      };
      await this.runTurnWithEmotion(
        emotion,
        "",
        "proactive-open",
        timeCtx.pseudoTarget,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] lyra-start error:", err);
      this.emit({ kind: "error", message: msg });
    }
  }

  /**
   * User skipped the song. Fold skip event into current turn, finalise it,
   * then auto-advance to the next song — same flow as onSongComplete but
   * without the predicted_trajectory carry-forward (skip = rejection signal,
   * keep the baseline emotion unchanged).
   */
  async onSkip(): Promise<void> {
    if (!this.currentTurn) return;

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

    // Stop audio immediately
    await this.deps.audio.stop();
    this.nativeQueuePlan = [];

    // Fold skip event into current turn
    this.pendingEvents.push({ kind: "skip" });
    this.currentTurn = foldReactionEvents(this.currentTurn, this.pendingEvents);
    this.pendingEvents = [];

    // Remember what emotion we were on
    const endedEmotion = this.currentTurn.current_emotion;
    const autoCtx = this.captureAutoAdvanceContext();

    // Emit thinking so UI shows "…" while we pick the next song
    this.emit({ kind: "thinking", user_utterance: "" });

    try {
      // Finalise: no verbal (skip is silent), same emotion (no shift)
      await this.finalisePreviousTurn(undefined, endedEmotion.pad);

      // Continue the flow: same emotion — play history excludes recent songs
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

    const exclude = new Set<string>([
      this.currentSong.id,
      ...alreadyQueuedSongIds,
      ...this.nativeQueuePlan.map((e) => e.song.id),
    ]);

    const results: PrefetchNextResult[] = [];
    for (let i = 0; i < count; i++) {
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
      });
      exclude.add(picked.song.id);
      results.push(this.prefetchPayload(picked.song, url));
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
      await this.finalisePreviousTurn(undefined, endedEmotion.pad);

      const planEntry =
        this.nativeQueuePlan[0]?.song.id === songId
          ? this.nativeQueuePlan.shift()
          : null;

      let song: LibraryTrack | null = null;
      let baseEmotion = this.computeAutoAdvanceBaseEmotion(
        turnTimestamp,
        endedEmotion,
      );
      let rationale = autoAdvanceFallbackNote(baseEmotion, autoCtx);

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
    if (!this.currentTurn) return;
    // Manual pause takes priority — never auto-advance while paused.
    if (this.state.kind === "playing" && this.state.paused) return;

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

    // Emit thinking so UI shows "…" while we pick the next song
    this.emit({ kind: "thinking", user_utterance: "" });

    try {
      // Finalise: no verbal (user is silent), no emotion shift (no new signal)
      await this.finalisePreviousTurn(undefined, endedEmotion.pad);

      const baseEmotion = this.computeAutoAdvanceBaseEmotion(
        turnTimestamp,
        endedEmotion,
      );

      // Continue the flow: play history excludes recent songs automatically.
      // pseudoTarget 用会话心情锚点（入口心情/时间上下文），连播不走样。
      const anchorTarget = this.sessionMoodAnchor?.pseudoTarget;
      const labelsTarget = baseEmotion.labels.join(" ").trim();
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

// ── Auto-advance fallback note ──────────────────────────────────────────────

const AUTO_ADVANCE_NOTES = [
  "这首先顶上，耳朵别打盹。",
  "刚那首的余温还没散，这首就来接棒。",
  "鼓点已经热好了，听就是了。",
  "让这首把房间的空气换一遍。",
  "这一拍踩进来，就别想停下来了。",
] as const;

function autoAdvanceFallbackNote(
  baseEmotion: import("../types").CurrentEmotion,
  autoCtx: AutoAdvanceContext | undefined,
): string {
  const seed =
    Math.round((baseEmotion.pad.p + 1) * 31 + (baseEmotion.pad.a + 1) * 17 + (baseEmotion.pad.d + 1) * 7) +
    (autoCtx ? [...autoCtx.previousSong.title].reduce((n, ch) => n + ch.charCodeAt(0), 0) : 0);
  return AUTO_ADVANCE_NOTES[Math.abs(seed) % AUTO_ADVANCE_NOTES.length];
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
