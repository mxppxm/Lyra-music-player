import { useState } from "react";
import "./App.css";
import { Settings } from "./settings/Settings";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <main className="container lyra-hero">
      <h1>Lyra</h1>
      <p className="tagline-en">Between the things you say.</p>
      <p className="tagline-zh">未成曲调先有情。</p>
      <button onClick={() => setSettingsOpen(true)}>Settings</button>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

export default App;
