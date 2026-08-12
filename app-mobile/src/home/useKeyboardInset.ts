import { useEffect, useState, type RefObject } from "react";

const KEYBOARD_INSET_VAR = "--lyra-keyboard-inset";
/** Treat the soft keyboard as open once the viewport has shrunk this much. */
const OPEN_THRESHOLD_PX = 80;

export type UseKeyboardInsetOptions = {
  /** Only track while the input is focused — clears inset on blur. */
  active: boolean;
};

export type KeyboardInsetState = {
  /** Soft keyboard is up (viewport shrunk past the threshold). */
  open: boolean;
  /** Pixels to lift the dock. */
  inset: number;
};

/**
 * Capacitor uses contentInset:never. Snapshot the visible height at focus,
 * then lift by how much visualViewport.height shrinks afterward — this stays
 * correct even when window.innerHeight also shrinks on iOS.
 */
export function useKeyboardInset({
  active,
}: UseKeyboardInsetOptions): KeyboardInsetState {
  const [state, setState] = useState<KeyboardInsetState>({
    open: false,
    inset: 0,
  });

  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      root.style.setProperty(KEYBOARD_INSET_VAR, "0px");
      setState({ open: false, inset: 0 });
    };

    const vv = window.visualViewport;
    if (!active) {
      clear();
      return;
    }
    if (!vv) {
      clear();
      return;
    }

    // Capture pre-keyboard height in the same turn as focus.
    let baseline = vv.height;

    const sync = () => {
      // If the viewport grew (keyboard dismissed mid-focus), refresh baseline.
      if (vv.height > baseline + 2) baseline = vv.height;
      const inset = Math.max(0, Math.round(baseline - vv.height));
      root.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`);
      setState({ open: inset >= OPEN_THRESHOLD_PX, inset });
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    const raf = window.requestAnimationFrame(sync);
    const t1 = window.setTimeout(sync, 50);
    const t2 = window.setTimeout(sync, 120);
    const t3 = window.setTimeout(sync, 320);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
      clear();
    };
  }, [active]);

  return state;
}

// Kept for call-site typing convenience if an anchor is passed later.
export type UseKeyboardInsetAnchor = RefObject<HTMLElement | null>;
