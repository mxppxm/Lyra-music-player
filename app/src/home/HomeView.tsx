import { useEffect } from "react";
import { AmbientBackground } from "./AmbientBackground";
import { AlbumCover } from "./AlbumCover";
import { EmotionLightBand } from "./EmotionLightBand";
import { SongInfo } from "./SongInfo";
import { SmallNote } from "./SmallNote";
import { TraceStrip } from "./TraceStrip";
import { InputBox } from "./InputBox";
import { bindGlobalKeys } from "./keyboard";
import {
  FAKE_PAD,
  FAKE_SAMPLES,
  FAKE_TITLE,
  FAKE_ARTIST,
  FAKE_COVER_URL,
  FAKE_RATIONALE,
  FAKE_TRACE,
} from "./fakeData";

export type HomeViewProps = {
  onOpenSettings: () => void;
};

export function HomeView({ onOpenSettings }: HomeViewProps) {
  useEffect(() => {
    return bindGlobalKeys({
      onOpenSettings,
      onTogglePlayback: () => {
        // Sprint 1b-α: no real audio wiring yet. Log for smoke.
        console.log("[lyra] toggle playback (α stub)");
      },
    });
  }, [onOpenSettings]);

  return (
    <AmbientBackground pad={FAKE_PAD}>
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
        <AlbumCover coverUrl={FAKE_COVER_URL} alt={`${FAKE_TITLE} cover`} />
        <div style={{ height: "var(--lyra-space-cover-to-band)" }} />
        <EmotionLightBand samples={FAKE_SAMPLES} />
        <div style={{ height: "var(--lyra-space-band-to-song)" }} />
        <SongInfo title={FAKE_TITLE} artist={FAKE_ARTIST} />
        <div style={{ height: "var(--lyra-space-song-to-note)" }} />
        <SmallNote text={FAKE_RATIONALE} />
        <div style={{ flex: 1 }} />
        <TraceStrip items={FAKE_TRACE} />
        <div style={{ height: "var(--lyra-space-trace-to-input)" }} />
        <InputBox onSubmit={(t) => console.log("[lyra] user said:", t)} />
      </div>
    </AmbientBackground>
  );
}
