import { useEffect, useState, useRef } from "react";
import { getPlaybackPosition } from "./player";

export interface ProgressState {
  elapsedMs: number;
  durationMs: number;
  /** 0–1 */
  progress: number;
}

const POLL_MS = 500;

/**
 * Polls `audio_get_position` every 500ms while a song is playing.
 * Returns `null` when idle (no song) or at 100% (song finished).
 */
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
        const pos = await getPlaybackPosition();
        if (!pos) {
          setState(null);
          return;
        }
        const [elapsedMs, durationMs] = pos;
        const progress = durationMs > 0
          ? Math.min(elapsedMs / durationMs, 1)
          : 0;
        // Stop polling once the song is done
        if (progress >= 1) {
          setState({ elapsedMs, durationMs, progress: 1 });
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return;
        }
        setState({ elapsedMs, durationMs, progress });
      } catch {
        // ignore — likely Tauri not ready
      }
    };

    // Prime once
    poll();
    timerRef.current = setInterval(poll, POLL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing]);

  return state;
}
