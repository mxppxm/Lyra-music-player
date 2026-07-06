import { useState, useEffect } from "react";
import "./App.css";
import { Settings } from "./settings/Settings";
import { bootProviders } from "./providers/boot";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootReport, setBootReport] = useState<string>("");

  useEffect(() => {
    bootProviders().then((report) => {
      const parts: string[] = [];
      if (report.anthropic) parts.push("Anthropic");
      if (report.deepseek) parts.push("DeepSeek");
      setBootReport(
        parts.length > 0
          ? `Providers ready: ${parts.join(", ")}`
          : "No providers configured"
      );
    });
  }, []);

  return (
    <main className="container lyra-hero">
      <h1>Lyra</h1>
      <p className="tagline-en">Between the things you say.</p>
      <p className="tagline-zh">未成曲调先有情。</p>
      <button onClick={() => setSettingsOpen(true)}>Settings</button>
      {bootReport && (
        <p style={{ opacity: 0.6, fontSize: "0.85em" }}>{bootReport}</p>
      )}
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

export default App;
