import { useEffect, useState } from "react";
import { SECRET_KEYS, setSecret, getSecret } from "./secrets";
import { lyricsRefill } from "../library/lyricsRefill";
import { reflectNow } from "../reflect/trigger";
import { AnimatedMount } from "../ui/motion/AnimatedMount";

type EmbeddingChoice = "" | "zhipu" | "openai";

export type SettingsProps = {
  open: boolean;
  onClose: () => void;
  onSchedulerUpdate?: (dailyTime: string, idleMinutes: number) => void;
};

export function Settings({ open, onClose, onSchedulerUpdate }: SettingsProps) {
  const [saving, setSaving] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>("");
  const [anthropic, setAnthropic] = useState("");
  const [deepseek, setDeepseek] = useState("");
  const [zhipu, setZhipu] = useState("");
  const [sensenova, setSensenova] = useState("");
  const [dreamDailyTime, setDreamDailyTime] = useState("03:14");
  const [dreamIdleMinutes, setDreamIdleMinutes] = useState("30");
  const [perceptionEnabled, setPerceptionEnabled] = useState(true);
  const [perceptionMode, setPerceptionMode] = useState<"rule" | "llm">("rule");
  const [weatherEnabled, setWeatherEnabled] = useState(true);
  const [weatherLat, setWeatherLat] = useState("");
  const [weatherLon, setWeatherLon] = useState("");
  const [embeddingChoice, setEmbeddingChoice] = useState<EmbeddingChoice>("");
  const [zhipuEmbeddingKey, setZhipuEmbeddingKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [weeklyDir, setWeeklyDir] = useState("");
  const [weeklyAuto, setWeeklyAuto] = useState(true);
  const [embeddingDirty, setEmbeddingDirty] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [a, d, z, s, dt, dim, pe, pm, ep, zek, ok, wd, wa, we, wlat, wlon] = await Promise.all([
        getSecret(SECRET_KEYS.anthropicApiKey),
        getSecret(SECRET_KEYS.deepseekApiKey),
        getSecret(SECRET_KEYS.zhipuApiKey),
        getSecret(SECRET_KEYS.sensenovaApiKey),
        getSecret(SECRET_KEYS.dreamDailyTime),
        getSecret(SECRET_KEYS.dreamIdleMinutes),
        getSecret(SECRET_KEYS.perceptionEnabled),
        getSecret(SECRET_KEYS.perceptionMode),
        getSecret(SECRET_KEYS.embeddingProvider),
        getSecret(SECRET_KEYS.zhipuEmbeddingApiKey),
        getSecret(SECRET_KEYS.openaiApiKey),
        getSecret(SECRET_KEYS.weeklyDirOverride),
        getSecret(SECRET_KEYS.weeklyAutoEnabled),
        getSecret(SECRET_KEYS.weatherEnabled),
        getSecret(SECRET_KEYS.weatherLat),
        getSecret(SECRET_KEYS.weatherLon),
      ]);
      if (cancelled) return;
      setAnthropic(a ?? "");
      setDeepseek(d ?? "");
      setZhipu(z ?? "");
      setSensenova(s ?? "");
      setDreamDailyTime(dt ?? "03:14");
      setDreamIdleMinutes(dim ?? "30");
      // Default to enabled; only disable when explicitly stored as "false"
      setPerceptionEnabled(pe !== "false");
      setPerceptionMode(pm === "llm" ? "llm" : "rule");
      setWeatherEnabled(we !== "false");
      setWeatherLat(wlat ?? "");
      setWeatherLon(wlon ?? "");
      setEmbeddingChoice(ep === "zhipu" || ep === "openai" ? ep : "");
      setZhipuEmbeddingKey(zek ?? "");
      setOpenaiKey(ok ?? "");
      setWeeklyDir(wd ?? "");
      setWeeklyAuto(wa !== "false");
      setEmbeddingDirty(false);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const onSave = async () => {
    setSaving(true);
    try {
      const validCoord = (raw: string): string => {
        if (!raw || !raw.trim()) return "";
        const n = Number(raw);
        return Number.isFinite(n) ? raw.trim() : "";
      };
      await setSecret(SECRET_KEYS.anthropicApiKey, anthropic);
      await setSecret(SECRET_KEYS.deepseekApiKey, deepseek);
      await setSecret(SECRET_KEYS.zhipuApiKey, zhipu);
      await setSecret(SECRET_KEYS.sensenovaApiKey, sensenova);
      await setSecret(SECRET_KEYS.dreamDailyTime, dreamDailyTime);
      await setSecret(SECRET_KEYS.dreamIdleMinutes, dreamIdleMinutes);
      await setSecret(SECRET_KEYS.perceptionEnabled, perceptionEnabled ? "true" : "false");
      await setSecret(SECRET_KEYS.perceptionMode, perceptionMode);
      await setSecret(SECRET_KEYS.weatherEnabled, weatherEnabled ? "true" : "false");
      await setSecret(SECRET_KEYS.weatherLat, validCoord(weatherLat));
      await setSecret(SECRET_KEYS.weatherLon, validCoord(weatherLon));
      await setSecret(SECRET_KEYS.embeddingProvider, embeddingChoice);
      await setSecret(SECRET_KEYS.zhipuEmbeddingApiKey, zhipuEmbeddingKey);
      await setSecret(SECRET_KEYS.openaiApiKey, openaiKey);
      await setSecret(SECRET_KEYS.weeklyDirOverride, weeklyDir);
      await setSecret(SECRET_KEYS.weeklyAutoEnabled, weeklyAuto ? "true" : "false");
      setEmbeddingDirty(false);
      onSchedulerUpdate?.(dreamDailyTime, Number(dreamIdleMinutes) || 0);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const onRefill = () => {
    if (refilling) return;
    setRefilling(true);
    setScanStatus("正在补全歌词嵌入…");
    void lyricsRefill()
      .then((r) => {
        setScanStatus(
          `补全完成: ${r.succeeded} 成功, ${r.failed} 失败 (共 ${r.started} 首).`,
        );
      })
      .catch(() => setScanStatus("补全失败 — 请检查控制台."))
      .finally(() => setRefilling(false));
  };

  const onReflect = async () => {
    setSaving(true);
    try {
      const { appliedFacts, dreamAdded } = await reflectNow();
      setScanStatus(
        `反思完成 — ${appliedFacts} 条事实更新${dreamAdded ? " + 一个梦境" : ""}.`
      );
    } catch (err) {
      setScanStatus(`反思失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatedMount open={open} zIndex={10000}>
      <div role="dialog" aria-label="设置" className="settings-modal">
      <h2>⚙️ 设置</h2>
      {scanStatus && (
        <p style={{ opacity: 0.7, fontSize: "0.85em" }}>{scanStatus}</p>
      )}
      <label>
        Anthropic API 密钥
        <input
          type="password"
          value={anthropic}
          onChange={(e) => setAnthropic(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        DeepSeek API 密钥
        <input
          type="password"
          value={deepseek}
          onChange={(e) => setDeepseek(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        智谱 API 密钥
        <input
          type="password"
          value={zhipu}
          onChange={(e) => setZhipu(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        Sensenova API 密钥
        <input
          type="password"
          value={sensenova}
          onChange={(e) => setSensenova(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        每日梦境时间 (HH:MM)
        <input
          type="text"
          placeholder="03:14"
          value={dreamDailyTime}
          onChange={(e) => setDreamDailyTime(e.target.value)}
          disabled={!loaded}
        />
      </label>
      <label>
        空闲阈值 (分钟, 0=关闭)
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
        感知模式 — 根据本地行为信号推荐下一首歌
      </label>
      <label>
        感知方式
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
      <label>
        <input
          type="checkbox"
          checked={weatherEnabled}
          onChange={(e) => setWeatherEnabled(e.target.checked)}
          disabled={!loaded || !perceptionEnabled}
        />
        天气情绪 (Open-Meteo) — 根据本地天气微调音乐偏好
      </label>
      <p style={{ opacity: 0.7, fontSize: "0.85em", margin: "0 0 8px 0" }}>
        ⓘ 未填写手动坐标时会请求系统定位权限
      </p>
      <label>
        天气纬度 (可选)
        <input
          type="text"
          value={weatherLat}
          onChange={(e) => setWeatherLat(e.target.value)}
          disabled={!loaded || !perceptionEnabled || !weatherEnabled}
          placeholder="e.g. 31.23"
        />
      </label>
      <label>
        天气经度 (可选)
        <input
          type="text"
          value={weatherLon}
          onChange={(e) => setWeatherLon(e.target.value)}
          disabled={!loaded || !perceptionEnabled || !weatherEnabled}
          placeholder="e.g. 121.47"
        />
      </label>
      <label>
        歌词嵌入服务
        <select
          value={embeddingChoice}
          onChange={(e) => {
            setEmbeddingChoice(e.target.value as EmbeddingChoice);
            setEmbeddingDirty(true);
          }}
          disabled={!loaded}
        >
          <option value="">（未启用）</option>
          <option value="zhipu">Zhipu embedding-3</option>
          <option value="openai">OpenAI text-embedding-3-small</option>
        </select>
      </label>
      {embeddingChoice === "zhipu" && (
        <label>
          智谱 Embedding API 密钥
          <input
            type="password"
            value={zhipuEmbeddingKey}
            onChange={(e) => {
              setZhipuEmbeddingKey(e.target.value);
              setEmbeddingDirty(true);
            }}
            disabled={!loaded}
          />
        </label>
      )}
      {embeddingChoice === "openai" && (
        <label>
          OpenAI API 密钥
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => {
              setOpenaiKey(e.target.value);
              setEmbeddingDirty(true);
            }}
            disabled={!loaded}
          />
        </label>
      )}
      <fieldset className="settings-weekly">
        <legend>周报</legend>
        <label>
          保存目录（留空则默认 <code>&lt;appData&gt;/weeklies</code>）
          <input
            type="text"
            value={weeklyDir}
            onChange={(e) => setWeeklyDir(e.target.value)}
            placeholder=""
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={weeklyAuto}
            onChange={(e) => setWeeklyAuto(e.target.checked)}
          />
          周日 03:14 自动生成
        </label>
      </fieldset>
      <div className="settings-actions">
        <button
          onClick={onRefill}
          disabled={
            refilling || !loaded || !embeddingChoice || embeddingDirty
          }
          title={
            embeddingDirty
              ? "请先保存 — 嵌入服务/密钥尚未持久化"
              : undefined
          }
        >
          {refilling ? "正在补全…" : "补全缺少的歌词嵌入"}
        </button>
      </div>
      <div className="settings-actions">
        <button onClick={onReflect} disabled={saving || !loaded}>
          立即反思
        </button>
      </div>
      <div className="settings-actions">
        <button onClick={onClose} disabled={saving}>
          取消
        </button>
        <button onClick={onSave} disabled={saving || !loaded}>
          保存
        </button>
      </div>
      </div>
    </AnimatedMount>
  );
}
