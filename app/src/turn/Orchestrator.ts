import type { DialogueTurn, LibraryTrack, PAD } from "../types";
import type { EmotionAgent } from "../agents/EmotionAgent";
import type { CompanionAgent } from "../agents/CompanionAgent";
import type { LibraryAgent } from "../agents/LibraryAgent";
import type { SoulState } from "../types";

// T7 will build soulStore.ts; T6 takes it as a dep but only calls .load()
export type SoulStoreLike = {
  load(): Promise<SoulState>;
  apply?: (delta: PAD) => Promise<SoulState>; // reserved for T7
};

// Use SoulStore as an alias to keep imports forwards-compatible
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
  turnRepo: { insertTurn(t: DialogueTurn): Promise<void> };
  audio: { playFile(path: string): Promise<void>; stop(): Promise<void> };
  clock?: () => number;   // for tests; defaults to Date.now
  idGen?: () => string;   // for tests; defaults to crypto.randomUUID
};

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };

export class Orchestrator {
  private state: OrchestratorState = { kind: "idle" };
  private subs = new Set<(s: OrchestratorState) => void>();
  private deps: OrchestratorDeps;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
  }

  getState(): OrchestratorState {
    return this.state;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(cb: (s: OrchestratorState) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private emit(s: OrchestratorState): void {
    this.state = s;
    for (const cb of this.subs) cb(s);
  }

  async onUserInput(text: string): Promise<void> {
    const { emotion: emotionAgent, companion, library, soulStore, turnRepo, audio } = this.deps;
    const clock = this.deps.clock ?? Date.now;
    const idGen = this.deps.idGen ?? (() => crypto.randomUUID());

    this.emit({ kind: "thinking", user_utterance: text });

    try {
      // Step 2: analyse emotion
      const emotion = await emotionAgent.analyze({ userUtterance: text });

      // Step 3: load soul
      const soul = await soulStore.load();

      // Step 4: prefilter candidates — chicken-and-egg resolved with text + labels pseudo-target
      const pseudoTarget = `${text} ${emotion.labels.join(" ")}`;
      const candidates = await library.prefilter(pseudoTarget, emotion.pad, 30);

      // Step 5: guard empty library
      if (candidates.length === 0) {
        this.emit({ kind: "error", message: "library is empty; add music in Settings" });
        return;
      }

      // Step 6: companion chooses song
      const chosen = await companion.choose({
        userUtterance: text,
        currentEmotion: emotion,
        soul,
        candidates,
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

      // Step 11: emit playing
      this.emit({ kind: "playing", turn, song });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lyra] orchestrator error:", err);
      this.emit({ kind: "error", message: msg });
    }
  }

  /** T6 stub: stop audio. Full reaction wiring comes in T7. */
  async onSkip(): Promise<void> {
    await this.deps.audio.stop();
  }

  /** T6 stub: no-op. Full reaction wiring comes in T7. */
  async onSongComplete(): Promise<void> {
    // T7 wires the reaction; stay in playing state for now
  }
}
