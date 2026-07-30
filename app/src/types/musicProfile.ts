// types/musicProfile.ts — LLM 音乐语义画像
// 替代原来的 FFT 音频特征（energy/valence/bpm），
// 用 LLM 对每首歌做一次深入分析，存入结构化画像。

export type EnergyLevel = "very_low" | "low" | "medium" | "high" | "very_high";

/** Bump when profile prompt / parsing logic changes — stale rows get re-analyzed. */
export const PROFILE_ANALYSIS_VERSION = 2;

export type MusicProfile = {
  track_id: string;
  analyzed_at: number;
  llm_model?: string;

  // ── 音乐本体 ──
  genre: string[];
  mood: string[];
  energy_level: EnergyLevel;
  tempo_feel: string;

  // ── 氛围 ──
  time_color: string;
  space_color: string;
  instrumentation: string[];
  vocal_style: string;

  // ── 内容 ──
  lyrical_themes: string[];
  emotional_curve: string;

  // ── 使用信号 ──
  best_for: string[];
  pad_estimate: { p: number; a: number; d: number };

  // ── 标志位 ──
  /** LLM 不认识这首歌（纯音乐/小众），标记后推荐降低权重 */
  llm_unknown?: boolean;
  /** LLM 确认识别到具体原曲（歌名+艺人），而非仅凭标题瞎猜 */
  recognized?: boolean;
  /** 识别到的原曲 canonical 描述，如「南拳妈妈 - 下雨天 (2008)」 */
  canonical_work?: string;
  /** 画像 prompt 版本；低于 PROFILE_ANALYSIS_VERSION 时会重跑 */
  analysis_version?: number;
};

export function profileNeedsRefresh(profile: MusicProfile | null | undefined): boolean {
  if (!profile) return true;
  return (profile.analysis_version ?? 1) < PROFILE_ANALYSIS_VERSION;
}

/** 用户对一首歌的评价反馈，用于更新 Soul taste */
export type TrackFeedback = {
  track_id: string;
  turn_id: string;
  reaction: "completed" | "skipped" | "repeated" | "verbal_positive" | "verbal_negative";
  timestamp: number;
  /** 用户听完后的情绪 delta */
  emotion_delta: { p: number; a: number; d: number };
};
