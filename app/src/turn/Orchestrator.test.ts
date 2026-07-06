import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "./Orchestrator";
import type { CurrentEmotion, LibraryTrack, DialogueTurn, SoulState } from "../types";

function makeDeps(overrides: Partial<any> = {}) {
  const emotion = {
    analyze: vi.fn(async () => ({
      pad: { p: -0.3, a: -0.2, d: 0 },
      labels: ["疲惫"],
      confidence: 0.7,
      source: "emotion-agent-inferred",
    }) as CurrentEmotion),
  };
  const companion = {
    choose: vi.fn(async () => ({
      song_id: "t1",
      target_profile: "x",
      rationale: "y",
      needed_shift: "接住" as const,
    })),
  };
  const track: LibraryTrack = { id: "t1", path: "/x.mp3", origin: "local", added_at: 0, title: "T1" };
  const library = { prefilter: vi.fn(async () => [track]) };
  const soul: SoulState = {
    agent_id: "lyra_001",
    created_at: "2026-07-06",
    musical_taste_base: {
      aesthetic_axes: {
        restraint_vs_expression: 0,
        narrative_vs_atmospheric: 0,
        polished_vs_raw: 0,
        novelty_seeking: 0.5,
      },
      affinity_genres: [],
      aversion_signals: [],
      backbone: "",
    },
    dynamic_mood: { current_pad: { p: 0, a: 0, d: 0 }, attention_to_user: 0.85, recent_bias: "" },
    shared_memory: [],
    evolution_log: [],
    proactive_budget: {
      daily_limit: 3,
      sulk_until: null,
      kind_budgets: { morning: 1, care: 1, anniversary: 1, share: 1, rhythm: 2 },
    },
  };
  const soulStore = { load: vi.fn(async () => soul), apply: vi.fn(async () => {}) };
  const turnRepo = { insertTurn: vi.fn(async () => {}) };
  const audio = { playFile: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  return {
    emotion,
    companion,
    library,
    soulStore,
    turnRepo,
    audio,
    clock: () => 1730_000_000_000,
    idGen: () => "turn-1",
    ...overrides,
  };
}

describe("Orchestrator.onUserInput happy path", () => {
  it("emits thinking then playing", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));
    await orc.onUserInput("最近有点累");
    expect(seen).toEqual(["thinking", "playing"]);
  });

  it("calls emotion, then companion, then plays audio", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("最近有点累");
    expect(deps.emotion.analyze).toHaveBeenCalledOnce();
    expect(deps.companion.choose).toHaveBeenCalledOnce();
    expect(deps.audio.playFile).toHaveBeenCalledWith("/x.mp3");
  });

  it("inserts a DialogueTurn with all the right fields", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("最近有点累");
    expect(deps.turnRepo.insertTurn).toHaveBeenCalledOnce();
    const turn = (deps.turnRepo.insertTurn.mock.calls[0] as unknown[])[0] as DialogueTurn;
    expect(turn.id).toBe("turn-1");
    expect(turn.timestamp).toBe(1730_000_000_000);
    expect(turn.user_utterance).toEqual({ modality: "text", content: "最近有点累" });
    expect(turn.agent_response.song_id).toBe("t1");
    expect(turn.agent_response.rationale).toBe("y");
    expect(turn.current_emotion.labels).toContain("疲惫");
  });
});

describe("Orchestrator.onUserInput error paths", () => {
  it("emits error when library is empty", async () => {
    const deps = makeDeps({ library: { prefilter: vi.fn(async () => []) } });
    const orc = new Orchestrator(deps as any);
    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onUserInput("hi");
    expect(last.kind).toBe("error");
    expect(last.message).toMatch(/library/i);
  });

  it("emits error when emotion agent throws", async () => {
    const deps = makeDeps({
      emotion: { analyze: vi.fn(async () => { throw new Error("nope"); }) },
    });
    const orc = new Orchestrator(deps as any);
    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onUserInput("hi");
    expect(last.kind).toBe("error");
  });
});
