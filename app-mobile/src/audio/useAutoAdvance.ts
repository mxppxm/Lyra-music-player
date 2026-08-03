import { useEffect, useRef } from "react";
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
 */
export function useAutoAdvance(
  orchestrator: Orchestrator,
  onFailed?: (message: string) => void,
  playback?: AutoAdvancePlayback,
) {
  const advancedForSongRef = useRef<string | null>(null);

  useEffect(() => {
    let chain: Promise<void> | null = null;

    const advance = (): Promise<void> => {
      if (chain) return chain;
      chain = (async () => {
        try {
          await orchestrator.onSongComplete();
        } finally {
          try {
            await LyraAudio.acknowledgeEnded();
          } catch {
            /* web preview / tests */
          }
          chain = null;
        }
      })();
      return chain;
    };

    const syncNativeAdvance = (songId: string): Promise<void> => {
      if (chain) return chain;
      chain = (async () => {
        try {
          await orchestrator.onNativeAutoAdvanced(songId);
        } finally {
          chain = null;
        }
      })();
      return chain;
    };

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
  }, [orchestrator]);

  useEffect(() => {
    if (!playback?.songId || !playback.playing || playback.paused) return;
    if (playback.progress < 0.98) return;
    if (advancedForSongRef.current === playback.songId) return;
    advancedForSongRef.current = playback.songId;
    void orchestrator.onSongComplete().finally(() => {
      void LyraAudio.acknowledgeEnded().catch(() => {});
    });
  }, [orchestrator, playback?.songId, playback?.playing, playback?.paused, playback?.progress]);

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
