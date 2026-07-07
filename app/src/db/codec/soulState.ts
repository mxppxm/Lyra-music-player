import type { SoulState } from "../../types";

export type SoulStateRow = {
  agent_id: string;
  created_at: string;
  taste_base_json: string;
  dynamic_mood_json: string;
  proactive_budget_json: string;
  updated_at: number;
  perception_tuning_json: string | null;
};

export function toRow(s: SoulState): SoulStateRow {
  return {
    agent_id: s.agent_id,
    created_at: s.created_at,
    taste_base_json: JSON.stringify(s.musical_taste_base),
    dynamic_mood_json: JSON.stringify(s.dynamic_mood),
    proactive_budget_json: JSON.stringify(s.proactive_budget),
    updated_at: Date.now(),
    perception_tuning_json:
      s.perception_tuning !== undefined ? JSON.stringify(s.perception_tuning) : null,
  };
}

export function fromRow(r: SoulStateRow): SoulState {
  const base: SoulState = {
    agent_id: r.agent_id,
    created_at: r.created_at,
    musical_taste_base: JSON.parse(r.taste_base_json),
    dynamic_mood: JSON.parse(r.dynamic_mood_json),
    proactive_budget: JSON.parse(r.proactive_budget_json),
    shared_memory: [],  // stored in separate table; Sprint 1b will join
    evolution_log: [],  // stored in separate table; Sprint 1b will join
  };
  if (r.perception_tuning_json) {
    try {
      base.perception_tuning = JSON.parse(r.perception_tuning_json);
    } catch {
      // ignore malformed persisted tuning; defaults take over
    }
  }
  return base;
}
