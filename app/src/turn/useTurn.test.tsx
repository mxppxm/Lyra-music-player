import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTurn } from "./useTurn";
import { Orchestrator } from "@lyra/core";

// Uses the Orchestrator stub-friendly constructor
function makeOrchestrator() {
  const deps: any = {
    emotion: {
      analyze: vi.fn(async () => ({
        pad: { p: 0, a: 0, d: 0 },
        labels: [],
        confidence: 0.5,
        source: "emotion-agent-inferred",
      })),
    },
    companion: {
      choose: vi.fn(async () => ({
        song_id: "t1",
        target_profile: "x",
        rationale: "r",
        needed_shift: "接住",
      })),
    },
    library: {
      prefilter: vi.fn(async () => [{ id: "t1", path: "/x.mp3", origin: "local", added_at: 0, title: "T1" }]),
    },
    soulStore: {
      load: vi.fn(async () => ({
        agent_id: "lyra_001",
        created_at: "2026-07-06",
        musical_taste_base: {
          aesthetic_axes: { restraint_vs_expression: 0, narrative_vs_atmospheric: 0, polished_vs_raw: 0, novelty_seeking: 0.5 },
          affinity_genres: [],
          aversion_signals: [],
          backbone: "",
        },
        dynamic_mood: { current_pad: { p: 0, a: 0, d: 0 }, attention_to_user: 0.85, recent_bias: "" },
        shared_memory: [],
        evolution_log: [],
        proactive_budget: { daily_limit: 3, sulk_until: null, kind_budgets: { morning: 1, care: 1, anniversary: 1, share: 1, rhythm: 2 } },
      })),
    },
    turnRepo: { insertTurn: vi.fn(async () => {}) },
    audio: { playFile: vi.fn(async () => {}), stop: vi.fn(async () => {}), pause: vi.fn(async () => {}), resume: vi.fn(async () => {}) },
    clock: () => 1,
    idGen: () => "id",
  };
  return { orc: new Orchestrator(deps as any), deps };
}

describe("useTurn", () => {
  it("initial state is idle", () => {
    const { orc } = makeOrchestrator();
    const { result } = renderHook(() => useTurn(orc));
    expect(result.current.state.kind).toBe("idle");
  });

  it("submit progresses through thinking to playing", async () => {
    const { orc } = makeOrchestrator();
    const { result } = renderHook(() => useTurn(orc));
    await act(async () => {
      await result.current.submit("hi");
    });
    expect(result.current.state.kind).toBe("playing");
  });
});
