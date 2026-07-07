import { useEffect, useState } from "react";
import { SECRET_KEYS, setSecret, getSecret } from "./secrets";
import { importLibrary } from "../library/libraryScan";
import { reflectNow } from "../reflect/trigger";

export type SettingsProps = {
  open: boolean;
  onClose: () => void;
  onSchedulerUpdate?: (dailyTime: string, idleMinutes: number) => void;
};

export function Settings({ open, onClose, onSchedulerUpdate }: SettingsProps) {
  const [libraryPath, setLibraryPath] = useState("");
  const [anthropic, setAnthropic] = useState("");
  const [deepseek, setDeepseek] = useState("");
  const [zhipu, setZhipu] = useState("");
  const [dreamDailyTime, setDreamDailyTime] = useState("03:14");
  const [dreamIdleMinutes, setDreamIdleMinutes] = useState("30");
  const [perceptionEnabled, setPerceptionEnabled] = useState(true);
  const [perceptionMode, setPerceptionMode] = useState<"rule" | "llm">("rule");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [a, d, z, lib, dt, dim, pe, pm] = await Promise.all([
        getSecret(SECRET_KEYS.anthropicApiKey),
        getSecret(SECRET_KEYS.deepseekApiKey),
        getSecret(SECRET_KEYS.zhipuApiKey),
        getSecret(SECRET_KEYS.libraryRootPath),
        getSecret(SECRET_KEYS.dreamDailyTime),
        getSecret(SECRET_KEYS.dreamIdleMinutes),
        getSecret(SECRET_KEYS.perceptionEnabled),
        getSecret(SECRET_KEYS.perceptionMode),
      ]);
      if (cancelled) return;
      setAnthropic(a ?? "");
      setDeepseek(d ?? "");
      setZhipu(z ?? "");
      setLibraryPath(lib ?? "");
      setDreamDailyTime(dt ?? "03:14");
      setDreamIdleMinutes(dim ?? "30");
      // Default to enabled; only disable when explicitly stored as "false"
      setPerceptionEnabled(pe !== "false");
      setPerceptionMode(pm === "llm" ? "llm" : "rule");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const onSave = async () => {
    setSaving(true);
    try {
      await setSecret(SECRET_KEYS.anthropicApiKey, anthropic);
      await setSecret(SECRET_KEYS.deepseekApiKey, deepseek);
      await setSecret(SECRET_KEYS.zhipuApiKey, zhipu);
      await setSecret(SECRET_KEYS.libraryRootPath, libraryPath);
      await setSecret(SECRET_KEYS.dreamDailyTime, dreamDailyTime);
      await setSecret(SECRET_KEYS.dreamIdleMinutes, dreamIdleMinutes);
      await setSecret(SECRET_KEYS.perceptionEnabled, perceptionEnabled ? "true" : "false");
      await setSecret(SECRET_KEYS.perceptionMode, perceptionMode);
      if (libraryPath) {
        setScanStatus("Scanning…");
        try {
          const n = await importLibrary(libraryPath);
          setScanStatus(`Imported ${n} new track${n === 1 ? "" : "s"}.`);
        } catch (err) {
          setScanStatus(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      onSchedulerUpdate?.(dreamDailyTime, Number(dreamIdleMinutes) || 0);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const onReflect = async () => {
    setSaving(true);
    try {
      const { appliedFacts, dreamAdded } = await reflectNow();
      setScanStatus(
        `Reflected — ${appliedFacts} fact update${appliedFacts === 1 ? "" : "s"}${dreamAdded ? " + one dream" : ""}.`
      );
    } catch (err) {
      setScanStatus(`Reflect failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-label="Settings" className="settings-modal">
      <h2>Settings</h2>
      <label>
        Music library folder
        <input
          type="text"
          placeholder="/Users/you/Music"
          value={libraryPath}
          onChange={(e) => setLibraryPath(e.target.value)}
          disabled={!loaded}
        />
      </label>
      {scanStatus && (
        <p style={{ opacity: 0.7, fontSize: "0.85em" }}>{scanStatus}</p>
      )}
      <label>
        Anthropic API Key
        <input
          type="password"
          value={anthropic}
          onChange={(e) => setAnthropic(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        DeepSeek API Key
        <input
          type="password"
          value={deepseek}
          onChange={(e) => setDeepseek(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        Zhipu API Key
        <input
          type="password"
          value={zhipu}
          onChange={(e) => setZhipu(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        Daily dream time (HH:MM)
        <input
          type="text"
          placeholder="03:14"
          value={dreamDailyTime}
          onChange={(e) => setDreamDailyTime(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        Idle threshold (minutes, 0 = off)
        <input
          type="number"
          min="0"
          value={dreamIdleMinutes}
          onChange={(e) => setDreamIdleMinutes(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={perceptionEnabled}
          onChange={(e) => setPerceptionEnabled(e.target.checked)}
          disabled={!loaded}
        />
        Perception (privacy) — local behavioral signals bias next song
      </label>
      <label>
        Perception mode
        <select
          value={perceptionMode}
          onChange={(e) =>
            setPerceptionMode(e.target.value === "llm" ? "llm" : "rule")
          }
          disabled={!loaded || !perceptionEnabled}
        >
          <option value="rule">规则式（离线，免费）</option>
          <option value="llm">LLM 式（Zhipu/DeepSeek，每 60 秒一次调用）</option>
        </select>
      </label>
      <div className="settings-actions">
        <button onClick={onReflect} disabled={saving || !loaded}>
          Reflect now
        </button>
      </div>
      <div className="settings-actions">
        <button onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button onClick={onSave} disabled={saving || !loaded}>
          Save
        </button>
      </div>
    </div>
  );
}
