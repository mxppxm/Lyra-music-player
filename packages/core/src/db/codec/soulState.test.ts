import { describe, it, expect } from "vitest";
import { toRow, fromRow } from "./soulState";
import type { SoulState } from "../../types";

const sample: SoulState = {
  agent_id: "lyra_001",
  created_at: "2026-07-06",
  musical_taste_base: {
    aesthetic_axes: {
      restraint_vs_expression: 0.7,
      narrative_vs_atmospheric: 0.6,
      polished_vs_raw: -0.3,
      novelty_seeking: 0.5,
    },
    affinity_genres: ["post-rock", "modern classical"],
    aversion_signals: ["over-produced pop"],
    backbone: "有品味的朋友",
  },
  dynamic_mood: {
    current_pad: { p: 0.3, a: -0.2, d: 0.1 },
    attention_to_user: 0.85,
    recent_bias: "偏向温暖、慢速",
  },
  shared_memory: [],  // separate table; Sprint 1a hydrates as []
  evolution_log: [],  // Sprint 1a hydrates as []
  proactive_budget: {
    daily_limit: 3,
    sulk_until: null,
    kind_budgets: { morning: 1, care: 1, anniversary: 1, share: 1, rhythm: 2 },
  },
};

describe("soulState codec", () => {
  it("round-trips core fields (shared_memory and evolution_log rehydrated to [])", () => {
    const row = toRow(sample);
    const restored = fromRow(row);
    expect(restored).toEqual(sample);
  });

  it("row.updated_at is set to the current epoch millisecond by toRow", () => {
    const before = Date.now();
    const row = toRow(sample);
    const after = Date.now();
    expect(row.updated_at).toBeGreaterThanOrEqual(before);
    expect(row.updated_at).toBeLessThanOrEqual(after);
  });

  it("if input has shared_memory/evolution_log, toRow silently drops them (they live in other tables)", () => {
    const withMem: SoulState = {
      ...sample,
      shared_memory: [{ timestamp: "2026-11-03T02:47", song_id: "x", context: "y", significance: "z" }],
      evolution_log: [{ quarter: "2026-Q3", summary: "s", adjustment: "a", rollback_id: "id" }],
    };
    const row = toRow(withMem);
    const restored = fromRow(row);
    // shared_memory/evolution_log always come back empty from soul_state row
    expect(restored.shared_memory).toEqual([]);
    expect(restored.evolution_log).toEqual([]);
  });

  it("preserves unicode in backbone and recent_bias", () => {
    const s: SoulState = {
      ...sample,
      musical_taste_base: { ...sample.musical_taste_base, backbone: "偏克制的朋友 🌙" },
    };
    expect(fromRow(toRow(s)).musical_taste_base.backbone).toBe("偏克制的朋友 🌙");
  });
});
