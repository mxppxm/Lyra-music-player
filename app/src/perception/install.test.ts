import { describe, it, expect } from "vitest";
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
