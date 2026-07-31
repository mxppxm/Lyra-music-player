import { useEffect } from "react";
import { LyraAudio } from "@lyra/platform-ios";
import type { Orchestrator } from "@lyra/core";
import type { OrchestratorState } from "@lyra/core/turn/Orchestrator.ts";
import { songDisplayTitle, songDisplayArtist } from "@lyra/core/library/display";

/**
 * Pushes the current track to the iOS lock screen / Dynamic Island and
 * routes lock-screen remote commands back into the Orchestrator.
 */
export function useNowPlaying(
  orchestrator: Orchestrator,
  state: OrchestratorState,
) {
  const songId =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? state.song.id
      : null;

  useEffect(() => {
    if (state.kind !== "playing" && state.kind !== "proactive-pending") return;
    void LyraAudio.setNowPlaying({
      title: songDisplayTitle(state.song),
      artist: songDisplayArtist(state.song),
      durationMs: state.song.duration_ms ?? 0,
    }).catch((e) => console.warn("[lyra-ios] setNowPlaying:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  useEffect(() => {
    let remove: (() => void) | undefined;
    void LyraAudio.addListener("remoteCommand", ({ command }) => {
      const s = orchestrator.getState();
      if (command === "next") {
        if (s.kind === "playing") void orchestrator.onSkip();
        return;
      }
      if (s.kind !== "playing") return;
      if (command === "play" || (command === "toggle" && s.paused)) {
        void orchestrator.onResume();
      } else if (command === "pause" || command === "toggle") {
        void orchestrator.onPause();
      }
    }).then((r) => {
      remove = r.remove;
    });
    return () => remove?.();
  }, [orchestrator]);
}
