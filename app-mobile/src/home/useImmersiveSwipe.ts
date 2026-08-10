import { useCallback, useEffect, useRef, useState } from "react";

export const SWIPE_COMMIT_RATIO = 0.25;
export const SWIPE_AXIS_LOCK_PX = 10;
export const SWIPE_CLICK_SUPPRESS_PX = 10;
export const SWIPE_SLIDE_MS = 320;

export type SwipeDirection = "next" | "previous";
export type SwipeOffsetPhase = "drag" | "settle" | "reset";

export type UseImmersiveSwipeOptions = {
  enabled: boolean;
  /** No next neighbor ready — rubber-band left only. */
  lockNext: boolean;
  /** No previous neighbor — rubber-band right only. */
  canGoPrevious: boolean;
  /** Distance between cover slots (CD width + gap — not full screen). */
  stride: number;
  /**
   * Fired as soon as release commits to the neighbor slot (±stride).
   * The parent calls `snapToCenter` after both settling and song-id handoff.
   */
  onCommit: (direction: SwipeDirection) => void | Promise<void>;
  /** Imperative track update; drag writes are coalesced to one per frame. */
  onOffsetChange: (offset: number, phase: SwipeOffsetPhase) => void;
};

export type UseImmersiveSwipeResult = {
  dragging: boolean;
  settling: boolean;
  /** True while waiting for navigation after a committed swipe. */
  pending: boolean;
  /** Neighbor selected by the active committed swipe. */
  direction: SwipeDirection | null;
  onPointerDown: (e: React.PointerEvent) => boolean;
  shouldSuppressClick: () => boolean;
  /** Instantly reset rail to center after data swap (useLayoutEffect). */
  snapToCenter: () => void;
  resetSlide: () => void;
};

/**
 * Continuous cover-rail swipe: previous | current | next stay mounted;
 * offset shifts only the CD strip (background stays put).
 */
