import { useEffect, useState } from "react";
import { SECRET_KEYS, setSecret, getSecret } from "./secrets";

export type SettingsProps = {
  open: boolean;
  onClose: () => void;
};

export function Settings({ open, onClose }: SettingsProps) {
  const [anthropic, setAnthropic] = useState("");
  const [deepseek, setDeepseek] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [a, d] = await Promise.all([
        getSecret(SECRET_KEYS.anthropicApiKey),
        getSecret(SECRET_KEYS.deepseekApiKey),
      ]);
      if (cancelled) return;
      setAnthropic(a ?? "");
      setDeepseek(d ?? "");
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
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-label="Settings" className="settings-modal">
      <h2>Settings</h2>
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
