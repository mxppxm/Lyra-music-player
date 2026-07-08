import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { EventBus } from "./events";
import { useInputDwellBus } from "./useInputDwellBus";

describe("useInputDwellBus", () => {
  it("submit path emits no input_dwell_without_submit", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const { result, rerender } = renderHook(({ v }) => useInputDwellBus(bus, v), {
      initialProps: { v: "" },
    });
    rerender({ v: "hi" });
    vi.advanceTimersByTime(12000);
    act(() => result.current.notifySubmit());
    rerender({ v: "" });
    expect(bus.recent(60_000).filter((e) => e.kind === "input_dwell_without_submit").length).toBe(0);
    vi.useRealTimers();
  });

  it("type then dwell 10s+ then clear emits input_dwell_without_submit", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const { rerender } = renderHook(({ v }) => useInputDwellBus(bus, v), {
      initialProps: { v: "" },
    });
    rerender({ v: "half thought" });
    vi.advanceTimersByTime(10_001); // exceed 10s dwell threshold
    rerender({ v: "" }); // cleared without submit
    const emitted = bus.recent(60_000).filter((e) => e.kind === "input_dwell_without_submit");
    expect(emitted.length).toBe(1);
    expect((emitted[0] as any).charsTyped).toBe(12);
    vi.useRealTimers();
  });

  it("type → dwell 10s+ → keep typing does NOT emit; subsequent clear also does not (state returned to TYPING)", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const { rerender } = renderHook(({ v }) => useInputDwellBus(bus, v), {
      initialProps: { v: "" },
    });
    rerender({ v: "hesitating" });
    vi.advanceTimersByTime(10_001);
    rerender({ v: "hesitating more" });
    rerender({ v: "" });
    expect(bus.recent(60_000).filter((e) => e.kind === "input_dwell_without_submit").length).toBe(0);
    vi.useRealTimers();
  });

  it("DWELLING→TYPING→DWELLING→clear: exactly 1 emit with charsTyped from 2nd round and dwellMs from 2nd dwell entry", () => {
    vi.useFakeTimers();
    // Stable clock object — avoids useCallback invalidation on every rerender.
    const clock = { t: 0 };
    const stableNow = () => clock.t;
    const bus = new EventBus();
    const { rerender } = renderHook(
      ({ v }) => useInputDwellBus(bus, v, stableNow),
      { initialProps: { v: "" } },
    );
    // Round 1: type → wait 10s+ → first DWELLING entry
    rerender({ v: "hesitating" });
    clock.t += 10_001;
    vi.advanceTimersByTime(10_001); // timer fires → DWELLING, dwellStartRef = 10001
    // Resume typing → DWELLING→TYPING, new 10s dwell timer armed
    rerender({ v: "hesitating more" });
    // Round 2: wait 10s+ → second DWELLING entry (dwellStartRef overwritten to 20002)
    clock.t += 10_001;
    vi.advanceTimersByTime(10_001); // timer fires → DWELLING again, dwellStartRef = 20002
    // Clear → emits once; measurements anchored at 2nd dwell entry
    rerender({ v: "" });
    // Pass clock.t as the `now` anchor so recent() uses the same fake timeline.
    const emitted = bus.recent(60_000, clock.t).filter((e) => e.kind === "input_dwell_without_submit");
    expect(emitted.length).toBe(1);
    const ev = emitted[0] as { charsTyped: number; dwellMs: number };
    expect(ev.charsTyped).toBe(15); // "hesitating more".length === 15
    // dwellMs measured from 2nd dwell start (20002) to clear (20002) → 0ms,
    // not ~20000ms — confirms dwellStartRef is overwritten on each DWELLING entry.
    expect(ev.dwellMs).toBeLessThan(10_001);
    vi.useRealTimers();
  });
});