export function useImmersiveSwipe(
  options: UseImmersiveSwipeOptions,
): UseImmersiveSwipeResult {
  const {
    enabled,
    lockNext,
    canGoPrevious,
    stride,
    onCommit,
    onOffsetChange,
  } = options;

  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [pending, setPending] = useState(false);
  const [direction, setDirection] = useState<SwipeDirection | null>(null);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const offsetRef = useRef(0);
  const axisLockedRef = useRef<"h" | "v" | null>(null);
  const suppressClickRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const captureTargetRef = useRef<HTMLElement | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const offsetFrameRef = useRef<number | null>(null);
  const queuedOffsetRef = useRef(0);

  const optsRef = useRef({
    enabled,
    lockNext,
    canGoPrevious,
    stride,
    onCommit,
    onOffsetChange,
  });
  optsRef.current = {
    enabled,
    lockNext,
    canGoPrevious,
    stride,
    onCommit,
    onOffsetChange,
  };

  const cancelOffsetFrame = useCallback(() => {
    if (offsetFrameRef.current == null) return;
    window.cancelAnimationFrame(offsetFrameRef.current);
    offsetFrameRef.current = null;
  }, []);

  const writeOffset = useCallback(
    (offset: number, phase: SwipeOffsetPhase) => {
      if (phase !== "drag") {
        cancelOffsetFrame();
        optsRef.current.onOffsetChange(offset, phase);
        return;
      }
      queuedOffsetRef.current = offset;
      if (offsetFrameRef.current != null) return;
      offsetFrameRef.current = window.requestAnimationFrame(() => {
        offsetFrameRef.current = null;
        optsRef.current.onOffsetChange(queuedOffsetRef.current, "drag");
      });
    },
    [cancelOffsetFrame],
  );

  const clearTimers = useCallback(() => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const snapToCenter = useCallback(() => {
    clearTimers();
    offsetRef.current = 0;
    writeOffset(0, "reset");
    setSettling(false);
    setDragging(false);
    setPending(false);
    setDirection(null);
    suppressClickRef.current = false;
    axisLockedRef.current = null;
    activePointerIdRef.current = null;
    captureTargetRef.current = null;
    busyRef.current = false;
  }, [clearTimers, writeOffset]);

  const resetSlide = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
    snapToCenter();
  }, [snapToCenter]);

  useEffect(
    () => () => {
      clearTimers();
      cancelOffsetFrame();
      detachRef.current?.();
    },
    [cancelOffsetFrame, clearTimers],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!optsRef.current.enabled) return false;
      if (e.button !== 0) return false;
      if (busyRef.current) return false;
      if (activePointerIdRef.current !== null) return false;

      detachRef.current?.();
      clearTimers();
      const gesture = {
        lockNext: optsRef.current.lockNext,
        canGoPrevious: optsRef.current.canGoPrevious,
        stride: optsRef.current.stride,
        onCommit: optsRef.current.onCommit,
      };

      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      offsetRef.current = 0;
      axisLockedRef.current = null;
      suppressClickRef.current = false;
      activePointerIdRef.current = e.pointerId;
      captureTargetRef.current = e.currentTarget as HTMLElement;
      writeOffset(0, "reset");
      setDragging(true);
      setSettling(false);
      setPending(false);
      setDirection(null);
      try {
        e.preventDefault();
      } catch {
        /* jsdom / non-cancelable */
      }
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (
          ev.pointerId != null &&
          ev.pointerId !== activePointerIdRef.current
        ) {
          return;
        }
        const dx = ev.clientX - startXRef.current;
        const dy = ev.clientY - startYRef.current;
        const {
          lockNext: lock,
          canGoPrevious: canPrev,
          stride: slot,
        } = gesture;

        if (axisLockedRef.current === null) {
          if (
            Math.abs(dx) < SWIPE_AXIS_LOCK_PX &&
            Math.abs(dy) < SWIPE_AXIS_LOCK_PX
          ) {
            return;
          }
          axisLockedRef.current = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
          if (axisLockedRef.current === "v") return;
        }
        if (axisLockedRef.current === "v") return;

        if (Math.abs(dx) >= SWIPE_CLICK_SUPPRESS_PX) {
          suppressClickRef.current = true;
        }

        let next = dx;
        if (dx < 0 && lock) next = dx * 0.22;
        if (dx > 0 && !canPrev) next = dx * 0.22;
        const max = slot * 1.05;
        if (next < -max) next = -max;
        if (next > max) next = max;

        offsetRef.current = next;
        writeOffset(next, "drag");
      };

      let active = true;
      const captureTarget = captureTargetRef.current;
      const pointerId = activePointerIdRef.current;
      const releaseCapture = () => {
        try {
          if (pointerId != null) {
            captureTarget?.releasePointerCapture?.(pointerId);
          }
        } catch {
          /* capture may already be released */
        }
      };
      const removeListeners = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        captureTarget?.removeEventListener?.(
          "lostpointercapture",
          onLostPointerCapture,
        );
      };
      const finish = (ev: PointerEvent, allowCommit: boolean) => {
        if (!active) return;
        if (ev.pointerId != null && ev.pointerId !== pointerId) {
          return;
        }
        active = false;
        removeListeners();
        releaseCapture();
        activePointerIdRef.current = null;
        captureTargetRef.current = null;
        detachRef.current = null;
        setDragging(false);

        const {
          lockNext: lock,
          canGoPrevious: canPrev,
          onCommit: commit,
          stride: slot,
        } = gesture;
        const dx = offsetRef.current;
        const threshold = slot * SWIPE_COMMIT_RATIO;
        const axis = axisLockedRef.current;
        axisLockedRef.current = null;
        if (!allowCommit) suppressClickRef.current = false;

        const bounceBack = () => {
          setSettling(true);
          offsetRef.current = 0;
          writeOffset(0, "settle");
          settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            setSettling(false);
            writeOffset(0, "reset");
          }, SWIPE_SLIDE_MS + 40);
        };

        const commitDir = (dir: SwipeDirection, target: number) => {
          busyRef.current = true;
          setSettling(true);
          setPending(true);
          setDirection(dir);
          offsetRef.current = target;
          writeOffset(target, "settle");
          void Promise.resolve(commit(dir)).catch((err) => {
            console.warn("[lyra-ios] swipe commit:", err);
          });
          settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            setSettling(false);
          }, SWIPE_SLIDE_MS);
        };

        if (allowCommit && axis === "h" && Math.abs(dx) >= threshold) {
          if (dx < 0 && !lock) {
            commitDir("next", -slot);
            return;
          }
          if (dx > 0 && canPrev) {
            commitDir("previous", slot);
            return;
          }
        }

        bounceBack();
      };
      function onPointerUp(ev: PointerEvent) {
        finish(ev, true);
      }
      function onPointerCancel(ev: PointerEvent) {
        finish(ev, false);
      }
      function onLostPointerCapture(ev: Event) {
        finish(ev as PointerEvent, false);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      captureTarget?.addEventListener?.(
        "lostpointercapture",
        onLostPointerCapture,
      );
      detachRef.current = () => {
        active = false;
        removeListeners();
        releaseCapture();
        activePointerIdRef.current = null;
        captureTargetRef.current = null;
      };
      return true;
    },
    [clearTimers, snapToCenter, writeOffset],
  );

  const shouldSuppressClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    dragging,
    settling,
    pending,
    direction,
    onPointerDown,
    shouldSuppressClick,
    snapToCenter,
    resetSlide,
  };
}
