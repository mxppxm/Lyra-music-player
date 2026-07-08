import { describe, it, expect } from "vitest";
import { EventBus, bus } from "./events";

describe("EventBus", () => {
  it("emit fires all subscribed listeners with the event", () => {
    const b = new EventBus();
    const received: unknown[] = [];
    b.subscribe((e) => received.push(e));

    const ev = { kind: "window_focus" as const, at: 1000 };
    b.emit(ev);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(ev);
  });

  it("unsubscribe stops delivery", () => {
    const b = new EventBus();
    const received: unknown[] = [];
    const unsub = b.subscribe((e) => received.push(e));

    b.emit({ kind: "window_focus", at: 1000 });
    unsub();
    b.emit({ kind: "window_blur", at: 2000 });

    expect(received).toHaveLength(1);
  });

  it("recent respects the lookback window and sorts by at", () => {
    const b = new EventBus();
    const now = 10_000;

    // t=5000 is within 6000ms window, t=3000 is outside
    b.emit({ kind: "window_blur", at: 3000 });
    b.emit({ kind: "window_focus", at: 5000 });
    b.emit({ kind: "mouse_active", at: 9000 });

    const results = b.recent(6000, now);
    expect(results.map((e) => e.at)).toEqual([5000, 9000]);
  });

  it("buffer caps at 1000 events (oldest dropped)", () => {
    const b = new EventBus();
    for (let i = 0; i < 1001; i++) {
      b.emit({ kind: "mouse_active", at: i });
    }
    // The oldest event (at=0) should have been evicted; at=1 is now the oldest
    const all = b.recent(Infinity, 2000);
    expect(all).toHaveLength(1000);
    expect(all[0].at).toBe(1);
    expect(all[all.length - 1].at).toBe(1000);
  });

  it("singleton bus is an EventBus instance and is shared", () => {
    expect(bus).toBeInstanceOf(EventBus);

    const received: unknown[] = [];
    const unsub = bus.subscribe((e) => received.push(e));
    bus.emit({ kind: "key_active", at: 42 });
    unsub();

    expect(received).toHaveLength(1);
    expect((received[0] as { kind: string }).kind).toBe("key_active");
  });
});

describe("EventBus new event kinds (Sprint 13)", () => {
  it("emits and retrieves scroll / hover_dwell / input_dwell_without_submit / focus_no_interaction", () => {
    const bus = new EventBus();
    bus.emit({ kind: "scroll", at: 100, container: "data_explorer", direction: "down" });
    bus.emit({ kind: "hover_dwell", at: 200, target: "album_cover", ms: 3200 });
    bus.emit({ kind: "input_dwell_without_submit", at: 300, charsTyped: 7, dwellMs: 12000 });
    bus.emit({ kind: "focus_no_interaction", at: 400, sinceMs: 185000 });

    const events = bus.recent(10_000, 5_000);
    expect(events.map((e) => e.kind)).toEqual([
      "scroll",
      "hover_dwell",
      "input_dwell_without_submit",
      "focus_no_interaction",
    ]);
  });
});
