import type { SoulState, PAD } from "../types";
import { upsertSoulState, loadSoulState } from "../db/repo/soulRepo";

export type SoulStore = {
  load(): Promise<SoulState>;
  save(s: SoulState): Promise<void>;
  apply(delta: PAD): Promise<SoulState>;
};

const DEFAULT_AGENT_ID = "lyra_001";

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function buildDefault(agentId: string): SoulState {
  return {
    agent_id: agentId,
    created_at: new Date().toISOString().slice(0, 10),
    musical_taste_base: {
      aesthetic_axes: {
        restraint_vs_expression: 0.5,
        narrative_vs_atmospheric: 0.5,
        polished_vs_raw: 0.5,
        novelty_seeking: 0.4,
      },
      affinity_genres: [],
      aversion_signals: [],
      backbone: "每一句歌都是一次陪你说的话",
    },
    dynamic_mood: {
      current_pad: { p: 0, a: 0, d: 0 },
      attention_to_user: 0.85,
      recent_bias: "",
    },
    shared_memory: [],
    evolution_log: [],
    proactive_budget: {
      daily_limit: 3,
      sulk_until: null,
      kind_budgets: { morning: 1, care: 1, anniversary: 1, share: 1, rhythm: 2 },
    },
  };
}

export function createSoulStore(agentId: string = DEFAULT_AGENT_ID): SoulStore {
  // In-memory cache of the current state; set after first load()
  let cached: SoulState | null = null;

  async function load(): Promise<SoulState> {
    const existing = await loadSoulState(agentId);
    if (existing !== null) {
      cached = existing;
      return cached;
    }
    // Seed default on first load when row is missing
    const defaultState = buildDefault(agentId);
    await upsertSoulState(defaultState);
    cached = defaultState;
    return cached;
  }

  async function save(s: SoulState): Promise<void> {
    cached = s;
    await upsertSoulState(s);
  }

  async function apply(delta: PAD): Promise<SoulState> {
    if (cached === null) {
      throw new Error("soulStore.apply() called before load()");
    }
    const pad = cached.dynamic_mood.current_pad;
    const newPad: PAD = {
      p: clamp(pad.p + delta.p),
      a: clamp(pad.a + delta.a),
      d: clamp(pad.d + delta.d),
    };
    cached = {
      ...cached,
      dynamic_mood: {
        ...cached.dynamic_mood,
        current_pad: newPad,
      },
    };
    await upsertSoulState(cached);
    return cached;
  }

  return { load, save, apply };
}
