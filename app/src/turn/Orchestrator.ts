import type { DialogueTurn, LibraryTrack, PAD } from "../types";
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

export type SoulStoreLike = {
  load(): Promise<SoulState>;
  apply?: (delta: PAD) => Promise<SoulState>;
};

type SoulStore = SoulStoreLike;

export type OrchestratorState =
  | { kind: "idle" }
  | { kind: "thinking"; user_utterance: string }
  | { kind: "playing"; turn: DialogueTurn; song: LibraryTrack }
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
  };
  audio: {
    // playFile may return the Rust playback id (a number) so the caller can
    // correlate the "audio-complete" event. Orchestrator itself doesn't use
    // the id; the correlation is done at the App/subscriber level.
    playFile(path: string): Promise<number | void>;
    stop(): Promise<void>;
  };
  clock?: () => number;
  idGen?: () => string;
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

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
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
  private async runTurnWithEmotion(
    emotion: import("../types").CurrentEmotion,
    userUtterance: string,
    modality: "text" | "voice" | "proactive-open",
    pseudoTargetOverride?: string,
  ): Promise<void> {
    const { companion, library, soulStore, turnRepo, audio } = this.deps;
    const clock = this.deps.clock ?? Date.now;
    const idGen = this.deps.idGen ?? (() => crypto.randomUUID());

    const soul = await soulStore.load();

    const pseudoTarget =
      pseudoTargetOverride ??
      `${userUtterance} ${emotion.labels.join(" ")}`.trim();
    const candidates = await library.prefilter(pseudoTarget, emotion.pad, 30);
    if (candidates.length === 0) {
      this.emit({
        kind: "error",
        message: "library is empty; add music in Settings",
      });
      return;
    }

    const { livingPortrait, topFacts } = getMemoryContext();
    const chosen = await companion.choose({
      userUtterance,
      currentEmotion: emotion,
      soul,
      candidates,
      livingPortrait,
      topFacts,
    });
    const song = candidates.find((c) => c.id === chosen.song_id)!;

    const turn: DialogueTurn = {
      id: idGen(),
      timestamp: clock(),
      current_emotion: emotion,
      user_utterance: { modality, content: userUtterance },
      agent_response: { song_id: chosen.song_id, rationale: chosen.rationale },
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

    await turnRepo.insertTurn(turn);
    await audio.playFile(song.path);

    this.currentTurn = turn;
    this.currentSong = song;
    this.pendingEvents = [];
    this.emit({ kind: "playing", turn, song });
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

    try {
      const emotion = await emotionAgent.analyze({ userUtterance: text });
      await this.finalisePreviousTurn(text, emotion.pad);
      await this.runTurnWithEmotion(emotion, text, "text");
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

  /** User skipped the song. Fold skip event into current turn. */
  async onSkip(): Promise<void> {
    this.pendingEvents.push({ kind: "skip" });
    await this.deps.audio.stop();
    // Fold immediately so currentTurn reflects skip
    if (this.currentTurn) {
      this.currentTurn = foldReactionEvents(this.currentTurn, this.pendingEvents);
      this.pendingEvents = [];
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

    // Fold complete event into current turn's reaction
    this.pendingEvents.push({ kind: "complete" });
    this.currentTurn = foldReactionEvents(this.currentTurn, this.pendingEvents);
    this.pendingEvents = [];

    // Remember what emotion we were on so the next turn can continue from it
    const endedEmotion = this.currentTurn.current_emotion;
    // Capture timestamp before finalisePreviousTurn clears currentTurn
    const turnTimestamp = this.currentTurn.timestamp;

    // Emit thinking so UI shows "…" while we pick the next song
    this.emit({ kind: "thinking", user_utterance: "" });

    try {
      // Finalise: no verbal (user is silent), no emotion shift (no new signal)
      await this.finalisePreviousTurn(undefined, endedEmotion.pad);

      // If endedEmotion carries a predicted_trajectory and the elapsed time
      // since the turn started falls within the prediction window, use the
      // predicted_pad as the baseline emotion for the next turn.
      const clock = this.deps.clock ?? Date.now;
      const now = clock();
      const elapsed_min = (now - turnTimestamp) / 60_000;
      const pt = endedEmotion.predicted_trajectory;
      const baseEmotion: import("../types").CurrentEmotion =
        pt !== undefined && elapsed_min >= 3 && elapsed_min <= pt.horizon_min
          ? {
              pad: pt.predicted_pad,
              labels: endedEmotion.labels,
              confidence: endedEmotion.confidence,
              source: "emotion-agent-inferred",
              // predicted_trajectory intentionally omitted — it is stale after use
            }
          : endedEmotion;

      // Continue the flow: use the baseline emotion, empty utterance, proactive-open modality
      await this.runTurnWithEmotion(
        baseEmotion,
        "",
        "proactive-open",
        // For pseudo-target we lean on the baseline emotion's labels + a hint
        `${baseEmotion.labels.join(" ")} 延续`.trim(),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] auto-advance error:", err);
      this.emit({ kind: "error", message: msg });
    }
  }
}
