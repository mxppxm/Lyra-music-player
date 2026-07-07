import { describe, it, expect, beforeEach } from "vitest";
import { createSulkStore } from "./sulkStore";
import type { SulkStore } from "./sulkStore";

describe("SulkStore", () => {
  let store: SulkStore;

  beforeEach(() => {
    store = createSulkStore();
  });

  describe("initial state", () => {
    it("starts with no sulk", () => {
      expect(store.getSulkUntil()).toBeNull();
    });

    it("starts with 0 consecutive dismisses", () => {
      expect(store.getConsecutiveDismisses()).toBe(0);
    });

    it("starts not in conservative mode", () => {
      expect(store.isConservativeMode()).toBe(false);
    });
  });

  describe("sulk entry — last 3 in a row dismissed or rejected", () => {
    it("enters sulk after 3 consecutive dismissals", () => {
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      expect(store.getSulkUntil()).not.toBeNull();
    });

    it("enters sulk after 3 consecutive rejections", () => {
      store.recordProactiveOutcome("care", "rejected");
      store.recordProactiveOutcome("care", "rejected");
      store.recordProactiveOutcome("care", "rejected");
      expect(store.getSulkUntil()).not.toBeNull();
    });

    it("enters sulk on mixed dismissed+rejected", () => {
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("share", "rejected");
      store.recordProactiveOutcome("rhythm", "dismissed");
      expect(store.getSulkUntil()).not.toBeNull();
    });

    it("does NOT enter sulk if only 2 consecutive dismissed", () => {
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      expect(store.getSulkUntil()).toBeNull();
    });

    it("does NOT enter sulk if streak is broken by accepted", () => {
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "accepted");
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      expect(store.getSulkUntil()).toBeNull();
    });

    it("does NOT enter sulk if streak is broken by ignored", () => {
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "ignored");
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      expect(store.getSulkUntil()).toBeNull();
    });

    it("sulk duration is approximately 3 days", () => {
      const before = Date.now();
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      const after = Date.now();
      const sulkUntil = store.getSulkUntil()!;
      const threeDaysMs = 3 * 24 * 3600_000;
      expect(sulkUntil).toBeGreaterThanOrEqual(before + threeDaysMs - 100);
      expect(sulkUntil).toBeLessThanOrEqual(after + threeDaysMs + 100);
    });
  });

  describe("sulk clearing", () => {
    it("clearSulk sets sulkUntil to null", () => {
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      expect(store.getSulkUntil()).not.toBeNull();
      store.clearSulk();
      expect(store.getSulkUntil()).toBeNull();
    });

    it("can clear sulk before it starts", () => {
      store.clearSulk();
      expect(store.getSulkUntil()).toBeNull();
    });
  });

  describe("conservative mode — last 5 in a row ignored", () => {
    it("enters conservative mode after 5 consecutive ignores", () => {
      for (let i = 0; i < 5; i++) {
        store.recordProactiveOutcome("morning", "ignored");
      }
      expect(store.isConservativeMode()).toBe(true);
    });

    it("does NOT enter conservative mode with only 4 ignores", () => {
      for (let i = 0; i < 4; i++) {
        store.recordProactiveOutcome("morning", "ignored");
      }
      expect(store.isConservativeMode()).toBe(false);
    });

    it("does NOT enter conservative mode if streak broken by accepted", () => {
      store.recordProactiveOutcome("morning", "ignored");
      store.recordProactiveOutcome("morning", "ignored");
      store.recordProactiveOutcome("morning", "accepted");
      store.recordProactiveOutcome("morning", "ignored");
      store.recordProactiveOutcome("morning", "ignored");
      expect(store.isConservativeMode()).toBe(false);
    });

    it("uses sliding window of last 5", () => {
      // First outcome is accepted, then 5 ignores — window of 5 is all ignores
      store.recordProactiveOutcome("morning", "accepted");
      for (let i = 0; i < 5; i++) {
        store.recordProactiveOutcome("morning", "ignored");
      }
      expect(store.isConservativeMode()).toBe(true);
    });
  });

  describe("getConsecutiveDismisses", () => {
    it("counts trailing dismissed/rejected streak", () => {
      store.recordProactiveOutcome("morning", "accepted");
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "rejected");
      expect(store.getConsecutiveDismisses()).toBe(2);
    });

    it("resets when non-dismiss outcome appears", () => {
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "accepted");
      expect(store.getConsecutiveDismisses()).toBe(0);
    });
  });

  describe("persistence: snapshot / hydrate / onChange", () => {
    it("snapshot returns the current sulkUntil", () => {
      expect(store.snapshot().sulkUntil).toBeNull();
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      expect(store.snapshot().sulkUntil).toBe(store.getSulkUntil());
    });

    it("hydrate restores a future sulkUntil", () => {
      const future = Date.now() + 24 * 3600_000;
      store.hydrate({ sulkUntil: future });
      expect(store.getSulkUntil()).toBe(future);
    });

    it("hydrate ignores expired sulkUntil (defensive: never punish forever)", () => {
      const past = Date.now() - 24 * 3600_000;
      store.hydrate({ sulkUntil: past });
      expect(store.getSulkUntil()).toBeNull();
    });

    it("hydrate with null clears sulkUntil", () => {
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      store.recordProactiveOutcome("morning", "dismissed");
      store.hydrate({ sulkUntil: null });
      expect(store.getSulkUntil()).toBeNull();
    });

    it("hydrate does NOT fire onChange (boot rehydration is invisible)", () => {
      const changes: Array<number | null> = [];
      const s = createSulkStore({
        onChange: (snap) => changes.push(snap.sulkUntil),
      });
      s.hydrate({ sulkUntil: Date.now() + 24 * 3600_000 });
      expect(changes).toEqual([]);
    });

    it("onChange fires when sulk is entered", () => {
      const changes: Array<number | null> = [];
      const s = createSulkStore({
        onChange: (snap) => changes.push(snap.sulkUntil),
      });
      s.recordProactiveOutcome("morning", "dismissed");
      s.recordProactiveOutcome("morning", "dismissed");
      s.recordProactiveOutcome("morning", "dismissed");
      expect(changes.length).toBe(1);
      expect(changes[0]).not.toBeNull();
    });

    it("onChange fires when sulk is cleared", () => {
      const changes: Array<number | null> = [];
      const s = createSulkStore({
        onChange: (snap) => changes.push(snap.sulkUntil),
      });
      s.recordProactiveOutcome("morning", "dismissed");
      s.recordProactiveOutcome("morning", "dismissed");
      s.recordProactiveOutcome("morning", "dismissed");
      s.clearSulk();
      expect(changes.length).toBe(2);
      expect(changes[1]).toBeNull();
    });

    it("onChange does NOT fire when clearSulk is called on already-clear state", () => {
      const changes: Array<number | null> = [];
      const s = createSulkStore({
        onChange: (snap) => changes.push(snap.sulkUntil),
      });
      s.clearSulk();
      s.clearSulk();
      expect(changes).toEqual([]);
    });
  });
});
