import { useEffect, useRef, useState } from "react";
import { AmbientBackground } from "./AmbientBackground";
import { BackgroundPhoto } from "./BackgroundPhoto";
import { ShanShuiCanvas } from "./ShanShuiCanvas";
import { GlowCanvas } from "./GlowCanvas";
import { EmotionLightBand } from "./EmotionLightBand";
import { SongInfo } from "./SongInfo";
import { SmallNote } from "./SmallNote";
import { TraceStrip } from "./TraceStrip";
import type { TraceStripItem } from "./TraceStrip";
import { InputBox } from "./InputBox";
import { GlassBar } from "./GlassBar";
import { PlayerControls } from "./PlayerControls";
import { ProgressBar, progressLabel } from "./ProgressBar";
import { useProgress } from "../audio/useProgress";
import { bindGlobalKeys } from "./keyboard";
import { parseSlashCommand } from "./slashCommand";
import { isZeroConfigRelease } from "../config/zeroConfig";
import { useTurn } from "../turn/useTurn";
import type { Orchestrator } from "../turn/Orchestrator";
import * as turnRepo from "../db/repo/turnRepo";
import { songDisplayTitle, songDisplayArtist } from "../library/display";
import type { PAD } from "../types";
import { setImmersiveFullscreen } from "./immersiveFullscreen";

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };
type HeldSong = { title: string; artist: string };
const LYRA_START_LABEL = "让 Lyra 帮你启动";

export type DataExplorerTabId =
  | "turns" | "soul" | "salient" | "library" | "lyrics_emb"
  | "perception" | "roadmap" | "features_req" | "engineer"
  | "llm_usage" | "reasoning" | "memory_md";

type HomeViewProps = {
  onOpenSettings: () => void;
  onOpenDataExplorer: (tab?: DataExplorerTabId) => void;
  onOpenHelp: () => void;
  onWeek?: () => Promise<void>;
  orchestrator: Orchestrator | null;
  /** True while provider boot / bundled data copy is still running. */
  booting?: boolean;
  /** Zero-config release — no API key / settings prompts. */
  zeroConfig?: boolean;
};

export type { HomeViewProps };

// ── Inner component wired to a live orchestrator ─────────────────────────────

