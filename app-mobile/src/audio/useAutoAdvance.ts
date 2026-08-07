import { useCallback, useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { getLyraPlatform } from "@lyra/platform";
import { LyraAudio } from "@lyra/platform-ios";
import type { Orchestrator } from "@lyra/core";

export type AutoAdvancePlayback = {
  songId: string | null;
  playing: boolean;
  paused: boolean;
  /** 0–1 from progress bar; JS fallback when native end event is missing. */
  progress: number;
  elapsedMs?: number;
  durationMs?: number;
};

/**
 * Natural completion → orchestrator.onSongComplete() → next song.
 * Native queue path emits `nativeAdvanced` / drains unsynced events on resume.
 *
 * ALL advance paths (ended event, nativeAdvanced, JS progress fallback)
 * share ONE serial queue so play events can never interleave. Before this, a
 * nativeAdvanced arriving while onSongComplete was mid-flight was silently
 * DROPPED (`if (chain) return chain`), so the Orchestrator kept showing
 * "thinking…" while the native queue had already started the next track; and
 * the ended event + progress fallback could both run onSongComplete, calling
 * playFile twice and visibly swapping the song mid-play.
 */
export function useAutoAdvance(
  orchestrator: Orchestrator,
  onFailed?: (message: string) => void,
  playback?: AutoAdvancePlayback,
) {
  const advancedForSongRef = useRef<string | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const advancingRef = useRef(false);

  const enqueue = useCallback((fn: () => Promise<void>): Promise<void> => {
    const run = queueRef.current.then(fn, fn);
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const advance = useCallback((): Promise<void> => {
    // Join the in-flight completion instead of queuing a duplicate
    // (ended event + progress fallback fire for the same song).
    if (advancingRef.current) return queueRef.current;
    advancingRef.current = true;
    return enqueue(async () => {
      try {
        await orchestrator.onSongComplete();
      } finally {
        try {
          await LyraAudio.acknowledgeEnded();
        } catch {
          /* web preview / tests */
        }
        advancingRef.current = false;
      }
    });
  }, [enqueue, orchestrator]);

  const syncNativeAdvance = useCallback(
    (songId: string): Promise<void> =>
      enqueue(async () => {
        await orchestrator.onNativeAutoAdvanced(songId);
      }),
    [enqueue, orchestrator],
  );

  useEffect(() => {
    const drainUnsyncedNative = async () => {
      try {
        const { events } = await LyraAudio.drainNativeAdvanced();
        for (const event of events) {
          const songId = event.songId;
          if (typeof songId === "string" && songId.length > 0) {
            await syncNativeAdvance(songId);
          }
        }
      } catch {
        /* web preview / tests */
      }
    };

    const offComplete = getLyraPlatform().onComplete(() => {
      void advance();
    });

    let removeNative: (() => void) | undefined;
    void LyraAudio.addListener("nativeAdvanced", ({ songId }) => {
      void syncNativeAdvance(songId);
    }).then((r) => {
      removeNative = r.remove;
    });

    let removeApp: (() => void) | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      void drainUnsyncedNative().then(() =>
        LyraAudio.getPendingEnded().then(({ playbackId }) => {
          if (playbackId != null) void advance();
        }),
      );
    }).then((r) => {
      removeApp = r.remove;
    });

    void drainUnsyncedNative().then(() =>
      LyraAudio.getPendingEnded().then(({ playbackId }) => {
        if (playbackId != null) void advance();
      }),
    );

    return () => {
      offComplete();
      removeNative?.();
      removeApp?.();
    };
  }, [orchestrator, advance, syncNativeAdvance]);

  useEffect(() => {
    if (!playback?.songId || !playback.playing || playback.paused) return;
    if (playback.progress < 0.98) return;
    if (advancedForSongRef.current === playback.songId) return;
    advancedForSongRef.current = playback.songId;
    // Only the *no-queue* case may fall back to JS picking the next song.
    // When native already holds prefetched tracks it hand-offs seamlessly on
    // its own (nativeAdvanced). The advance() call still goes through the
    // shared queue, and Orchestrator drops a stale completion when a
    // nativeAdvanced already moved the state machine on — so we can never
    // pick a second song and stomp the one that's audibly playing.
    void LyraAudio.getPlaybackQueueInfo()
      .then(({ count }) => {
        if (count > 0) return;
        void advance();
      })
      .catch(() => {});
  }, [orchestrator, advance, playback?.songId, playback?.playing, playback?.paused, playback?.progress]);

  useEffect(() => {
    if (playback?.songId) return;
    advancedForSongRef.current = null;
  }, [playback?.songId]);

  useEffect(() => {
    if (!onFailed) return;
    let remove: (() => void) | undefined;
    void LyraAudio.addListener("failed", ({ message }) => {
      console.warn("[lyra-ios] playback failed:", message);
      onFailed(message);
    }).then((r) => {
      remove = r.remove;
    });
    return () => remove?.();
  }, [orchestrator, onFailed]);
}
