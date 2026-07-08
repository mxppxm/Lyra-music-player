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
});
