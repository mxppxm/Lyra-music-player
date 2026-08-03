import { useEffect, useRef } from "react";
import { LyraAudio } from "@lyra/platform-ios";
import type { Orchestrator } from "@lyra/core";
import type { AutoAdvancePlayback } from "./useAutoAdvance";
import { refillPlaybackQueue } from "./refillPlaybackQueue";

/**
 * While a track plays, continuously pick upcoming songs and hand them to
 * native AVPlayer. Native plays through the queue in background — JS only
 * selects and resolves URLs, it does not start playback until foreground.
 */
export function usePrefetchNext(
  orchestrator: Orchestrator,
  playback: AutoAdvancePlayback,
) {
  const refillForSongRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const runRefill = async (reason: string) => {
    if (inFlightRef.current) return;
    if (!playback.songId || !playback.playing || playback.paused) return;
    inFlightRef.current = true;
    try {
      await refillPlaybackQueue(orchestrator);
      refillForSongRef.current = playback.songId;
      console.log(`[lyra-ios] prefetch refill (${reason})`);
    } catch (e) {
      console.warn("[lyra-ios] prefetch refill failed:", e);
    } finally {
      inFlightRef.current = false;
    }
  };

  // New track → reset queue plan and fill immediately (no progress gate).
  useEffect(() => {
    if (!playback.songId) {
      refillForSongRef.current = null;
      return;
    }
    if (!playback.playing || playback.paused) return;
    if (refillForSongRef.current === playback.songId) return;

    void (async () => {
      await LyraAudio.clearNextTrack().catch(() => {});
      orchestrator.clearPrefetchedNext();
      await runRefill("song-start");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator, playback.songId, playback.playing, playback.paused]);

  // Native asks for more while playing / entering background.
  useEffect(() => {
    let remove: (() => void) | undefined;
    void LyraAudio.addListener("refillQueue", () => {
      void runRefill("native-refill");
    }).then((r) => {
      remove = r.remove;
    });
    return () => remove?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator, playback.songId, playback.playing, playback.paused]);

  // After native auto-advance, top up again if JS is awake.
  useEffect(() => {
    let remove: (() => void) | undefined;
    void LyraAudio.addListener("nativeAdvanced", () => {
      refillForSongRef.current = null;
      void runRefill("native-advanced");
    }).then((r) => {
      remove = r.remove;
    });
    return () => remove?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator, playback.songId, playback.playing, playback.paused]);

  // Periodic top-up while playing (covers long foreground sessions).
  useEffect(() => {
    if (!playback.songId || !playback.playing || playback.paused) return;
    const timer = setInterval(() => {
      void runRefill("interval");
    }, 45_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator, playback.songId, playback.playing, playback.paused]);
}
