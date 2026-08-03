import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AmbientBackground } from "./AmbientBackground";
import { CoverArt, normalizeCoverUrl } from "./CoverBackground";
import { GlowCanvas } from "./GlowCanvas";
import { ThinkingNote } from "./ThinkingNote";
import { useCoverPalette } from "./coverPalette";
import { SongInfo } from "./SongInfo";
import { SmallNote } from "./SmallNote";
import { InputBox } from "./InputBox";
import { PlayerControls } from "./PlayerControls";
import { ProgressBar, progressLabel } from "./ProgressBar";
import { useProgress } from "../audio/useProgress";
import { useNowPlaying } from "../audio/useNowPlaying";
import { useAutoAdvance } from "../audio/useAutoAdvance";
import { usePrefetchNext } from "../audio/usePrefetchNext";
import { useTurn } from "../turn/useTurn";
import type { Orchestrator } from "@lyra/core";
import { songDisplayTitle, songDisplayArtist } from "@lyra/core/library/display";
import type { PAD } from "../lib/color";
import { setImmersiveStatusBar } from "./immersiveStatusBar";
import { LyraAudio } from "@lyra/platform-ios";

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };
const LYRA_START_LABEL = "让 Lyra 帮你启动";

type MobileHomeViewProps = {
  orchestrator: Orchestrator;
};

export function MobileHomeView({ orchestrator }: MobileHomeViewProps) {
  const { state, submit } = useTurn(orchestrator);
  const playing = state.kind === "playing";
  const progress = useProgress(playing);
  useNowPlaying(orchestrator, state);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const coverShiftRef = useRef<HTMLDivElement>(null);
  const [coverTransform, setCoverTransform] = useState<string>("none");

  // Keep immersive across the thinking gap between songs; only drop it when
  // the playback session itself ends.
  useEffect(() => {
    if (state.kind !== "playing" && state.kind !== "thinking") {
      setImmersive(false);
    }
  }, [state.kind]);

  useEffect(() => {
    void setImmersiveStatusBar(immersive);
    return () => {
      void setImmersiveStatusBar(false);
    };
  }, [immersive]);

  useEffect(() => {
    if (immersive) {
      document.documentElement.dataset.lyraImmersive = "true";
    } else {
      delete document.documentElement.dataset.lyraImmersive;
    }
    return () => {
      delete document.documentElement.dataset.lyraImmersive;
    };
  }, [immersive]);

  // FLIP: glide the cover to the screen center and scale it up when
  // entering immersive mode; "none" on exit animates it back.
  useLayoutEffect(() => {
    if (!immersive) {
      setCoverTransform("none");
      return;
    }
    const el = coverShiftRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetSize = Math.min(window.innerWidth * 0.82, 330);
    const scale = targetSize / rect.width;
    const dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
    const dy = window.innerHeight / 2 - (rect.top + rect.height / 2);
    setCoverTransform(`translate(${dx}px, ${dy}px) scale(${scale})`);
  }, [immersive]);

  const actuallyPlaying =
    state.kind === "playing" && !state.paused && progress !== null;

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

  useAutoAdvance(orchestrator, setPlaybackError, {
    songId: currentSongId,
    playing: state.kind === "playing",
    paused: state.kind === "playing" ? Boolean(state.paused) : true,
    progress: progress?.progress ?? 0,
    elapsedMs: progress?.elapsedMs,
    durationMs: progress?.durationMs,
  });

  usePrefetchNext(orchestrator, {
    songId: currentSongId,
    playing: state.kind === "playing",
    paused: state.kind === "playing" ? Boolean(state.paused) : true,
    progress: progress?.progress ?? 0,
  });

  const noteText: string =
    playbackError !== null
      ? `这首歌没能放出来：${playbackError}`
      : state.kind === "idle"
        ? "Lyra 在等你说一句话"
        : state.kind === "thinking"
          ? ""
          : state.kind === "playing"
            ? state.turn.agent_response.rationale
            : state.kind === "proactive-pending"
              ? state.rationale
              : state.kind === "error"
                ? state.message
                : "";

  const isThinking = state.kind === "thinking";

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
  const palette = useCoverPalette(normalizeCoverUrl(coverUrl), pad);

  const isSparseIdle = state.kind === "idle";

  if (isSparseIdle) {
    return (
      <AmbientBackground pad={pad}>
        <GlowCanvas palette={palette} />
        <div className="lyra-mobile-stage lyra-mobile-stage--centered">
          <button
            type="button"
            className="lyra-mobile-idle-slogan"
            data-testid="lyra-idle-slogan"
            onClick={() => void orchestrator.onLyraStart()}
          >
            {LYRA_START_LABEL}
          </button>
          <InputBox onSubmit={submit} />
        </div>
      </AmbientBackground>
    );
  }

  return (
    <AmbientBackground pad={pad}>
      <GlowCanvas palette={palette} />
      <div
        className={[
          "lyra-mobile-stage",
          immersive ? "lyra-mobile-stage--immersive" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (playing) setImmersive((v) => !v);
        }}
      >
        <div className="lyra-mobile-content">
          <div
            ref={coverShiftRef}
            className="lyra-mobile-cover-shift"
            style={{ transform: coverTransform }}
          >
            <CoverArt
            url={coverUrl}
            cd={immersive}
            spinning={immersive && actuallyPlaying}
          />
          </div>
          <SongInfo title={title} artist={artist} />
          {isThinking ? (
            <ThinkingNote />
          ) : (
            <SmallNote text={noteText} color={noteColor} />
          )}
        </div>

        <div
          className={[
            "lyra-mobile-dock",
            playing ? "lyra-mobile-dock--playing" : "",
            dockExpanded ? "lyra-mobile-dock--expanded" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={(e) => {
            e.stopPropagation();
            setDockExpanded((v) => !v);
          }}
        >
          <div
            className={[
              "lyra-mobile-progress-wrap",
              progress ? "lyra-mobile-progress-wrap--show" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden={!progress}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="lyra-mobile-progress-wrap__inner">
              <ProgressBar
                progress={progress?.progress ?? 0}
                durationMs={progress?.durationMs ?? 0}
                label={
                  progress
                    ? progressLabel(progress.elapsedMs, progress.durationMs)
                    : ""
                }
                onSeek={(positionMs) => {
                  void LyraAudio.seek({ positionMs }).catch((err) => {
                    console.warn("[lyra-ios] seek:", err);
                  });
                }}
              />
            </div>
          </div>
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
