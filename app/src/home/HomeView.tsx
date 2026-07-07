import { useEffect, useState } from "react";
import { AmbientBackground } from "./AmbientBackground";
import { AlbumCover } from "./AlbumCover";
import { EmotionLightBand } from "./EmotionLightBand";
import { SongInfo } from "./SongInfo";
import { SmallNote } from "./SmallNote";
import { TraceStrip } from "./TraceStrip";
import type { TraceStripItem } from "./TraceStrip";
import { InputBox } from "./InputBox";
import { bindGlobalKeys } from "./keyboard";
import { useTurn } from "../turn/useTurn";
import type { Orchestrator } from "../turn/Orchestrator";
import * as turnRepo from "../db/repo/turnRepo";
import { songDisplayTitle, songDisplayArtist } from "../library/display";
import type { PAD } from "../types";

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };

type HomeViewProps = {
  onOpenSettings: () => void;
  orchestrator: Orchestrator | null;
};

export type { HomeViewProps };

// ── Inner component wired to a live orchestrator ─────────────────────────────

function LiveHomeView({
  onOpenSettings,
  orchestrator,
}: {
  onOpenSettings: () => void;
  orchestrator: Orchestrator;
}) {
  const { state, submit } = useTurn(orchestrator);
  const [traceItems, setTraceItems] = useState<TraceStripItem[]>([]);
  const [historicalPads, setHistoricalPads] = useState<PAD[]>([]);

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
        console.log("[lyra] toggle playback");
      },
    });
  }, [onOpenSettings]);

  // Derive display values from state
  const pad: PAD =
    state.kind === "playing"
      ? state.turn.current_emotion.pad
      : ZERO_PAD;

  // Emotion light band samples: use historical turn PADs when available,
  // otherwise render as an empty array so EmotionLightBand shows the
  // spec §3.3 "static silence" hairline midline instead of a single dot.
  const padSamples: PAD[] =
    state.kind === "playing" && historicalPads.length >= 2
      ? historicalPads
      : [];

  const coverUrl: string | null =
    state.kind === "playing" ? null : null; // coverUrl reserved for Sprint 2

  const title: string =
    state.kind === "playing" ? songDisplayTitle(state.song) : "";

  const artist: string =
    state.kind === "playing" ? songDisplayArtist(state.song) : "";

  const noteText: string =
    state.kind === "idle"
      ? "Lyra 在等你说一句话"
      : state.kind === "thinking"
        ? "…"
        : state.kind === "playing"
          ? state.turn.agent_response.rationale
          : state.kind === "error"
            ? state.message
            : "";

  const noteColor: string | undefined =
    state.kind === "error" ? "rgba(200,80,80,0.75)" : undefined;

  // §7 idle empty state — sparser layout when no turns yet
  const isSparseIdle = state.kind === "idle" && traceItems.length === 0;

  if (isSparseIdle) {
    return (
      <AmbientBackground pad={pad}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--lyra-viewport-padding)",
            gap: 0,
          }}
        >
          <div
            data-testid="lyra-idle-slogan"
            style={{
              color: "var(--lyra-color-song-info)",
              fontSize: "var(--lyra-song-font-size)",
              fontFamily: "var(--lyra-note-family)",
              fontStyle: "italic",
              letterSpacing: "0.04em",
              marginBottom: "var(--lyra-space-trace-to-input)",
              opacity: 0.7,
            }}
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
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "var(--lyra-viewport-padding)",
          gap: 0,
        }}
      >
        <div style={{ flex: 1 }} />
        <AlbumCover
          coverUrl={coverUrl}
          alt={title ? `${title} cover` : "album cover"}
          titleHint={title || undefined}
        />
        <div style={{ height: "var(--lyra-space-cover-to-band)" }} />
        <EmotionLightBand samples={padSamples} />
        <div style={{ height: "var(--lyra-space-band-to-song)" }} />
        {state.kind === "playing" ? (
          <SongInfo title={title} artist={artist} />
        ) : (
          <SongInfo title="" artist="" />
        )}
        <div style={{ height: "var(--lyra-space-song-to-note)" }} />
        <SmallNote text={noteText} color={noteColor} />
        <div style={{ flex: 1 }} />
        <TraceStrip items={traceItems} />
        <div style={{ height: "var(--lyra-space-trace-to-input)" }} />
        <InputBox onSubmit={submit} />
      </div>
    </AmbientBackground>
  );
}

// ── Cold-boot placeholder (no providers configured) ───────────────────────────

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

export function HomeView({ onOpenSettings, orchestrator }: HomeViewProps) {
  if (orchestrator === null) {
    return <ColdBootView onOpenSettings={onOpenSettings} />;
  }
  return <LiveHomeView onOpenSettings={onOpenSettings} orchestrator={orchestrator} />;
}
