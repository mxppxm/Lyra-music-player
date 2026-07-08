// perception/useInputDwellBus.ts — state machine for "typed then abandoned".
//
// State machine:
//   IDLE ──value grows from empty──▶ TYPING (start 10s dwell timer, track chars)
//   TYPING ──value changes──▶ TYPING (reset timer, refresh chars)
//   TYPING ──timer expires──▶ DWELLING
//   DWELLING ──value grows──▶ TYPING
//   DWELLING ──value cleared (== "")──▶ emit → IDLE
//   TYPING ──notifySubmit()──▶ IDLE (no emit)

import { useEffect, useRef, useCallback } from "react";
import type { EventBus } from "./events";

const DWELL_MS = 10_000;

type State = "IDLE" | "TYPING" | "DWELLING";

export function useInputDwellBus(bus: EventBus, value: string, now?: () => number) {
  const nowRef = useRef(now ?? Date.now);
  nowRef.current = now ?? Date.now;
  const stateRef = useRef<State>("IDLE");
  const charsRef = useRef(0);
  const dwellStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const armDwellTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      stateRef.current = "DWELLING";
      dwellStartRef.current = nowRef.current();
    }, DWELL_MS);
  }, []);

  useEffect(() => {
    const len = value.length;
    const state = stateRef.current;

    if (state === "IDLE") {
      if (len > 0) {
        stateRef.current = "TYPING";
        charsRef.current = len;
        armDwellTimer();
      }
      return;
    }

    if (state === "TYPING") {
      if (len === 0) {
        // user cleared before timer expired — treat as IDLE, no emit
        clearTimer();
        stateRef.current = "IDLE";
        return;
      }
      // still typing / editing — refresh timer + chars
      charsRef.current = len;
      armDwellTimer();
      return;
    }

    // state === "DWELLING"
    if (len === 0) {
      const emitAt = nowRef.current();
      bus.emit({
        kind: "input_dwell_without_submit",
        at: emitAt,
        charsTyped: charsRef.current,
        dwellMs: emitAt - dwellStartRef.current,
      });
      stateRef.current = "IDLE";
      return;
    }
    // typing resumed — back to TYPING and re-arm
    stateRef.current = "TYPING";
    charsRef.current = len;
    armDwellTimer();
  }, [value, bus, armDwellTimer]);

  useEffect(() => () => clearTimer(), []);

  const notifySubmit = useCallback(() => {
    clearTimer();
    stateRef.current = "IDLE";
    charsRef.current = 0;
  }, []);

  return { notifySubmit };
}
