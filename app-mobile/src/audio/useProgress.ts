import { useEffect, useState, useRef } from "react";
import { getLyraPlatform } from "@lyra/platform";

export interface ProgressState {
  elapsedMs: number;
  durationMs: number;
  /** 0–1 */
  progress: number;
}

const POLL_MS = 500;

/** Polls platform playback position every 500ms while playing. */
export function useProgress(playing: boolean): ProgressState | null {
  const [state, setState] = useState<ProgressState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) {
      setState(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const pos = await getLyraPlatform().getPosition();
        if (!pos) {
          setState(null);
          return;
        }
        const [elapsedMs, durationMs] = pos;
        const progress =
          durationMs > 0 ? Math.min(elapsedMs / durationMs, 1) : 0;
        setState({ elapsedMs, durationMs, progress });
      } catch {
        setState(null);
      }
    };

    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing]);

  return state;
}
