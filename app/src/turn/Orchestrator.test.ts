import { describe, it, expect, vi, beforeEach } from "vitest";
import { Orchestrator } from "./Orchestrator";
import type { CurrentEmotion, LibraryTrack, DialogueTurn, SoulState } from "../types";
import * as memoryContext from "../memory/context";
import { EMPTY_MEMORY } from "../memory/parser";
import * as sharedMemoryRepo from "../db/repo/sharedMemoryRepo";
import * as appendSalientMod from "../memory/appendSalient";

// ── Mocks for salient moment wiring ──────────────────────────────────────────
vi.mock("../db/repo/sharedMemoryRepo", () => ({
  insertSharedMemory: vi.fn(async () => {}),
  listRecent: vi.fn(async () => []),
}));

vi.mock("../memory/appendSalient", () => ({
  appendSalientMomentToMemoryMd: vi.fn(async () => {}),
}));

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

beforeEach(() => {
  // Reset memory context to empty before each test so tests are isolated
  memoryContext.setMemoryContext(EMPTY_MEMORY);
  vi.mocked(sharedMemoryRepo.insertSharedMemory).mockReset();
  vi.mocked(sharedMemoryRepo.insertSharedMemory).mockResolvedValue(undefined);
  vi.mocked(appendSalientMod.appendSalientMomentToMemoryMd).mockReset();
  vi.mocked(appendSalientMod.appendSalientMomentToMemoryMd).mockResolvedValue(undefined);
});

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

  it("threads livingPortrait and topFacts from MemoryContext into companion.choose", async () => {
    const portrait = "她偏爱深夜的宁静，古典钢琴是她的庇护所。";
    const fact = {
      tags: ["#时段:深夜"],
      conclusion: "慢速古典钢琴",
      confidence: 0.87,
      n: 9,
      lastVerifiedISO: "2026-07-07",
    };
    memoryContext.setMemoryContext({
      ...EMPTY_MEMORY,
      facts: [fact],
      livingPortrait: { paragraphs: [portrait] },
    });

    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");

    expect(deps.companion.choose).toHaveBeenCalledOnce();
    const chooseArg = (deps.companion.choose as any).mock.calls[0][0];
    expect(chooseArg.livingPortrait).toBe(portrait);
    expect(chooseArg.topFacts).toHaveLength(1);
    expect(chooseArg.topFacts[0].conclusion).toBe("慢速古典钢琴");
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

describe("Orchestrator T7: reaction capture", () => {
  it("onSkip folds skip event into current turn", async () => {
    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("来一首歌");
    // Verify we're in playing state with a currentTurn
    expect(orc.getState().kind).toBe("playing");

    await orc.onSkip();

    // On next input, finalise previous turn — updateTurn should be called
    await orc.onUserInput("再来一首");
    expect(updateTurn).toHaveBeenCalled();
    const updatedTurn = (updateTurn.mock.calls[0] as unknown as [DialogueTurn])[0];
    expect(updatedTurn.user_reaction.behavioral.skipped).toBe(true);
  });

  it("verbal from next input is attributed to previous turn", async () => {
    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("来一首歌");
    // No skip or complete — just provide verbal via next input
    await orc.onUserInput("这首歌真好听");

    expect(updateTurn).toHaveBeenCalled();
    const updatedTurn = (updateTurn.mock.calls[0] as unknown as [DialogueTurn])[0];
    expect(updatedTurn.user_reaction.verbal).toBeDefined();
    expect(updatedTurn.user_reaction.verbal?.content).toBe("这首歌真好听");
  });

  it("soul dynamic_mood updates after next turn (soulStore.apply called)", async () => {
    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("来一首歌");
    await orc.onSongComplete();

    // Second input triggers soul.apply with delta
    await orc.onUserInput("好的，再来一首");

    expect(deps.soulStore.apply).toHaveBeenCalled();
    const delta = (deps.soulStore.apply as any).mock.calls[0][0];
    // delta should be a PAD object
    expect(typeof delta.p).toBe("number");
    expect(typeof delta.a).toBe("number");
    expect(typeof delta.d).toBe("number");
  });

  it("onListenProgress accumulates max ms on current turn", async () => {
    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("来一首歌");
    orc.onListenProgress(5000);
    orc.onListenProgress(12000);
    orc.onListenProgress(8000);

    await orc.onUserInput("继续");

    expect(updateTurn).toHaveBeenCalled();
    const updatedTurn = (updateTurn.mock.calls[0] as unknown as [DialogueTurn])[0];
    expect(updatedTurn.user_reaction.behavioral.listen_duration_ms).toBe(12000);
  });
});

describe("Orchestrator T6: salient moment wiring", () => {
  it("significant turn triggers repo insert + memory.md append", async () => {
    const salientModule = await import("../moments/salient");
    const fakeMoment = {
      timestampISO: "2026-07-07T02:30:00.000Z",
      songTitle: "《T1》",
      narrative: "《T1》完整听完，沉默正向。",
      tags: ["#时段:深夜"],
    };
    const detectSpy = vi.spyOn(salientModule, "detectSalientMoment").mockReturnValue(fakeMoment);

    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    // First input: establish a playing turn + current song
    await orc.onUserInput("来一首歌");
    // Second input: finalises previous turn → detectSalientMoment returns fakeMoment
    await orc.onUserInput("继续");

    expect(vi.mocked(sharedMemoryRepo.insertSharedMemory)).toHaveBeenCalledOnce();
    expect(vi.mocked(sharedMemoryRepo.insertSharedMemory)).toHaveBeenCalledWith(fakeMoment);
    expect(vi.mocked(appendSalientMod.appendSalientMomentToMemoryMd)).toHaveBeenCalledOnce();
    expect(vi.mocked(appendSalientMod.appendSalientMomentToMemoryMd)).toHaveBeenCalledWith(fakeMoment);

    detectSpy.mockRestore();
  });

  it("non-significant turn does NOT call repo insert or memory.md append", async () => {
    const salientModule = await import("../moments/salient");
    const detectSpy = vi.spyOn(salientModule, "detectSalientMoment").mockReturnValue(null);

    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("来一首歌");
    await orc.onUserInput("继续");

    expect(vi.mocked(sharedMemoryRepo.insertSharedMemory)).not.toHaveBeenCalled();
    expect(vi.mocked(appendSalientMod.appendSalientMomentToMemoryMd)).not.toHaveBeenCalled();

    detectSpy.mockRestore();
  });
});
