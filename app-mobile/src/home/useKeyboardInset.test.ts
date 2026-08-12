import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardInset } from "./useKeyboardInset";

describe("useKeyboardInset", () => {
  const originalVisualViewport = window.visualViewport;
  let listeners: Record<string, Array<() => void>>;
  let vv: { height: number; offsetTop: number };

  beforeEach(() => {
    listeners = { resize: [], scroll: [] };
    vv = { height: 800, offsetTop: 0 };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        get height() {
          return vv.height;
        },
        get offsetTop() {
          return vv.offsetTop;
        },
        addEventListener: (type: string, fn: () => void) => {
          listeners[type]?.push(fn);
        },
        removeEventListener: (type: string, fn: () => void) => {
          listeners[type] = (listeners[type] ?? []).filter((x) => x !== fn);
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVisualViewport,
    });
    document.documentElement.style.removeProperty("--lyra-keyboard-inset");
  });

  it("snapshots baseline at focus and lifts when the viewport shrinks", () => {
    const { result } = renderHook(() =>
      useKeyboardInset({ active: true }),
    );
    expect(result.current.open).toBe(false);
    expect(
      document.documentElement.style.getPropertyValue("--lyra-keyboard-inset"),
    ).toBe("0px");

    act(() => {
      vv.height = 500;
      for (const fn of listeners.resize) fn();
    });

    expect(
      document.documentElement.style.getPropertyValue("--lyra-keyboard-inset"),
    ).toBe("300px");
    expect(result.current.open).toBe(true);
    expect(result.current.inset).toBe(300);
  });

  it("clears when inactive", () => {
    const { rerender, result } = renderHook(
      ({ active }) => useKeyboardInset({ active }),
      { initialProps: { active: true } },
    );
    act(() => {
      vv.height = 500;
      for (const fn of listeners.resize) fn();
    });
    expect(result.current.open).toBe(true);

    act(() => {
      rerender({ active: false });
    });
    expect(result.current.open).toBe(false);
    expect(
      document.documentElement.style.getPropertyValue("--lyra-keyboard-inset"),
    ).toBe("0px");
  });
});
