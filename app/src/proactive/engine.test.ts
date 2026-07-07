import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProactiveEngine } from "./engine";
import { createSulkStore } from "./sulkStore";
import type { ProactiveIntent, PolitenessState, RuleContext } from "./types";

// Mock tray integrations so tests don't need a Tauri runtime
vi.mock("../tray/trayBridge", () => ({
  setBreathing: vi.fn(async () => {}),
}));
vi.mock("../tray/notification", () => ({
  sendLyraProactiveNotification: vi.fn(async () => {}),
}));

import { setBreathing } from "../tray/trayBridge";
import { sendLyraProactiveNotification } from "../tray/notification";

const NOW = 1_720_000_000_000;

function makeIntent(overrides: Partial<ProactiveIntent> = {}): ProactiveIntent {
  return {
    id: "intent-1",
    createdAt: NOW,
    validUntil: NOW + 30 * 60_000,
    kind: "morning",
    urgency: 0.5,
    hint: "test",
    ...overrides,
  };
}

function makePolitenessState(overrides: Partial<PolitenessState> = {}): PolitenessState {
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

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    now: new Date(NOW),
    lastAppOpenAt: null,
    todayFirstOpen: true,
    sharedMemories: [],
    dreamSeeds: [],
    todayKindCount: {},
    ...overrides,
  };
}

describe("ProactiveEngine.tick", () => {
  let fulfill: (intent: ProactiveIntent) => Promise<void>;
  let sulkStore: ReturnType<typeof createSulkStore>;
  let politenessState: PolitenessState;

  beforeEach(() => {
    fulfill = vi.fn(async () => {});
    sulkStore = createSulkStore();
    politenessState = makePolitenessState();
    vi.mocked(setBreathing).mockClear();
    vi.mocked(sendLyraProactiveNotification).mockClear();
  });

  it("calls fulfill when a rule returns an intent and gate passes", async () => {
    const intent = makeIntent();
    const rule = vi.fn(() => intent);

    const engine = new ProactiveEngine({
      rules: [rule],
      politenessState,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());
    expect(fulfill).toHaveBeenCalledOnce();
    expect(fulfill).toHaveBeenCalledWith(intent);
  });

  it("does NOT call fulfill when no rules return an intent", async () => {
    const engine = new ProactiveEngine({
      rules: [() => null],
      politenessState,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());
    expect(fulfill).not.toHaveBeenCalled();
  });

  it("picks highest urgency intent first", async () => {
    const lowIntent = makeIntent({ id: "low", kind: "care", urgency: 0.3 });
    const highIntent = makeIntent({ id: "high", kind: "morning", urgency: 0.9 });

    const engine = new ProactiveEngine({
      rules: [() => lowIntent, () => highIntent],
      politenessState,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());
    expect(fulfill).toHaveBeenCalledWith(highIntent);
  });

  it("falls through to second intent if first is blocked by gate", async () => {
    // First intent is blocked (morning already used)
    const blocked = makeIntent({ id: "blocked", kind: "morning", urgency: 0.9 });
    const allowed = makeIntent({ id: "allowed", kind: "care", urgency: 0.5 });

    const state = makePolitenessState({
      todayKindCount: { morning: 1 }, // morning budget exhausted
    });

    const engine = new ProactiveEngine({
      rules: [() => blocked, () => allowed],
      politenessState: state,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());
    expect(fulfill).toHaveBeenCalledWith(allowed);
  });

  it("updates politenessState counters after fulfilling", async () => {
    const intent = makeIntent({ kind: "morning" });

    const engine = new ProactiveEngine({
      rules: [() => intent],
      politenessState,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());

    expect(politenessState.todayProactiveCount).toBe(1);
    expect(politenessState.todayKindCount.morning).toBe(1);
    expect(politenessState.lastKindFireAt.morning).toBe(NOW);
  });

  it("is a no-op when all intents fail the gate", async () => {
    const state = makePolitenessState({
      todayProactiveCount: 3, // daily limit reached
    });

    const engine = new ProactiveEngine({
      rules: [() => makeIntent()],
      politenessState: state,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());
    expect(fulfill).not.toHaveBeenCalled();
  });

  it("only fulfills once even with multiple passing intents", async () => {
    const i1 = makeIntent({ id: "i1", kind: "morning", urgency: 0.9 });
    const i2 = makeIntent({ id: "i2", kind: "care", urgency: 0.4 });

    const engine = new ProactiveEngine({
      rules: [() => i1, () => i2],
      politenessState,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());
    expect(fulfill).toHaveBeenCalledOnce();
  });

  it("conservative mode drops daily limit to 1 when last 5 outcomes are ignored", async () => {
    for (let i = 0; i < 5; i++) {
      sulkStore.recordProactiveOutcome("morning", "ignored");
    }

    // State already has 1 fired today — should block in conservative mode (limit=1)
    const state = makePolitenessState({ todayProactiveCount: 1 });

    const engine = new ProactiveEngine({
      rules: [() => makeIntent()],
      politenessState: state,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());
    expect(fulfill).not.toHaveBeenCalled();
  });

  it("calls setBreathing(true) and sendLyraProactiveNotification when gate passes", async () => {
    const intent = makeIntent();
    const engine = new ProactiveEngine({
      rules: [() => intent],
      politenessState,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());

    expect(setBreathing).toHaveBeenCalledWith(true);
    expect(sendLyraProactiveNotification).toHaveBeenCalledOnce();
  });

  it("does NOT call setBreathing when gate blocks", async () => {
    const state = makePolitenessState({ todayProactiveCount: 3 }); // daily limit reached

    const engine = new ProactiveEngine({
      rules: [() => makeIntent()],
      politenessState: state,
      sulkStore,
      fulfill,
      now: () => NOW,
    });

    await engine.tick(makeCtx());

    expect(setBreathing).not.toHaveBeenCalled();
    expect(sendLyraProactiveNotification).not.toHaveBeenCalled();
  });
});

describe("ProactiveEngine.recordOutcome", () => {
  it("delegates to sulkStore and enters sulk after 3 dismissals", () => {
    const sulkStore = createSulkStore();
    const engine = new ProactiveEngine({
      rules: [],
      politenessState: makePolitenessState(),
      sulkStore,
      fulfill: vi.fn(),
      now: () => NOW,
    });

    engine.recordOutcome("morning", "dismissed");
    engine.recordOutcome("morning", "dismissed");
    engine.recordOutcome("morning", "dismissed");

    expect(sulkStore.getSulkUntil()).not.toBeNull();
  });
});
