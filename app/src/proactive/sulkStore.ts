import type { ProactiveKind } from "./types";

export type ProactiveOutcome = "accepted" | "dismissed" | "ignored" | "rejected";

export type SulkStore = {
  recordProactiveOutcome(kind: ProactiveKind, outcome: ProactiveOutcome): void;
  getSulkUntil(): number | null;
  clearSulk(): void;
  getConsecutiveDismisses(): number;
  /** Conservative mode: if last 5 outcomes are all ignored, daily_limit drops to 1 */
  isConservativeMode(): boolean;
};

const WINDOW = 5;
const SULK_TRIGGER_COUNT = 3;
const SULK_DURATION_MS = 3 * 24 * 3600_000; // 3 days
const CONSERVATIVE_COUNT = 5;

export function createSulkStore(): SulkStore {
  /** Ring buffer of last WINDOW outcomes */
  const outcomes: ProactiveOutcome[] = [];
  let sulkUntil: number | null = null;

  function push(o: ProactiveOutcome): void {
    outcomes.push(o);
    if (outcomes.length > WINDOW) outcomes.shift();
  }

  function checkAndUpdateSulk(now: number): void {
    // Enter sulk if last SULK_TRIGGER_COUNT in a row are dismissed or rejected
    if (outcomes.length >= SULK_TRIGGER_COUNT) {
      const tail = outcomes.slice(-SULK_TRIGGER_COUNT);
      const allBad = tail.every((o) => o === "dismissed" || o === "rejected");
      if (allBad) {
        sulkUntil = now + SULK_DURATION_MS;
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
      sulkUntil = null;
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
  };
}
