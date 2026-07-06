import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import { upsertSoulState, loadSoulState } from "./soulRepo";
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
    affinity_genres: ["post-rock"],
    aversion_signals: ["over-produced pop"],
    backbone: "b",
  },
  dynamic_mood: {
    current_pad: { p: 0.3, a: -0.2, d: 0.1 },
    attention_to_user: 0.85,
    recent_bias: "warm",
  },
  shared_memory: [],
  evolution_log: [],
  proactive_budget: {
    daily_limit: 3,
    sulk_until: null,
    kind_budgets: { morning: 1, care: 1, anniversary: 1, share: 1, rhythm: 2 },
  },
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("soulRepo", () => {
  it("upsertSoulState uses INSERT ... ON CONFLICT DO UPDATE", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await upsertSoulState(sample);
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO soul_state/i);
    expect(sql).toMatch(/ON CONFLICT/i);
    expect(sql).toMatch(/DO UPDATE/i);
    expect(args?.[0]).toBe("lyra_001");
  });

  it("loadSoulState returns null when agent_id is not found", async () => {
    selectMock.mockResolvedValueOnce([]);
    const res = await loadSoulState("nonexistent");
    expect(res).toBeNull();
  });

  it("loadSoulState round-trips a row", async () => {
    selectMock.mockResolvedValueOnce([
      {
        agent_id: sample.agent_id,
        created_at: sample.created_at,
        taste_base_json: JSON.stringify(sample.musical_taste_base),
        dynamic_mood_json: JSON.stringify(sample.dynamic_mood),
        proactive_budget_json: JSON.stringify(sample.proactive_budget),
        updated_at: Date.now(),
      },
    ]);
    const res = await loadSoulState("lyra_001");
    expect(res).toEqual(sample);
  });
});
