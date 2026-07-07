// types/soul.ts — SoulState（spec §2.2）
import type { PAD, ProactiveKind } from "./dialogue";
import type { PerceptionTuning } from "../perception/tuning";

export type AestheticAxes = {
  restraint_vs_expression: number;
  narrative_vs_atmospheric: number;
  polished_vs_raw: number;
  novelty_seeking: number;
};

export type MusicalTasteBase = {
  aesthetic_axes: AestheticAxes;
  affinity_genres: string[];
  aversion_signals: string[];
  backbone: string;
};

export type DynamicMood = {
  current_pad: PAD;
  attention_to_user: number;
  recent_bias: string;
};

export type SharedMemoryEntry = {
  timestamp: string;
  song_id: string;
  context: string;
  significance: string;
};

export type EvolutionLogEntry = {
  quarter: string;
  summary: string;
  adjustment: string;
  rollback_id: string;
};

export type ProactiveBudget = {
  daily_limit: number;
  sulk_until: string | null;
  kind_budgets: Record<ProactiveKind, number>;
};

export type SoulState = {
  agent_id: string;
  created_at: string;
  musical_taste_base: MusicalTasteBase;
  dynamic_mood: DynamicMood;
  shared_memory: SharedMemoryEntry[];
  evolution_log: EvolutionLogEntry[];
  proactive_budget: ProactiveBudget;
  /** Sprint 8: ReflectAgent-proposed rule threshold overrides. Undefined =
   *  compiled-in defaults. */
  perception_tuning?: PerceptionTuning;
};
