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

export type SoulStoreLike = {
  load(): Promise<SoulState>;
  apply?: (delta: PAD) => Promise<SoulState>;
};

type SoulStore = SoulStoreLike;

export type OrchestratorState =
  | { kind: "idle" }
  | { kind: "thinking"; user_utterance: string }
  | { kind: "playing"; turn: DialogueTurn; song: LibraryTrack }
  | { kind: "error"; message: string };

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

  async onUserInput(text: string): Promise<void> {
    const { emotion: emotionAgent, companion, library, soulStore, turnRepo, audio } = this.deps;
    const clock = this.deps.clock ?? Date.now;
    const idGen = this.deps.idGen ?? (() => crypto.randomUUID());

    this.emit({ kind: "thinking", user_utterance: text });

    try {
      // Step 2: analyse emotion for new turn
      const emotion = await emotionAgent.analyze({ userUtterance: text });

      // Step 1b: finalise previous turn (verbal attribution + soul update)
      await this.finalisePreviousTurn(text, emotion.pad);

      // Step 3: load soul (may reflect updated dynamic_mood from finalisePreviousTurn)
      const soul = await soulStore.load();

      // Step 4: prefilter candidates
      const pseudoTarget = `${text} ${emotion.labels.join(" ")}`;
      const candidates = await library.prefilter(pseudoTarget, emotion.pad, 30);

      // Step 5: guard empty library
      if (candidates.length === 0) {
        this.emit({ kind: "error", message: "library is empty; add music in Settings" });
        return;
      }

      // Step 6: companion chooses song (with boot-time memory context)
      const { livingPortrait, topFacts } = getMemoryContext();
      const chosen = await companion.choose({
        userUtterance: text,
        currentEmotion: emotion,
        soul,
        candidates,
        livingPortrait,
        topFacts,
      });

      // Step 7: resolve song from candidates
      const song = candidates.find((c) => c.id === chosen.song_id)!;

      // Step 8: build DialogueTurn
      const turn: DialogueTurn = {
        id: idGen(),
        timestamp: clock(),
        current_emotion: emotion,
        user_utterance: { modality: "text", content: text },
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

      // Step 9: persist
      await turnRepo.insertTurn(turn);

      // Step 10: play
      await audio.playFile(song.path);

      // Step 11: emit playing; store as currentTurn for reaction capture
      this.currentTurn = turn;
      this.currentSong = song;
      this.pendingEvents = [];
      this.emit({ kind: "playing", turn, song });
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

  /** Song played to completion. Fold complete event into current turn. */
  async onSongComplete(): Promise<void> {
    this.pendingEvents.push({ kind: "complete" });
    if (this.currentTurn) {
      this.currentTurn = foldReactionEvents(this.currentTurn, this.pendingEvents);
      this.pendingEvents = [];
    }
  }
}
