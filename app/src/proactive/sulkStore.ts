import type { ProactiveKind } from "./types";

export type ProactiveOutcome = "accepted" | "dismissed" | "ignored" | "rejected";

export type SulkSnapshot = {
  sulkUntil: number | null;
};

export type SulkStore = {
  recordProactiveOutcome(kind: ProactiveKind, outcome: ProactiveOutcome): void;
  getSulkUntil(): number | null;
  clearSulk(): void;
  getConsecutiveDismisses(): number;
  /** Conservative mode: if last 5 outcomes are all ignored, daily_limit drops to 1 */
  isConservativeMode(): boolean;
  /** Rehydrate from a persisted snapshot (typically at app boot). */
  hydrate(snapshot: SulkSnapshot): void;
  /** Serialisable snapshot for cross-restart persistence. */
  snapshot(): SulkSnapshot;
};

export type SulkStoreOptions = {
  /** Fires whenever sulkUntil transitions (enter or clear). Sync only; caller
   *  is responsible for scheduling any async write-back. */
  onChange?: (snapshot: SulkSnapshot) => void;
};

const WINDOW = 5;
const SULK_TRIGGER_COUNT = 3;
const SULK_DURATION_MS = 3 * 24 * 3600_000; // 3 days
const CONSERVATIVE_COUNT = 5;

export function createSulkStore(opts: SulkStoreOptions = {}): SulkStore {
  /** Ring buffer of last WINDOW outcomes (session-only; not persisted so a
   *  restart doesn't punish an in-progress dismiss streak). */
  const outcomes: ProactiveOutcome[] = [];
  let sulkUntil: number | null = null;
  const onChange = opts.onChange;

  function push(o: ProactiveOutcome): void {
    outcomes.push(o);
    if (outcomes.length > WINDOW) outcomes.shift();
  }

  function setSulkUntil(next: number | null): void {
    if (next === sulkUntil) return;
    sulkUntil = next;
    onChange?.({ sulkUntil });
  }

  function checkAndUpdateSulk(now: number): void {
    // Enter sulk if last SULK_TRIGGER_COUNT in a row are dismissed or rejected
    if (outcomes.length >= SULK_TRIGGER_COUNT) {
      const tail = outcomes.slice(-SULK_TRIGGER_COUNT);
      const allBad = tail.every((o) => o === "dismissed" || o === "rejected");
      if (allBad) {
        setSulkUntil(now + SULK_DURATION_MS);
      }
    }
  }

  return {
    recordProactiveOutcome(kind: ProactiveKind, outcome: ProactiveOutcome): void {
      void kind; // kind not used for tracking in v0.2; kept for API compatibility
      push(outcome);
      checkAndUpdateSulk(Date.now());
    },

    getSulkUntil(): number | null {
      return sulkUntil;
    },

    clearSulk(): void {
      setSulkUntil(null);
    },

    getConsecutiveDismisses(): number {
      let count = 0;
      for (let i = outcomes.length - 1; i >= 0; i--) {
        if (outcomes[i] === "dismissed" || outcomes[i] === "rejected") {
          count++;
        } else {
          break;
        }
      }
      return count;
    },

    isConservativeMode(): boolean {
      if (outcomes.length < CONSERVATIVE_COUNT) return false;
      const tail = outcomes.slice(-CONSERVATIVE_COUNT);
      return tail.every((o) => o === "ignored");
    },

    hydrate(snapshot: SulkSnapshot): void {
      // Only re-apply if still in the future — expired sulks stay cleared.
      if (snapshot.sulkUntil !== null && snapshot.sulkUntil > Date.now()) {
        sulkUntil = snapshot.sulkUntil;
      } else {
        sulkUntil = null;
      }
      // hydrate is a boot-time load; no onChange fires (no user-visible transition)
    },

    snapshot(): SulkSnapshot {
      return { sulkUntil };
    },
  };
}
