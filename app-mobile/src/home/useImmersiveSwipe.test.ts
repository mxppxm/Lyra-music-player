import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useImmersiveSwipe } from "./useImmersiveSwipe";

describe("useImmersiveSwipe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("snapToCenter resets offset and pending flags", () => {
    const onCommit = vi.fn(async () => {});
    const onOffsetChange = vi.fn();
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: false,
        canGoPrevious: true,
        stride: 328,
        onCommit,
        onOffsetChange,
      }),
    );

    act(() => {
      result.current.snapToCenter();
    });
    expect(onOffsetChange).toHaveBeenLastCalledWith(0, "reset");
    expect(result.current.pending).toBe(false);
    expect(result.current.settling).toBe(false);
    expect(result.current.dragging).toBe(false);
    expect(result.current.direction).toBeNull();
  });

  it("resetSlide is safe when idle", () => {
    const onOffsetChange = vi.fn();
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: true,
        canGoPrevious: false,
        stride: 328,
        onCommit: vi.fn(),
        onOffsetChange,
      }),
    );
    act(() => {
      result.current.resetSlide();
    });
    expect(onOffsetChange).toHaveBeenLastCalledWith(0, "reset");
  });

  it("coalesces pointer moves into one offset write per animation frame", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const onOffsetChange = vi.fn();
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: false,
        canGoPrevious: true,
        stride: 328,
        onCommit: vi.fn(),
        onOffsetChange,
      }),
    );

    act(() => {
      result.current.onPointerDown({
        button: 0,
        clientX: 200,
        clientY: 100,
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });
    onOffsetChange.mockClear();

    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 180,
          clientY: 100,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 150,
          clientY: 100,
        }),
      );
    });

    expect(onOffsetChange).not.toHaveBeenCalled();
    act(() => {
      frame?.(performance.now());
    });
    expect(onOffsetChange).toHaveBeenCalledOnce();
    expect(onOffsetChange).toHaveBeenCalledWith(-50, "drag");
    expect("offsetX" in result.current).toBe(false);
  });

  it("commits navigation immediately on release past the threshold", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const onCommit = vi.fn();
    const onOffsetChange = vi.fn();
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: false,
        canGoPrevious: true,
        stride: 328,
        onCommit,
        onOffsetChange,
      }),
    );

    act(() => {
      result.current.onPointerDown({
        button: 0,
        clientX: 200,
        clientY: 100,
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 80,
          clientY: 100,
        }),
      );
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("next");
    expect(onOffsetChange).toHaveBeenLastCalledWith(-328, "settle");
    expect(result.current.direction).toBe("next");
  });

  it("keeps the selected page centered while async navigation is unresolved", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const onOffsetChange = vi.fn();
    const onCommit = vi.fn(
      () => new Promise<void>(() => {}),
    );
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: false,
        canGoPrevious: false,
        stride: 328,
        onCommit,
        onOffsetChange,
      }),
    );

    act(() => {
      result.current.onPointerDown({
        button: 0,
        clientX: 200,
        clientY: 100,
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 80,
          clientY: 100,
        }),
      );
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      vi.advanceTimersByTime(3_000);
    });

    expect(result.current.pending).toBe(true);
    expect(onOffsetChange).not.toHaveBeenLastCalledWith(0, "reset");
  });

  it("ignores move and release events from another pointer", () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: false,
        canGoPrevious: true,
        stride: 328,
        onCommit,
        onOffsetChange: vi.fn(),
      }),
    );
    const pointerEvent = (
      type: string,
      pointerId: number,
      clientX = 0,
      clientY = 100,
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX,
        clientY,
      });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      return event;
    };

    act(() => {
      result.current.onPointerDown({
        button: 0,
        clientX: 200,
        clientY: 100,
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
      window.dispatchEvent(pointerEvent("pointermove", 2, 20));
      window.dispatchEvent(pointerEvent("pointerup", 2, 20));
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.dragging).toBe(true);

    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", 1, 20));
      window.dispatchEvent(pointerEvent("pointerup", 1, 20));
    });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("next");
  });

  it("reports whether pointerdown actually started a gesture", () => {
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: false,
        canGoPrevious: true,
        stride: 328,
        onCommit: vi.fn(),
        onOffsetChange: vi.fn(),
      }),
    );
    const target = {
      setPointerCapture: vi.fn(),
      addEventListener: vi.fn(),
    };

    let rejected: boolean | undefined;
    let accepted: boolean | undefined;
    let secondPointer: boolean | undefined;
    act(() => {
      rejected = result.current.onPointerDown({
        button: 1,
        pointerId: 1,
        currentTarget: target,
      } as unknown as React.PointerEvent);
      accepted = result.current.onPointerDown({
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: target,
      } as unknown as React.PointerEvent);
      secondPointer = result.current.onPointerDown({
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 2,
        preventDefault: vi.fn(),
        currentTarget: target,
      } as unknown as React.PointerEvent);
    });

    expect(rejected).toBe(false);
    expect(accepted).toBe(true);
    expect(secondPointer).toBe(false);
  });

  it("never commits a cancelled pointer gesture", () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: false,
        canGoPrevious: true,
        stride: 328,
        onCommit,
        onOffsetChange: vi.fn(),
      }),
    );
    const pointerEvent = (type: string, clientX: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX,
        clientY: 100,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event;
    };

    act(() => {
      result.current.onPointerDown({
        button: 0,
        clientX: 200,
        clientY: 100,
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: document.createElement("div"),
      } as unknown as React.PointerEvent);
      window.dispatchEvent(pointerEvent("pointermove", 20));
      window.dispatchEvent(pointerEvent("pointercancel", 20));
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("freezes direction gates for the lifetime of a gesture", () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ lockNext }) =>
        useImmersiveSwipe({
          enabled: true,
          lockNext,
          canGoPrevious: true,
          stride: 328,
          onCommit,
          onOffsetChange: vi.fn(),
        }),
      { initialProps: { lockNext: true } },
    );

    act(() => {
      result.current.onPointerDown({
        button: 0,
        clientX: 200,
        clientY: 100,
        pointerId: 1,
        preventDefault: vi.fn(),
        currentTarget: document.createElement("div"),
      } as unknown as React.PointerEvent);
    });
    rerender({ lockNext: false });
    act(() => {
      const move = new MouseEvent("pointermove", {
        bubbles: true,
        clientX: -300,
        clientY: 100,
      });
      const up = new MouseEvent("pointerup", { bubbles: true });
      Object.defineProperty(move, "pointerId", { value: 1 });
      Object.defineProperty(up, "pointerId", { value: 1 });
      window.dispatchEvent(move);
      window.dispatchEvent(up);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("releases pointer capture when reset externally", () => {
    const releasePointerCapture = vi.fn();
    const target = document.createElement("div");
    target.releasePointerCapture = releasePointerCapture;
    target.setPointerCapture = vi.fn();
    const { result } = renderHook(() =>
      useImmersiveSwipe({
        enabled: true,
        lockNext: false,
        canGoPrevious: true,
        stride: 328,
        onCommit: vi.fn(),
        onOffsetChange: vi.fn(),
      }),
    );

    act(() => {
      result.current.onPointerDown({
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 7,
        preventDefault: vi.fn(),
        currentTarget: target,
      } as unknown as React.PointerEvent);
      result.current.resetSlide();
    });

    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });
});
