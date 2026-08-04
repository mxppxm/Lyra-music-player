import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMountTransition } from "./useMountTransition";

describe("useMountTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render when closed initially", () => {
    const { result } = renderHook(() => useMountTransition(false, { disabled: false }));
    expect(result.current.render).toBe(false);
    expect(result.current.phase).toBe("idle");
  });

  it("enters when opened, then settles to open after enterMs", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useMountTransition(open, { disabled: false, enterMs: 420, exitMs: 300 }),
      { initialProps: { open: false } },
    );
    rerender({ open: true });
    expect(result.current.phase).toBe("entering");
    expect(result.current.render).toBe(true);
    act(() => vi.advanceTimersByTime(420));
    expect(result.current.phase).toBe("open");
    expect(result.current.render).toBe(true);
  });

  it("leaves when closed, then unmounts after exitMs", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useMountTransition(open, { disabled: false, enterMs: 420, exitMs: 300 }),
      { initialProps: { open: true } },
    );
    act(() => vi.advanceTimersByTime(420));
    rerender({ open: false });
    expect(result.current.phase).toBe("leaving");
    expect(result.current.render).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.phase).toBe("idle");
    expect(result.current.render).toBe(false);
  });

  it("reopens from leaving without unmounting", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useMountTransition(open, { disabled: false, enterMs: 420, exitMs: 300 }),
      { initialProps: { open: true } },
    );
    act(() => vi.advanceTimersByTime(420));
    rerender({ open: false });
    rerender({ open: true });
    expect(result.current.render).toBe(true);
    expect(result.current.phase).toBe("entering");
    act(() => vi.advanceTimersByTime(420));
    expect(result.current.phase).toBe("open");
  });

  it("disabled mode mounts/unmounts instantly", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useMountTransition(open, { disabled: true }),
      { initialProps: { open: false } },
    );
    expect(result.current.render).toBe(false);
    rerender({ open: true });
    expect(result.current.phase).toBe("open");
    expect(result.current.render).toBe(true);
    rerender({ open: false });
    expect(result.current.render).toBe(false);
  });
});
