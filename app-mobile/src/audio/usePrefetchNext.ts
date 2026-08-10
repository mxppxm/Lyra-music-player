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
  const rerunRef = useRef(false);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const runRefill = async (reason: string) => {
    if (inFlightRef.current) {
      rerunRef.current = true;
      return;
    }
    do {
      rerunRef.current = false;
      const current = playbackRef.current;
      if (!current.songId || !current.playing || current.paused) return;
      inFlightRef.current = true;
      try {
        await refillPlaybackQueue(orchestrator);
        refillForSongRef.current = current.songId;
        console.log(`[lyra-ios] prefetch refill (${reason})`);
      } catch (e) {
        console.warn("[lyra-ios] prefetch refill failed:", e);
      } finally {
        inFlightRef.current = false;
      }
    } while (rerunRef.current);
  };

  // New track → reconcile and top up immediately. Keep the JS forward plan:
  // manual previous/next may clear native AVQueuePlayer, but known songs and
  // resolved URLs must survive so refill can append them again in order.
  useEffect(() => {
    if (!playback.songId) {
      refillForSongRef.current = null;
      return;
    }
    if (!playback.playing || playback.paused) return;
    if (refillForSongRef.current === playback.songId) return;

    void runRefill("song-start");
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
