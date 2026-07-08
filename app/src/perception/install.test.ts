import { describe, it, expect, vi } from "vitest";
import { EventBus, type LyraEvent } from "./events";
import { installPerceptionListeners } from "./install";

type Handler = (ev?: unknown) => void;

function makeFakeWindow() {
  const handlers = new Map<string, Set<Handler>>();
  const win = {
    addEventListener(type: string, h: Handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(h);
    },
    removeEventListener(type: string, h: Handler) {
      handlers.get(type)?.delete(h);
    },
  };
  const fire = (type: string) => {
    for (const h of handlers.get(type) ?? []) h();
  };
  const listenerCount = () =>
    Array.from(handlers.values()).reduce((s, set) => s + set.size, 0);
  return { win, fire, listenerCount };
}

describe("installPerceptionListeners", () => {
  it("attaches focus/blur/mousemove/keydown listeners on window", () => {
    const bus = new EventBus();
    const { win, listenerCount } = makeFakeWindow();
    installPerceptionListeners(bus, { win });
    expect(listenerCount()).toBe(4);
  });

  it("emits typed events with the correct kind on each fired listener", () => {
    const bus = new EventBus();
    const received: LyraEvent[] = [];
    bus.subscribe((e) => received.push(e));
    let now = 1000;
    const { win, fire } = makeFakeWindow();
    installPerceptionListeners(bus, { win, now: () => now });

    fire("focus");
    now += 1000;
    fire("blur");
    now += 1000;
    fire("mousemove");
    now += 1000;
    fire("keydown");

    expect(received.map((e) => e.kind)).toEqual([
      "window_focus",
      "window_blur",
      "mouse_active",
      "key_active",
    ]);
  });

  it("throttles same-kind events to 1 per 500ms", () => {
    const bus = new EventBus();
    const received: LyraEvent[] = [];
    bus.subscribe((e) => received.push(e));
    let now = 1000;
    const { win, fire } = makeFakeWindow();
    installPerceptionListeners(bus, { win, now: () => now });

    // Fire mousemove 3 times within 100ms — should only emit once
    fire("mousemove");
    now += 100;
    fire("mousemove");
    now += 100;
    fire("mousemove");
    expect(received).toHaveLength(1);

    // Advance past the throttle window — next fire should emit
    now += 500;
    fire("mousemove");
    expect(received).toHaveLength(2);
  });

  it("uninstall removes all listeners", () => {
    const bus = new EventBus();
    const { win, fire, listenerCount } = makeFakeWindow();
    const received: LyraEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const uninstall = installPerceptionListeners(bus, { win, now: () => 1000 });
    expect(listenerCount()).toBe(4);

    uninstall();
    expect(listenerCount()).toBe(0);

    // Firing after uninstall should not add events
    fire("focus");
    fire("mousemove");
    expect(received).toHaveLength(0);
  });

  it("returns a no-op when no window is available (SSR/tests)", () => {
    const bus = new EventBus();
    const off = installPerceptionListeners(bus, { win: undefined });
    expect(typeof off).toBe("function");
    // Calling the returned function must not throw
    off();
  });
});

describe("Sprint 13 install additions", () => {
  it("scroll events on data-lyra-scroll containers emit scroll with container tag", () => {
    const bus = new EventBus();
    const handlers: Record<string, (e: unknown) => void> = {};
    const doc = {
      addEventListener: (name: string, fn: (e: unknown) => void) => { handlers[name] = fn; },
      removeEventListener: () => {},
    };
    const win = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    let now = 1000;
    installPerceptionListeners(bus, { win, doc, now: () => now } as Parameters<typeof installPerceptionListeners>[1]);
    const target = {
      closest: (sel: string) =>
        sel === "[data-lyra-scroll]"
          ? { getAttribute: () => "data_explorer" }
          : null,
    };
    handlers["scroll"]({ target } as unknown);
    const recent = bus.recent(10_000, now + 5000);
    const ev = recent.find((e) => e.kind === "scroll");
    expect(ev?.kind).toBe("scroll");
    expect((ev as { container?: string } | undefined)?.container).toBe("data_explorer");
  });

  it("hover on data-lyra-hover fires hover_dwell after 3000ms if not left", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const handlers: Record<string, (e: unknown) => void> = {};
    const doc = {
      addEventListener: (name: string, fn: (e: unknown) => void) => { handlers[name] = fn; },
      removeEventListener: () => {},
    };
    const win = { addEventListener: () => {}, removeEventListener: () => {} };
    installPerceptionListeners(bus, { win, doc, now: () => Date.now() } as Parameters<typeof installPerceptionListeners>[1]);

    const enterTarget = {
      closest: (sel: string) =>
        sel === "[data-lyra-hover]"
          ? { getAttribute: () => "album_cover" }
          : null,
    };
    handlers["mouseover"]({ target: enterTarget });
    vi.advanceTimersByTime(2999);
    expect(bus.recent(10_000).find((e) => e.kind === "hover_dwell")).toBeUndefined();
    vi.advanceTimersByTime(2);
    const hover = bus.recent(10_000).find((e) => e.kind === "hover_dwell") as { kind: string; target: string } | undefined;
    expect(hover?.kind).toBe("hover_dwell");
    expect(hover?.target).toBe("album_cover");
    vi.useRealTimers();
  });

  it("focus_no_interaction fires after 3min focused with no mouse/key, re-arms after interaction", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    let currentTime = 0;
    const winHandlers: Record<string, (e?: unknown) => void> = {};
    const win = {
      addEventListener: (name: string, fn: (e?: unknown) => void) => { winHandlers[name] = fn; },
      removeEventListener: () => {},
    };
    const doc = { addEventListener: () => {}, removeEventListener: () => {} };
    installPerceptionListeners(bus, { win, doc, now: () => currentTime } as Parameters<typeof installPerceptionListeners>[1]);

    winHandlers["focus"]?.();
    currentTime = 181_000;
    vi.advanceTimersByTime(30_000); // trigger poll interval
    let evs = bus.recent(300_000, currentTime).filter((e) => e.kind === "focus_no_interaction");
    expect(evs.length).toBe(1);

    // idle poll again should NOT re-fire without new interaction
    currentTime = 210_000;
    vi.advanceTimersByTime(30_000);
    evs = bus.recent(300_000, currentTime).filter((e) => e.kind === "focus_no_interaction");
    expect(evs.length).toBe(1);

    // new mouse/key interaction re-arms
    winHandlers["mousemove"]?.();
    currentTime = 500_000;
    vi.advanceTimersByTime(30_000);
    evs = bus.recent(600_000, currentTime).filter((e) => e.kind === "focus_no_interaction");
    expect(evs.length).toBe(2);
    vi.useRealTimers();
  });
});
