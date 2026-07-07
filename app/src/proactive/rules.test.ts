import { describe, it, expect } from "vitest";
import {
  morningRule,
  careRule,
  anniversaryRule,
  shareRule,
  rhythmRule,
} from "./rules";
import type { RuleContext, DreamSeed } from "./types";

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    now: new Date("2026-07-07T08:00:00"),
    lastAppOpenAt: null,
    todayFirstOpen: true,
    sharedMemories: [],
    dreamSeeds: [],
    todayKindCount: {},
    ...overrides,
  };
}

describe("morningRule", () => {
  it("fires on first open in morning hours [5, 12)", () => {
    const ctx = makeCtx({
      now: new Date("2026-07-07T08:00:00"),
      todayFirstOpen: true,
      todayKindCount: {},
    });
    const intent = morningRule(ctx);
    expect(intent).not.toBeNull();
    expect(intent?.kind).toBe("morning");
    expect(intent?.urgency).toBe(0.5);
    expect(intent?.hint).toBe("早上第一次打开");
  });

  it("returns null if NOT todayFirstOpen", () => {
    const ctx = makeCtx({
      now: new Date("2026-07-07T08:00:00"),
      todayFirstOpen: false,
    });
    expect(morningRule(ctx)).toBeNull();
  });

  it("returns null if hour < 5 (midnight)", () => {
    const ctx = makeCtx({
      now: new Date("2026-07-07T04:59:59"),
      todayFirstOpen: true,
    });
    expect(morningRule(ctx)).toBeNull();
  });

  it("returns null if hour >= 12 (noon)", () => {
    const ctx = makeCtx({
      now: new Date("2026-07-07T12:00:00"),
      todayFirstOpen: true,
    });
    expect(morningRule(ctx)).toBeNull();
  });

  it("returns null if morning intent already fired today", () => {
    const ctx = makeCtx({
      now: new Date("2026-07-07T08:00:00"),
      todayFirstOpen: true,
      todayKindCount: { morning: 1 },
    });
    expect(morningRule(ctx)).toBeNull();
  });

  it("fires at the boundary hour 5", () => {
    const ctx = makeCtx({
      now: new Date("2026-07-07T05:00:00"),
      todayFirstOpen: true,
    });
    expect(morningRule(ctx)).not.toBeNull();
  });

  it("fires at 11:59 (just before noon)", () => {
    const ctx = makeCtx({
      now: new Date("2026-07-07T11:59:59"),
      todayFirstOpen: true,
    });
    expect(morningRule(ctx)).not.toBeNull();
  });

  it("uses dream seed hint and targetProfile when seed is present", () => {
    const seed: DreamSeed = {
      kind: "morning",
      hint: "想起了那首钢琴曲",
      createdISO: "2026-07-07T03:14:00Z",
    };
    const ctx = makeCtx({
      now: new Date("2026-07-07T08:00:00"),
      todayFirstOpen: true,
      dreamSeeds: [seed],
    });
    const intent = morningRule(ctx);
    expect(intent).not.toBeNull();
    expect(intent?.hint).toBe("想起了那首钢琴曲");
    expect(intent?.targetProfile).toBe("想起了那首钢琴曲");
    expect(intent?.seed?.reflectDreamISO).toBe("2026-07-07T03:14:00Z");
  });

  it("sets validUntil to createdAt + 30 minutes", () => {
    const ctx = makeCtx({
      now: new Date("2026-07-07T08:00:00"),
      todayFirstOpen: true,
    });
    const intent = morningRule(ctx)!;
    expect(intent.validUntil - intent.createdAt).toBe(30 * 60_000);
  });

  it("produces a non-empty uuid id", () => {
    const ctx = makeCtx();
    const intent = morningRule(ctx)!;
    expect(intent.id).toBeTruthy();
    expect(intent.id.length).toBeGreaterThan(0);
  });
});

describe("v0.2 stub rules — all return null", () => {
  const ctx = makeCtx();

  it("careRule returns null", () => {
    expect(careRule(ctx)).toBeNull();
  });

  it("anniversaryRule returns null", () => {
    expect(anniversaryRule(ctx)).toBeNull();
  });

  it("shareRule returns null", () => {
    expect(shareRule(ctx)).toBeNull();
  });

  it("rhythmRule returns null", () => {
    expect(rhythmRule(ctx)).toBeNull();
  });
});
