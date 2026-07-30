// agents/MusicProfileAgent.ts — LLM 歌曲语义分析器
// 替代 FFT 音频特征，用 LLM 对每首歌做一次深入分析，
// 生成结构化 MusicProfile，存入 DB 后永久复用。

import type { ModelProvider, ChatMessage } from "../types";
import type { MusicProfile } from "../types/musicProfile";
import { routeProvider } from "./route";
import { parseLooseJson } from "../lib/parseLooseJson";

const SYSTEM_PROMPT = `你是专业的音乐分析师。我给你一首歌的标题和歌手（可能还有歌词片段），
你需要输出这首歌的完整结构化画像。

分析维度：
- genre: 曲风流派（如 ["indie folk", "dream pop", "post-rock"]）
- mood: 情绪标签（如 ["melancholic", "warm", "nostalgic", "平静", "孤独"]），3-6 个
- energy_level: 能量级别 "very_low" | "low" | "medium" | "high" | "very_high"
- tempo_feel: 节奏感受，用一句话中文描述（如 "缓慢、有呼吸感、像心跳"）
- time_color: 这首歌的时间色彩（如 "凌晨三点"、"夏日午后"、"雨夜"）
- space_color: 空间色彩（如 "小房间只开一盏台灯"、"空旷的海边公路"）
- instrumentation: 主要乐器（如 ["acoustic guitar", "钢琴", "环境音"]）
- vocal_style: 人声风格，用中文描述（如 "气声、近麦、咬字懒散"，无 vocal 写 "无人声"）
- lyrical_themes: 歌词主题标签（如 ["孤独", "城市", "未完成的告别"]），2-4 个
- emotional_curve: 整首歌的情绪弧线，用中文描述（如 "平缓下沉→中段微光→沉回去"）
- best_for: 最适合听的场景（如 ["深夜独处", "下雨天", "开车兜风"]），2-4 个
- pad_estimate: 你估计的 PAD 值 p(愉悦度) a(激动度) d(力量感)，各在 [-1, 1]

如果你不认识这首歌（太小众/纯音乐/信息不足），设置 llm_unknown: true，但尽量填充你能推断的字段。

返回 STRICT JSON，格式：
{
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
  private provider: ModelProvider;

  constructor(opts: { provider?: ModelProvider } = {}) {
    this.provider = opts.provider ?? routeProvider("music-profile");
  }

  async analyze(input: {
    title: string;
    artist?: string;
    lyricsSnippet?: string;
  }): Promise<MusicProfile | null> {
    const userContent = [
      `标题: ${input.title}`,
      input.artist ? `歌手: ${input.artist}` : "",
      input.lyricsSnippet ? `歌词片段: ${input.lyricsSnippet.slice(0, 300)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    try {
      const res = await this.provider.chat(messages, {
        max_tokens: 1024,
        temperature: 0.3,
        response_format: { type: "json_object" },
        agent: "music-profile",
      });

      const parsed = parseLooseJson(res.content) as Record<string, unknown>;

      // Validate required fields
      if (!parsed || typeof parsed !== "object") return null;

      const profile: MusicProfile = {
        track_id: "", // filled by caller
        analyzed_at: Date.now(),
        llm_model: this.provider.id,
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
      };

      // At minimum, need genre+mood or it's useless
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

// ── Validation helpers ──────────────────────────────────────────────────────

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
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
