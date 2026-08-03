import { useEffect } from "react";
import { getLyraPlatform } from "@lyra/platform";
import { LyraAudio } from "@lyra/platform-ios";
import type { Orchestrator } from "@lyra/core";

/**
 * Natural completion → orchestrator.onSongComplete() → next song.
 * Mirrors the desktop App.tsx wiring. Native load failures are surfaced via
 * onFailed so the UI can show *why* a track won't play.
 */
export function useAutoAdvance(
  orchestrator: Orchestrator,
  onFailed?: (message: string) => void,
) {
  useEffect(() => {
    return getLyraPlatform().onComplete(() => {
      void orchestrator.onSongComplete();
    });
  }, [orchestrator]);

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