function LiveHomeView({
  onOpenSettings,
  onOpenDataExplorer,
  onOpenHelp,
  onWeek,
  orchestrator,
}: {
  onOpenSettings: () => void;
  onOpenDataExplorer: (tab?: DataExplorerTabId) => void;
  onOpenHelp: () => void;
  onWeek?: () => Promise<void>;
  orchestrator: Orchestrator;
}) {
  const { state, submit: rawSubmit } = useTurn(orchestrator);
  const playing = state.kind === "playing";
  const progress = useProgress(playing);

  // Slash commands intercept before the Orchestrator runs. Known commands
  // dispatch a UI action and never become a DialogueTurn — no LLM call,
  // no memory write. Falls through for anything else so normal chat still
  // flows to Lyra.
  const submit = (text: string): Promise<void> => {
    const cmd = parseSlashCommand(text);
    if (cmd === null) return rawSubmit(text);
    if (cmd.kind === "settings") onOpenSettings();
    else if (cmd.kind === "stats") onOpenDataExplorer("llm_usage");
    else if (cmd.kind === "explorer") onOpenDataExplorer();
    else if (cmd.kind === "help") onOpenHelp();
    else if (cmd.kind === "week") void onWeek?.();
    return Promise.resolve();
  };

  const [traceItems, setTraceItems] = useState<TraceStripItem[]>([]);
  const [historicalPads, setHistoricalPads] = useState<PAD[]>([]);
  const [dockHovered, setDockHovered] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [inputDimmed, setInputDimmed] = useState(false);

  const isPlayback = state.kind === "playing";
  // Song-to-song transitions pass through "thinking" — treat it as part of
  // the playback session so immersive mode doesn't collapse and re-expand
  // between songs.
  const playbackActive = isPlayback || state.kind === "thinking";
  const dockExpanded = dockHovered || inputFocused;
  const immersivePlayback = playbackActive && !dockExpanded;

  // Fullscreen for the whole playback session (not just collapsed dock) so
  // the macOS menu bar stays hidden while a song is on.
  useEffect(() => {
    void setImmersiveFullscreen(playbackActive);
    return () => {
      void setImmersiveFullscreen(false);
    };
  }, [playbackActive]);

  // Hold the last playing pad/song across the thinking gap so ambient colour,
  // glow, and song chrome don't flash back to the idle/normal layout while
  // the next track is being chosen.
  const heldPadRef = useRef<PAD>(ZERO_PAD);
  const heldSongRef = useRef<HeldSong>({ title: "", artist: "" });
  if (state.kind === "playing") {
    heldPadRef.current = state.turn.current_emotion.pad;
    heldSongRef.current = {
      title: songDisplayTitle(state.song),
      artist: songDisplayArtist(state.song),
    };
  }

  /** After dock chrome + extras finish collapsing, dim the input. */
  useEffect(() => {
    if (!playbackActive) {
      setInputDimmed(false);
      return;
    }
    if (dockExpanded) {
      setInputDimmed(false);
      return;
    }
    const t = window.setTimeout(() => setInputDimmed(true), 300);
    return () => clearTimeout(t);
  }, [dockExpanded, playbackActive]);

  // Refresh trace + emotion history whenever state transitions to playing
  useEffect(() => {
    if (state.kind === "playing") {
      turnRepo.listRecentTurns(20).then((turns) => {
        setTraceItems(
          turns.slice(0, 5).map((t) => ({ id: t.id, coverUrl: null })),
        );
        // Reverse so oldest is drawn first, newest last (right side of band)
        setHistoricalPads(
          turns.map((t) => t.current_emotion.pad).reverse(),
        );
      }).catch(() => {});
    }
  }, [state.kind]);

  useEffect(() => {
    return bindGlobalKeys({
      onOpenSettings,
      onTogglePlayback: () => {
        if (state.kind !== "playing") return;
        if (state.paused) {
          void orchestrator.onResume();
        } else {
          void orchestrator.onPause();
        }
      },
      onSkipNext: () => {
        if (state.kind !== "playing") return;
        void orchestrator.onSkip();
      },
    });
  }, [onOpenSettings, state, orchestrator]);

  // Derive display values from state
  const pad: PAD =
    state.kind === "playing"
      ? state.turn.current_emotion.pad
      : playbackActive
        ? heldPadRef.current
        : ZERO_PAD;

  // Keep the band painted while thinking (song switch) so we don't flash the
  // empty-state hairline. proactive-pending uses the same history if any.
  const padSamples: PAD[] =
    (state.kind === "playing" ||
      state.kind === "thinking" ||
      state.kind === "proactive-pending") &&
    historicalPads.length >= 1
      ? historicalPads
      : [];

  const title: string =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? songDisplayTitle(state.song)
      : playbackActive
        ? heldSongRef.current.title
        : "";

  const artist: string =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? songDisplayArtist(state.song)
      : playbackActive
        ? heldSongRef.current.artist
        : "";

  const noteText: string =
    state.kind === "idle"
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
    state.kind === "error"
      ? "rgba(200,80,80,0.75)"
      : undefined;

  // §7 idle empty state — sparser layout when no turns yet
  const isSparseIdle = state.kind === "idle" && traceItems.length === 0;

  if (isSparseIdle) {
    return (
      <AmbientBackground pad={pad}>
        <BackgroundPhoto />
        <ShanShuiCanvas pad={pad} playing={false} />
        <div className="lyra-stage lyra-stage--centered">
          <button
            type="button"
            className="lyra-idle-slogan"
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
    <AmbientBackground
      pad={pad}
      className={immersivePlayback ? "lyra-ambient--immersive" : undefined}
    >
      <BackgroundPhoto />
      <ShanShuiCanvas pad={pad} playing={state.kind === "playing"} />
      <GlowCanvas pad={pad} active={playbackActive} />
      <div
        className={[
          "lyra-stage",
          immersivePlayback ? "lyra-stage--immersive" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div style={{ flex: 1 }} />
        {!playbackActive && <EmotionLightBand samples={padSamples} />}
        {!playbackActive && (
          <div style={{ height: "var(--lyra-space-band-to-song)" }} />
        )}
        <SongInfo title={title} artist={artist} />
        <div style={{ height: "var(--lyra-space-song-to-note)" }} />
        <SmallNote text={noteText} color={noteColor} />
        <div style={{ flex: 1 }} />
      </div>

      <GlassBar
        immersive={playbackActive}
        expanded={dockExpanded}
        inputDimmed={playbackActive && inputDimmed}
        onExpandedChange={setDockHovered}
      >
        <div className="lyra-dock__extras">
          <div className="lyra-dock__extras-inner">
            <div className="lyra-dock__player-row">
              {progress ? (
                <ProgressBar
                  progress={progress.progress}
                  label={progressLabel(progress.elapsedMs, progress.durationMs)}
                />
              ) : null}
              <PlayerControls
                canControl={state.kind === "playing"}
                paused={state.kind === "playing" ? !!state.paused : true}
                onTogglePlay={() => {
                  if (state.kind !== "playing") return;
                  if (state.paused) {
                    void orchestrator.onResume();
                  } else {
                    void orchestrator.onPause();
                  }
                }}
                onSkip={() => {
                  if (state.kind !== "playing") return;
                  void orchestrator.onSkip();
                }}
              />
            </div>
            <TraceStrip items={traceItems} />
          </div>
        </div>
        <InputBox
          onSubmit={submit}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
        />
      </GlassBar>
    </AmbientBackground>
  );
}

// ── Zero-config waiting (keys bundled at build; brief startup) ───────────────

function ZeroConfigBootView({ booting }: { booting: boolean }) {
  return (
    <AmbientBackground pad={ZERO_PAD}>
      <BackgroundPhoto />
      <ShanShuiCanvas pad={ZERO_PAD} playing={false} />
      <div className="lyra-stage lyra-stage--centered">
        <div className="lyra-idle-slogan" data-testid="lyra-idle-slogan">
          {LYRA_START_LABEL}
        </div>
        <p
          data-testid="zero-config-boot-hint"
          style={{ opacity: 0.55, fontSize: "0.9rem", marginTop: "0.75rem" }}
        >
          {booting ? "正在准备…" : "稍等，马上就好"}
        </p>
      </div>
    </AmbientBackground>
  );
}

// ── Cold-boot placeholder (dev / BYOK — no bundled keys) ────────────────────

function ColdBootView({ onOpenSettings }: { onOpenSettings: () => void }) {
  useEffect(() => {
    return bindGlobalKeys({
      onOpenSettings,
      onTogglePlayback: () => {},
    });
  }, [onOpenSettings]);

  return (
    <AmbientBackground pad={ZERO_PAD}>
      <div
        className="lyra-hero"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--lyra-viewport-padding)",
          gap: 0,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "2.5rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          Lyra
        </h1>
        <p
          style={{
            marginTop: "0.5rem",
            opacity: 0.6,
            fontSize: "0.95rem",
          }}
        >
          Your emotional music companion
        </p>
        <p
          style={{
            marginTop: "0.25rem",
            opacity: 0.45,
            fontSize: "0.85rem",
          }}
        >
          陪你说话，替你选一首歌
        </p>
        <p
          data-testid="cold-boot-hint"
          onClick={onOpenSettings}
          style={{
            marginTop: "2rem",
            opacity: 0.5,
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
        >
          Lyra needs an API key to talk.{" "}
          <span style={{ textDecoration: "underline" }}>
            Cmd+= to open Settings.
          </span>
        </p>
      </div>
    </AmbientBackground>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function HomeView({
  onOpenSettings,
  onOpenDataExplorer,
  onOpenHelp,
  onWeek,
  orchestrator,
  booting = false,
  zeroConfig = isZeroConfigRelease(),
}: HomeViewProps) {
  if (orchestrator === null) {
    if (zeroConfig) {
      return <ZeroConfigBootView booting={booting} />;
    }
    return <ColdBootView onOpenSettings={onOpenSettings} />;
  }
  return (
    <LiveHomeView
      onOpenSettings={onOpenSettings}
      onOpenDataExplorer={onOpenDataExplorer}
      onOpenHelp={onOpenHelp}
      onWeek={onWeek}
      orchestrator={orchestrator}
    />
  );
}
