import { useState, useEffect } from "react";
import "./App.css";
import { Settings } from "./settings/Settings";
import { HomeView } from "./home/HomeView";
import { bootProviders } from "./providers/boot";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    bootProviders().catch(() => {
      // Sprint 1b-α: silent — cold-boot state handling comes with 1b-β
    });
  }, []);

  return (
    <>
      <HomeView onOpenSettings={() => setSettingsOpen(true)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default App;
