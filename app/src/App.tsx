import { useState, useEffect, useMemo, useCallback } from "react";
import "./App.css";
import { Settings } from "./settings/Settings";
import { HomeView } from "./home/HomeView";
import { bootProviders } from "./providers/boot";
import { createDefaultOrchestrator } from "./turn/createOrchestrator";
import type { Orchestrator } from "./turn/Orchestrator";
import { bindGlobalKeys } from "./home/keyboard";
import { reflectNow } from "./reflect/trigger";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [reflecting, setReflecting] = useState(false);

  useEffect(() => {
    bootProviders()
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
