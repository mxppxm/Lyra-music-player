import { useState, useEffect } from "react";
import "./App.css";
import { Settings } from "./settings/Settings";
import { bootProviders } from "./providers/boot";
import type { ProviderId } from "./types";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  zhipu: "Zhipu",
  doubao: "Doubao",
  openai: "OpenAI",
  "local-ollama": "Ollama",
};

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootReport, setBootReport] = useState<string>("");

  useEffect(() => {
    bootProviders()
      .then((report) => {
        if (report.registered.length > 0) {
          const names = report.registered.map((id) => PROVIDER_LABELS[id]);
          setBootReport(`Providers ready: ${names.join(", ")}`);
        } else if (report.skipped.some((s) => s.reason === "keychain-error")) {
          setBootReport("Provider boot: keychain error — check permissions");
        } else {
          setBootReport("No providers configured");
        }
      })
      .catch((err) => {
        setBootReport(`Provider boot failed: ${err instanceof Error ? err.message : String(err)}`);
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
