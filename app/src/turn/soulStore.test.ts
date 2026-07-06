import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SoulState, PAD } from "../types";

vi.mock("../db/repo/soulRepo", () => ({
  upsertSoulState: vi.fn(),
  loadSoulState: vi.fn(),
}));

import { createSoulStore } from "./soulStore";
import { upsertSoulState, loadSoulState } from "../db/repo/soulRepo";

const upsertMock = vi.mocked(upsertSoulState);
const loadMock = vi.mocked(loadSoulState);

const DEFAULT_AGENT = "lyra_001";

function baseSoulState(): SoulState {
  return {
    agent_id: DEFAULT_AGENT,
    created_at: "2026-01-01",
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
    dynamic_mood: { current_pad: { p: 0.1, a: 0.2, d: 0.3 }, attention_to_user: 0.85, recent_bias: "" },
    shared_memory: [],
    evolution_log: [],
    proactive_budget: {
      daily_limit: 3,
      sulk_until: null,
      kind_budgets: { morning: 1, care: 1, anniversary: 1, share: 1, rhythm: 2 },
    },
  };
}

beforeEach(() => {
  upsertMock.mockReset();
  loadMock.mockReset();
  upsertMock.mockResolvedValue(undefined);
});

describe("soulStore.load()", () => {
  it("returns seeded default when soul_state row is missing", async () => {
    loadMock.mockResolvedValueOnce(null);

    const store = createSoulStore();
    const soul = await store.load();

    expect(soul.agent_id).toBe(DEFAULT_AGENT);
    expect(soul.musical_taste_base.backbone).toBe("每一句歌都是一次陪你说的话");
    expect(soul.musical_taste_base.aesthetic_axes.novelty_seeking).toBe(0.4);
    expect(soul.musical_taste_base.aesthetic_axes.restraint_vs_expression).toBe(0.5);
    expect(soul.proactive_budget.daily_limit).toBe(3);
    // upsert was called to seed the default
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it("returns saved value on second call (row exists)", async () => {
    const saved = baseSoulState();
    loadMock.mockResolvedValueOnce(saved);

    const store = createSoulStore();
    const soul = await store.load();

    expect(soul).toEqual(saved);
    // no upsert when row already exists
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("uses provided agentId", async () => {
    loadMock.mockResolvedValueOnce(null);

    const store = createSoulStore("custom_agent");
    const soul = await store.load();

    expect(soul.agent_id).toBe("custom_agent");
    expect(loadMock).toHaveBeenCalledWith("custom_agent");
  });
});

describe("soulStore.save()", () => {
  it("roundtrips through soulRepo.upsertSoulState", async () => {
    loadMock.mockResolvedValueOnce(null);

    const store = createSoulStore();
    await store.load(); // seed

    upsertMock.mockClear();
    const state = baseSoulState();
    await store.save(state);

    expect(upsertMock).toHaveBeenCalledOnce();
    expect(upsertMock).toHaveBeenCalledWith(state);
  });
});

describe("soulStore.apply(delta)", () => {
  it("mutates dynamic_mood.current_pad by delta", async () => {
    const state = baseSoulState();
    state.dynamic_mood.current_pad = { p: 0.2, a: 0.1, d: -0.3 };
    loadMock.mockResolvedValueOnce(state);

    const store = createSoulStore();
    await store.load();

    upsertMock.mockClear();
    const delta: PAD = { p: 0.3, a: -0.2, d: 0.4 };
    const updated = await store.apply(delta);

    expect(updated.dynamic_mood.current_pad.p).toBeCloseTo(0.5);
    expect(updated.dynamic_mood.current_pad.a).toBeCloseTo(-0.1);
    expect(updated.dynamic_mood.current_pad.d).toBeCloseTo(0.1);
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it("clamps dynamic_mood.current_pad to [-1, 1]", async () => {
    const state = baseSoulState();
    state.dynamic_mood.current_pad = { p: 0.9, a: -0.9, d: 0.0 };
    loadMock.mockResolvedValueOnce(state);

    const store = createSoulStore();
    await store.load();

    const updated = await store.apply({ p: 0.5, a: -0.5, d: 1.5 });

    expect(updated.dynamic_mood.current_pad.p).toBe(1);
    expect(updated.dynamic_mood.current_pad.a).toBe(-1);
    expect(updated.dynamic_mood.current_pad.d).toBe(1);
  });

  it("throws if load() has not been called first", async () => {
    const store = createSoulStore();
    await expect(store.apply({ p: 0, a: 0, d: 0 })).rejects.toThrow();
  });
});
