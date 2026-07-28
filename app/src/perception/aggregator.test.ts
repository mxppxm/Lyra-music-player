import { describe, it, expect } from "vitest";
import { EventBus } from "./events";
import { aggregate } from "./aggregator";

const WIN = 5 * 60 * 1000; // 5 min

function makeBus(...events: Parameters<EventBus["emit"]>[0][]): EventBus {
  const b = new EventBus();
  for (const e of events) b.emit(e);
  return b;
}

describe("aggregate", () => {
  it("returns zero-ish features for an empty bus", () => {
    const b = new EventBus();
    const f = aggregate(b, WIN, 10_000);
    expect(f.activeMs).toBe(0);
    expect(f.submits).toBe(0);
    expect(Number.isNaN(f.avgSubmitGapMs)).toBe(true);
    expect(f.totalChars).toBe(0);
    expect(f.skips).toBe(0);
    expect(f.completions).toBe(0);
    expect(f.skipRatio).toBe(0);
    expect(f.proactiveDismisses).toBe(0);
    expect(f.isBlurred).toBe(false);
  });

  it("counts activeMs from mouse_active + key_active (500ms per tick)", () => {
    const now = 100_000;
    const b = makeBus(
      { kind: "mouse_active", at: now - 1000 },
      { kind: "key_active", at: now - 500 },
      { kind: "mouse_active", at: now - 200 },
    );
    const f = aggregate(b, WIN, now);
    expect(f.activeMs).toBe(3 * 500);
  });

  it("computes submits, totalChars, and avgSubmitGapMs correctly", () => {
    const now = 100_000;
    const b = makeBus(
      { kind: "input_submit", at: now - 30_000, charCount: 10 },
      { kind: "input_submit", at: now - 20_000, charCount: 5 },
      { kind: "input_submit", at: now - 10_000, charCount: 15 },
    );
    const f = aggregate(b, WIN, now);
    expect(f.submits).toBe(3);
    expect(f.totalChars).toBe(30);
    // gaps: 10000 + 10000 = 20000, avg = 10000
    expect(f.avgSubmitGapMs).toBe(10_000);
  });

  it("computes skipRatio as skip / (skip + complete)", () => {
    const now = 100_000;
    const b = makeBus(
      { kind: "skip", at: now - 4000, turnId: "t1" },
      { kind: "skip", at: now - 3000, turnId: "t2" },
      { kind: "complete", at: now - 2000, turnId: "t3" },
    );
    const f = aggregate(b, WIN, now);
    expect(f.skips).toBe(2);
    expect(f.completions).toBe(1);
    expect(f.skipRatio).toBeCloseTo(2 / 3, 5);
  });

  it("counts proactiveDismisses", () => {
    const now = 100_000;
    const b = makeBus(
      { kind: "proactive_dismissed", at: now - 5000, intentId: "i1" },
      { kind: "proactive_dismissed", at: now - 3000, intentId: "i2" },
    );
    const f = aggregate(b, WIN, now);
    expect(f.proactiveDismisses).toBe(2);
  });

  it("isBlurred reflects last focus/blur event in window", () => {
    const now = 100_000;
    // blur then focus → not blurred
    const b1 = makeBus(
      { kind: "window_blur", at: now - 4000 },
      { kind: "window_focus", at: now - 2000 },
    );
    expect(aggregate(b1, WIN, now).isBlurred).toBe(false);

    // focus then blur → blurred
    const b2 = makeBus(
      { kind: "window_focus", at: now - 4000 },
      { kind: "window_blur", at: now - 2000 },
    );
    expect(aggregate(b2, WIN, now).isBlurred).toBe(true);
  });

  it("respects the windowMs boundary — events outside window are excluded", () => {
    const now = 100_000;
    const windowMs = 10_000;
    const b = makeBus(
      // outside window
      { kind: "input_submit", at: now - 15_000, charCount: 99 },
      // inside window
      { kind: "input_submit", at: now - 5_000, charCount: 7 },
    );
    const f = aggregate(b, windowMs, now);
    expect(f.submits).toBe(1);
    expect(f.totalChars).toBe(7);
  });
});

describe("aggregator new dims (Sprint 13)", () => {
  const NOW = 1_000_000;
  const WIN = 60_000;

  it("counts scrollEvents", () => {
    const bus = new EventBus();
    bus.emit({ kind: "scroll", at: NOW - 1000, container: "data_explorer", direction: "up" });
    bus.emit({ kind: "scroll", at: NOW - 500, container: "roadmap", direction: "down" });
    bus.emit({ kind: "scroll", at: NOW - 100, container: "other", direction: "up" });
    expect(aggregate(bus, WIN, NOW).scrollEvents).toBe(3);
  });

  it("counts hoverDwellCount and sums totalHoverDwellMs", () => {
    const bus = new EventBus();
    bus.emit({ kind: "hover_dwell", at: NOW - 5000, target: "album_cover", ms: 3200 });
    bus.emit({ kind: "hover_dwell", at: NOW - 3000, target: "small_note", ms: 4100 });
    const f = aggregate(bus, WIN, NOW);
    expect(f.hoverDwellCount).toBe(2);
    expect(f.totalHoverDwellMs).toBe(7300);
  });

  it("counts abandonedInputs from input_dwell_without_submit events", () => {
    const bus = new EventBus();
    bus.emit({ kind: "input_dwell_without_submit", at: NOW - 4000, charsTyped: 12, dwellMs: 11000 });
    bus.emit({ kind: "input_dwell_without_submit", at: NOW - 2000, charsTyped: 5, dwellMs: 15000 });
    expect(aggregate(bus, WIN, NOW).abandonedInputs).toBe(2);
  });

  it("sums focusIdleMs from focus_no_interaction sinceMs values", () => {
    const bus = new EventBus();
    bus.emit({ kind: "focus_no_interaction", at: NOW - 30000, sinceMs: 180000 });
    bus.emit({ kind: "focus_no_interaction", at: NOW - 5000, sinceMs: 200000 });
    expect(aggregate(bus, WIN, NOW).focusIdleMs).toBe(380000);
  });

  it("does not perturb existing dims when new events are present (regression)", () => {
    const bus = new EventBus();
    bus.emit({ kind: "mouse_active", at: NOW - 3000 });
    bus.emit({ kind: "input_submit", at: NOW - 2000, charCount: 10 });
    bus.emit({ kind: "scroll", at: NOW - 1000, container: "data_explorer", direction: "up" });
    bus.emit({ kind: "hover_dwell", at: NOW - 500, target: "album_cover", ms: 3200 });
    const f = aggregate(bus, WIN, NOW);
    expect(f.activeMs).toBe(500);
    expect(f.submits).toBe(1);
    expect(f.totalChars).toBe(10);
  });

  it("splits key/mouse counts and computes activityDensity", () => {
    const now = 100_000;
    const b = makeBus(
      { kind: "key_active", at: now - 1000 },
      { kind: "key_active", at: now - 500 },
      { kind: "mouse_active", at: now - 200 },
    );
    const f = aggregate(b, WIN, now);
    expect(f.keyActiveCount).toBe(2);
    expect(f.mouseActiveCount).toBe(1);
    expect(f.activeMs).toBe(3 * 500);
    expect(f.activityDensity).toBeCloseTo((3 * 500) / WIN, 5);
    expect(f.weatherCode).toBeNull();
  });
});

