// agents/MusicProfileAgent.ts — LLM 歌曲语义分析器
// 替代 FFT 音频特征，用 LLM 对每首歌做一次深入分析，
// 生成结构化 MusicProfile，存入 DB 后永久复用。

import type { ModelProvider, ChatMessage } from "../types";
import type { MusicProfile } from "../types/musicProfile";
import { PROFILE_ANALYSIS_VERSION } from "../types/musicProfile";
import { resolveProviders, chatWithFallback } from "./route";
import { parseLooseJson } from "../lib/parseLooseJson";
import {
  formatProfileAnalyzeBrief,
  type ProfileAnalyzeInput,
} from "./buildProfileAnalyzeInput";

const SYSTEM_PROMPT = `你是专业的音乐分析师。我会给你「原曲歌名 + 原曲艺人」（可能还有 B 站视频标题、上传者、歌词片段）。

你的首要任务：**先识别这是不是一首你认识的具体原曲**，再基于你对**那首歌真实录音**的知识做分析——不是根据歌名字面意思编造。

## 识别原曲（最重要）

1. 用「原曲歌名 + 原曲艺人」判断：你是否认识这首**具体作品**（原版或广为人知的录音室版本）。
2. B 站上传者（如 JLRS-LeoFM、百万豪装录音棚）**不是**原曲艺人；若标注为翻录频道，请分析** underlying 原曲**，不是按视频标题猜环境音。
3. 若你确认认识：设 recognized: true，并填 canonical_work（如「南拳妈妈 - 下雨天 (2008)」）。
4. 若不认识 / 信息不足：设 recognized: false，llm_unknown: true；只填你有把握的字段，**不要**从歌名拆字猜乐器。

## 严禁幻觉（硬规则）

- 歌名里的「雨」「夜」「花」「风」等，通常是**歌词意象或主题**，**不等于**歌里真的有雨声、环境音、自然采样。
  - 例：南拳妈妈《下雨天》是**流行抒情 ballad**，主题是思念与遗憾；**不是** ambient / 雨声环境音；instrumentation 应是吉他、钢琴、弦乐、清晰人声等，**禁止**写「雨声」「环境音」除非该曲确实以这些为主。
- instrumentation 必须是你对该曲**真实配器**的判断，不能从标题隐喻推导。
- best_for 写「适合什么情绪/场景听」，不要写标题字面场景（如因为歌名有「雨」就写「听窗外下雨」——除非歌的内容/氛围确实如此）。
- time_color / space_color 是**听感隐喻**，也要基于曲风与情绪，不是标题词典。

## 分析维度

- genre: 曲风流派
- mood: 情绪标签，3-6 个
- energy_level: "very_low" | "low" | "medium" | "high" | "very_high"
- tempo_feel: 节奏感受（中文一句）
- time_color: 时间色彩（听感隐喻，非标题字面）
- space_color: 空间色彩（听感隐喻）
- instrumentation: 主要乐器（真实配器）
- vocal_style: 人声风格（无 vocal 写「无人声」）
- lyrical_themes: 歌词主题，2-4 个
- emotional_curve: 情绪弧线（中文）
- best_for: 适合听的场景/状态，2-4 个
- pad_estimate: PAD 估计 p/a/d，各 [-1, 1]

返回 STRICT JSON：
{
  "recognized": true,
  "canonical_work": "艺人 - 歌名 (年份，可选)",
  "genre": [],
  "mood": [],
  "energy_level": "medium",
  "tempo_feel": "...",
  "time_color": "...",
  "space_color": "...",
  "instrumentation": [],
  "vocal_style": "...",
  "lyrical_themes": [],
  "emotional_curve": "...",
  "best_for": [],
  "pad_estimate": { "p": 0, "a": 0, "d": 0 },
  "llm_unknown": false
}

不要加 markdown 或任何额外文字。`;

export class MusicProfileAgent {
  private providers: ModelProvider[];

  constructor(opts: { provider?: ModelProvider } = {}) {
    this.providers = opts.provider
      ? [opts.provider]
      : resolveProviders("music-profile");
  }

  async analyze(input: ProfileAnalyzeInput): Promise<MusicProfile | null> {
    const userContent = formatProfileAnalyzeBrief(input);

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    try {
      const res = await chatWithFallback(this.providers, messages, {
        max_tokens: 8192,
        temperature: 0.3,
        response_format: { type: "json_object" },
        agent: "music-profile",
      });

      const parsed = parseLooseJson(res.content) as Record<string, unknown>;

      if (!parsed || typeof parsed !== "object") return null;

      const profile: MusicProfile = {
        track_id: "",
        analyzed_at: Date.now(),
        llm_model: res.model ?? this.providers[0].id,
        genre: asStringArray(parsed.genre),
        mood: asStringArray(parsed.mood),
        energy_level: asEnergyLevel(parsed.energy_level),
        tempo_feel: asString(parsed.tempo_feel, ""),
        time_color: asString(parsed.time_color, ""),
        space_color: asString(parsed.space_color, ""),
        instrumentation: asStringArray(parsed.instrumentation),
        vocal_style: asString(parsed.vocal_style, ""),
        lyrical_themes: asStringArray(parsed.lyrical_themes),
        emotional_curve: asString(parsed.emotional_curve, ""),
        best_for: asStringArray(parsed.best_for),
        pad_estimate: asPAD(parsed.pad_estimate),
        llm_unknown: parsed.llm_unknown === true,
        recognized: parsed.recognized === true,
        canonical_work: asOptionalString(parsed.canonical_work),
        analysis_version: PROFILE_ANALYSIS_VERSION,
      };

      if (profile.genre.length === 0 && profile.mood.length === 0) {
        return null;
      }

      return profile;
    } catch (e) {
      console.warn("[MusicProfileAgent] analyze failed:", e);
      return null;
    }
  }
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function asOptionalString(v: unknown): string | undefined {
  const s = asString(v, "").trim();
  return s || undefined;
}

function asEnergyLevel(v: unknown): MusicProfile["energy_level"] {
  const valid = new Set(["very_low", "low", "medium", "high", "very_high"]);
  return typeof v === "string" && valid.has(v)
    ? (v as MusicProfile["energy_level"])
    : "medium";
}

function asPAD(v: unknown): { p: number; a: number; d: number } {
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const p = typeof o.p === "number" ? clamp(o.p, -1, 1) : 0;
    const a = typeof o.a === "number" ? clamp(o.a, -1, 1) : 0;
    const d = typeof o.d === "number" ? clamp(o.d, -1, 1) : 0;
    return { p, a, d };
  }
  return { p: 0, a: 0, d: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
