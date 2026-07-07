/**
 * perception/events.ts — typed EventBus for Lyra perception signals (Sprint 4 T1)
 *
 * All perception data is in-memory only. No DB writes.
 * Buffer capped at 1000 events (rolling).
 */

export type LyraEvent =
  | { kind: "window_focus"; at: number }
  | { kind: "window_blur"; at: number }
  | { kind: "mouse_active"; at: number }
  | { kind: "key_active"; at: number }
  | { kind: "input_submit"; at: number; charCount: number }
  | { kind: "listen_progress"; at: number; turnId: string; ms: number }
  | { kind: "skip"; at: number; turnId: string }
  | { kind: "complete"; at: number; turnId: string }
  | { kind: "proactive_dismissed"; at: number; intentId: string };

export type EventListener = (e: LyraEvent) => void;

const MAX_BUFFER = 1000;

export class EventBus {
  private buffer: LyraEvent[] = [];
  private listeners = new Set<EventListener>();

  emit(e: LyraEvent): void {
    if (this.buffer.length >= MAX_BUFFER) {
      this.buffer.shift();
    }
    this.buffer.push(e);
    for (const l of this.listeners) {
      l(e);
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Returns events within the given window (ms lookback) sorted by `at`.
   * @param lookbackMs  how far back to look from `now`
   * @param now         timestamp override (default: Date.now())
   */
  recent(lookbackMs: number, now?: number): LyraEvent[] {
    const cutoff = (now ?? Date.now()) - lookbackMs;
    return this.buffer.filter((e) => e.at >= cutoff).sort((a, b) => a.at - b.at);
  }
}

/** Module-level singleton — callers import this directly. */
export const bus = new EventBus();
