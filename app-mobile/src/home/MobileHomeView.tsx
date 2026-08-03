import { useEffect, useState } from "react";
import { AmbientBackground } from "./AmbientBackground";
import { CoverBackground, CoverArt } from "./CoverBackground";
import { SongInfo } from "./SongInfo";
import { SmallNote } from "./SmallNote";
import { InputBox } from "./InputBox";
import { PlayerControls } from "./PlayerControls";
import { ProgressBar, progressLabel } from "./ProgressBar";
import { useProgress } from "../audio/useProgress";
import { useNowPlaying } from "../audio/useNowPlaying";
import { useAutoAdvance } from "../audio/useAutoAdvance";
import { useTurn } from "../turn/useTurn";
import type { Orchestrator } from "@lyra/core";
import { songDisplayTitle, songDisplayArtist } from "@lyra/core/library/display";
import type { PAD } from "../lib/color";

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };

type MobileHomeViewProps = {
  orchestrator: Orchestrator;
};

export function MobileHomeView({ orchestrator }: MobileHomeViewProps) {
  const { state, submit } = useTurn(orchestrator);
  const playing = state.kind === "playing";
  const progress = useProgress(playing);
  useNowPlaying(orchestrator, state);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  useAutoAdvance(orchestrator, setPlaybackError);
  const [dockExpanded, setDockExpanded] = useState(false);

  const title: string =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? songDisplayTitle(state.song)
      : "";

  const artist: string =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? songDisplayArtist(state.song)
      : "";

  // Surface native playback failures in the note area — the only way to see
  // *why* a track won't play without attaching a debugger.
  const currentSongId =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? state.song.id
      : null;
  useEffect(() => {
    setPlaybackError(null);
  }, [currentSongId]);

  const noteText: string =
    playbackError !== null
      ? `这首歌没能放出来：${playbackError}`
      : state.kind === "idle"
        ? "Lyra 在等你说一句话"
        : state.kind === "thinking"
          ? "…"
          : state.kind === "playing"
            ? state.turn.agent_response.rationale
            : state.kind === "proactive-pending"
              ? state.rationale
              : state.kind === "error"
                ? state.message
                : "";

  const noteColor: string | undefined =
    playbackError !== null || state.kind === "error"
      ? "rgba(200,80,80,0.75)"
      : undefined;

  const handleTogglePlay = () => {
    if (state.kind !== "playing") return;
    if (state.paused) {
      void orchestrator.onResume();
    } else {
      void orchestrator.onPause();
    }
  };

  const handleSkip = () => {
    if (state.kind !== "playing") return;
    void orchestrator.onSkip();
  };

  const pad: PAD =
    state.kind === "playing" ? state.turn.current_emotion.pad : ZERO_PAD;

  const coverRaw =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? state.song.metadata?.cover
      : null;
  const coverUrl = typeof coverRaw === "string" ? coverRaw : null;

  const isSparseIdle = state.kind === "idle";

  if (isSparseIdle) {
    return (
      <AmbientBackground pad={pad}>
        <div className="lyra-mobile-stage lyra-mobile-stage--centered">
          <div
            className="lyra-mobile-idle-slogan"
            data-testid="lyra-idle-slogan"
          >
            Lyra 在听
          </div>
          <InputBox onSubmit={submit} />
        </div>
      </AmbientBackground>
    );
  }

  return (
    <AmbientBackground pad={pad}>
      <CoverBackground url={coverUrl} />
      <div className="lyra-mobile-stage">
        <div className="lyra-mobile-content">
          <CoverArt url={coverUrl} />
          <SongInfo title={title} artist={artist} />
          <SmallNote text={noteText} color={noteColor} />
        </div>

        <div
          className={[
            "lyra-mobile-dock",
            playing ? "lyra-mobile-dock--playing" : "",
            dockExpanded ? "lyra-mobile-dock--expanded" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setDockExpanded((v) => !v)}
        >
          {progress && (
            <ProgressBar
              progress={progress.progress}
              label={progressLabel(progress.elapsedMs, progress.durationMs)}
            />
          )}
          <PlayerControls
            canControl={playing}
            paused={state.kind === "playing" ? Boolean(state.paused) : true}
            loading={
              state.kind === "playing" && !state.paused && progress === null
            }
            onTogglePlay={handleTogglePlay}
            onSkip={handleSkip}
          />
          <div onClick={(e) => e.stopPropagation()}>
            <InputBox onSubmit={submit} />
          </div>
        </div>
      </div>
    </AmbientBackground>
  );
}
