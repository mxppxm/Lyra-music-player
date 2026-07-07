import { describe, it, expect } from "vitest";
import { politenessGate } from "./politeness";
import type { ProactiveIntent, PolitenessState } from "./types";

function makeIntent(overrides: Partial<ProactiveIntent> = {}): ProactiveIntent {
  return {
    id: "test-id",
    createdAt: 1000,
    validUntil: 1000 + 30 * 60_000,
    kind: "morning",
    urgency: 0.5,
    hint: "test",
    ...overrides,
  };
}

function makeState(overrides: Partial<PolitenessState> = {}): PolitenessState {
  return {
    todayProactiveCount: 0,
    todayKindCount: {},
    lastKindFireAt: {},
    sulkUntil: null,
    isFocusOrSleep: () => false,
    isPlayingOtherSource: () => false,
    ...overrides,
  };
}

const NOW = 1_000_000_000;

describe("politenessGate", () => {
  it("passes when all conditions are clear", () => {
    const result = politenessGate(makeIntent(), makeState(), NOW);
    expect(result.pass).toBe(true);
  });

  describe("gate 1: daily_limit", () => {
    it("blocks when todayProactiveCount >= 3", () => {
      const state = makeState({ todayProactiveCount: 3 });
      const result = politenessGate(makeIntent(), state, NOW);
      expect(result).toEqual({ pass: false, reason: "daily_limit" });
    });

    it("passes when todayProactiveCount is 2", () => {
      const state = makeState({ todayProactiveCount: 2 });
      const result = politenessGate(makeIntent(), state, NOW);
      expect(result.pass).toBe(true);
    });
  });

  describe("gate 2: kind_budget", () => {
    it("blocks morning when morning count >= 1", () => {
      const state = makeState({ todayKindCount: { morning: 1 } });
      const result = politenessGate(makeIntent({ kind: "morning" }), state, NOW);
      expect(result).toEqual({ pass: false, reason: "kind_budget" });
    });

    it("blocks rhythm when rhythm count >= 2", () => {
      const state = makeState({ todayKindCount: { rhythm: 2 } });
      const result = politenessGate(makeIntent({ kind: "rhythm" }), state, NOW);
      expect(result).toEqual({ pass: false, reason: "kind_budget" });
    });

    it("passes rhythm when count is 1 (budget=2)", () => {
      const state = makeState({ todayKindCount: { rhythm: 1 } });
      const result = politenessGate(makeIntent({ kind: "rhythm" }), state, NOW);
      expect(result.pass).toBe(true);
    });
  });

  describe("gate 3: cooldown", () => {
    it("blocks when within morning cooldown (24h)", () => {
      const lastFire = NOW - 23 * 3600_000; // 23h ago
      const state = makeState({ lastKindFireAt: { morning: lastFire } });
      const result = politenessGate(makeIntent({ kind: "morning" }), state, NOW);
      expect(result).toEqual({ pass: false, reason: "cooldown" });
    });

    it("passes when outside morning cooldown", () => {
      const lastFire = NOW - 25 * 3600_000; // 25h ago
      const state = makeState({ lastKindFireAt: { morning: lastFire } });
      const result = politenessGate(makeIntent({ kind: "morning" }), state, NOW);
      expect(result.pass).toBe(true);
    });

    it("blocks care within 6h cooldown", () => {
      const lastFire = NOW - 5 * 3600_000;
      const state = makeState({ lastKindFireAt: { care: lastFire } });
      const result = politenessGate(makeIntent({ kind: "care" }), state, NOW);
      expect(result).toEqual({ pass: false, reason: "cooldown" });
    });

    it("passes when no lastKindFireAt recorded", () => {
      const state = makeState({ lastKindFireAt: {} });
      const result = politenessGate(makeIntent({ kind: "morning" }), state, NOW);
      expect(result.pass).toBe(true);
    });
  });

  describe("gate 4: focus_or_sleep", () => {
    it("blocks when isFocusOrSleep is true for morning", () => {
      const state = makeState({ isFocusOrSleep: () => true });
      const result = politenessGate(makeIntent({ kind: "morning" }), state, NOW);
      expect(result).toEqual({ pass: false, reason: "focus_or_sleep" });
    });

    it("allows care with urgency >= 0.85 even in focus/sleep", () => {
      const state = makeState({ isFocusOrSleep: () => true });
      const result = politenessGate(
        makeIntent({ kind: "care", urgency: 0.85 }),
        state,
        NOW,
      );
      expect(result.pass).toBe(true);
    });

    it("blocks care with urgency < 0.85 in focus/sleep", () => {
      const state = makeState({ isFocusOrSleep: () => true });
      const result = politenessGate(
        makeIntent({ kind: "care", urgency: 0.84 }),
        state,
        NOW,
      );
      expect(result).toEqual({ pass: false, reason: "focus_or_sleep" });
    });
  });

  describe("gate 5: sulk", () => {
    it("blocks when sulkUntil is in the future", () => {
      const state = makeState({ sulkUntil: NOW + 3600_000 });
      const result = politenessGate(makeIntent(), state, NOW);
      expect(result).toEqual({ pass: false, reason: "sulk" });
    });

    it("passes when sulkUntil is in the past", () => {
      const state = makeState({ sulkUntil: NOW - 1 });
      const result = politenessGate(makeIntent(), state, NOW);
      expect(result.pass).toBe(true);
    });

    it("passes when sulkUntil is null", () => {
      const state = makeState({ sulkUntil: null });
      const result = politenessGate(makeIntent(), state, NOW);
      expect(result.pass).toBe(true);
    });
  });

  describe("gate 6: playing_other", () => {
    it("blocks when isPlayingOtherSource is true", () => {
      const state = makeState({ isPlayingOtherSource: () => true });
      const result = politenessGate(makeIntent(), state, NOW);
      expect(result).toEqual({ pass: false, reason: "playing_other" });
    });
  });

  describe("gate ordering", () => {
    it("daily_limit fires before kind_budget", () => {
      const state = makeState({
        todayProactiveCount: 3,
        todayKindCount: { morning: 1 },
      });
      const result = politenessGate(makeIntent({ kind: "morning" }), state, NOW);
      expect(result).toEqual({ pass: false, reason: "daily_limit" });
    });

    it("kind_budget fires before cooldown", () => {
      const state = makeState({
        todayKindCount: { morning: 1 },
        lastKindFireAt: { morning: NOW - 23 * 3600_000 },
      });
      const result = politenessGate(makeIntent({ kind: "morning" }), state, NOW);
      expect(result).toEqual({ pass: false, reason: "kind_budget" });
    });
  });
});
