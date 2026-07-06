import { useState, useEffect, useMemo } from "react";
import "./App.css";
import { Settings } from "./settings/Settings";
import { HomeView } from "./home/HomeView";
import { bootProviders } from "./providers/boot";
import { createDefaultOrchestrator } from "./turn/createOrchestrator";
import type { Orchestrator } from "./turn/Orchestrator";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootDone, setBootDone] = useState(false);

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

  return (
    <>
      <HomeView
        onOpenSettings={() => setSettingsOpen(true)}
        orchestrator={orchestrator}
      />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default App;
