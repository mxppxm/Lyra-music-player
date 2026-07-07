import { useState, useEffect, useMemo, useCallback } from "react";
import "./App.css";
import { Settings } from "./settings/Settings";
import { HomeView } from "./home/HomeView";
import { bootProviders } from "./providers/boot";
import { createDefaultOrchestrator } from "./turn/createOrchestrator";
import type { Orchestrator } from "./turn/Orchestrator";
import { bindGlobalKeys } from "./home/keyboard";
import { reflectNow } from "./reflect/trigger";
import { readMemoryFile } from "./memory/fileIO";
import { parseMemoryMd, EMPTY_MEMORY } from "./memory/parser";
import { setMemoryContext } from "./memory/context";
import { onSongComplete } from "./audio/player";

async function bootMemory(): Promise<void> {
  try {
    const content = await readMemoryFile();
    const parsed = parseMemoryMd(content);
    setMemoryContext(parsed);
  } catch {
    setMemoryContext(EMPTY_MEMORY);
  }
}

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [reflecting, setReflecting] = useState(false);

  useEffect(() => {
    bootProviders()
      .catch(() => {})
      .then(() => bootMemory())
      .catch(() => {})
      .finally(() => setBootDone(true));
  }, []);

  // Re-evaluate after bootProviders completes so the orchestrator sees registered providers
  const orchestrator: Orchestrator | null = useMemo(
    () => (bootDone ? createDefaultOrchestrator() : null),
    [bootDone],
  );

  const handleReflectNow = useCallback(() => {
    if (reflecting) return;
    setReflecting(true);
    reflectNow().finally(() => setReflecting(false));
  }, [reflecting]);

  useEffect(() => {
    return bindGlobalKeys({
      onTogglePlayback: () => {},
      onOpenSettings: () => setSettingsOpen(true),
      onReflectNow: handleReflectNow,
    });
  }, [handleReflectNow]);

  // Subscribe to Rust's audio-complete event so the orchestrator can
  // finalise the ended turn and continue to the next song. Rust only emits
  // this for NATURAL completions (not for stop() or superseded playbacks),
  // so the handler doesn't need to guard against "was this stopped?".
  useEffect(() => {
    if (!orchestrator) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onSongComplete(() => {
      if (!orchestrator) return;
      // Fire and forget — the orchestrator handles its own errors.
      void orchestrator.onSongComplete();
    })
      .then((off) => {
        if (cancelled) off();
        else unlisten = off;
      })
      .catch((err) => {
        console.warn("[lyra] failed to subscribe to audio-complete:", err);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [orchestrator]);

  return (
    <>
      {reflecting && (
        <div
          data-testid="reflecting-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <span style={{ color: "#fff", fontSize: "1.5rem" }}>Lyra is dreaming…</span>
        </div>
      )}
      <HomeView
        onOpenSettings={() => setSettingsOpen(true)}
        orchestrator={orchestrator}
      />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default App;
