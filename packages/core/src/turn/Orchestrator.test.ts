import { describe, it, expect, vi, beforeEach } from "vitest";
import { Orchestrator } from "./Orchestrator";
import type { CurrentEmotion, LibraryTrack, DialogueTurn, SoulState } from "../types";
import * as memoryContext from "../memory/context";
import { EMPTY_MEMORY } from "../memory/parser";
import * as sharedMemoryRepo from "../db/repo/sharedMemoryRepo";
import * as appendSalientMod from "../memory/appendSalient";

// ── Mock song-name intent resolution (default: not a song) ───────────────────
vi.mock("../library/songIntent", () => ({
  resolveSongIntent: vi.fn(async () => ({ kind: "mood" as const, reason: "default" })),
}));
import * as songIntentMod from "../library/songIntent";

// ── Mocks for salient moment wiring ──────────────────────────────────────────
vi.mock("../db/repo/sharedMemoryRepo", () => ({
  insertSharedMemory: vi.fn(async () => {}),
  listRecent: vi.fn(async () => []),
}));

vi.mock("../memory/appendSalient", () => ({
  appendSalientMomentToMemoryMd: vi.fn(async () => {}),
}));

// ── Mock tray bridge (no Tauri runtime in tests) ──────────────────────────────
vi.mock("../tray/trayBridge", () => ({
  setBreathing: vi.fn(async () => {}),
}));

vi.mock("../db/repo/libraryRepo", () => ({
  listAll: vi.fn(async () => []),
  getTrack: vi.fn(async () => null),
  findByTitle: vi.fn(async () => []),
  batchInsertTracks: vi.fn(async () => 0),
}));

vi.mock("../db/repo/turnRepo", () => ({
  listRecentTurns: vi.fn(async () => []),
  insertTurn: vi.fn(async () => {}),
  updateTurn: vi.fn(async () => {}),
  setTurnLatency: vi.fn(async () => {}),
}));

vi.mock("../db/repo/musicProfileRepo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/repo/musicProfileRepo")>();
  return {
    ...actual,
    getBatch: vi.fn(async () => new Map()),
    getFeedbackStats: vi.fn(async () => new Map()),
  };
});

import { setBreathing } from "../tray/trayBridge";
import { listRecentTurns } from "../db/repo/turnRepo";
import * as libraryRepo from "../db/repo/libraryRepo";

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
  const audio = { playFile: vi.fn(async () => {}), stop: vi.fn(async () => {}), pause: vi.fn(async () => {}), resume: vi.fn(async () => {}) };
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
  vi.mocked(setBreathing).mockClear();
  vi.mocked(songIntentMod.resolveSongIntent).mockReset();
  vi.mocked(songIntentMod.resolveSongIntent).mockResolvedValue({ kind: "mood", reason: "default" });
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
    expect(deps.audio.playFile).toHaveBeenCalledWith("/x.mp3", null);
  });

  it("stops the current track on submit — before the new pick is analysed", async () => {
    const deps = makeDeps();
    const order: string[] = [];
    (deps.audio.stop as any).mockImplementation(async () => {
      order.push("stop");
    });
    (deps.emotion.analyze as any).mockImplementation(async () => {
      order.push("analyze");
      return { pad: { p: 0, a: 0, d: 0 }, labels: ["疲惫"], confidence: 1, source: "emotion-agent-inferred" };
    });
    const orc = new Orchestrator(deps as any);

    // First song is playing; the second submit must silence it immediately.
    await orc.onUserInput("来一首歌");
    (deps.audio.stop as any).mockClear();
    order.length = 0;
    await orc.onUserInput("换个心情");

    expect(deps.audio.stop).toHaveBeenCalled();
    // Silence lands before we spend seconds analysing the next mood.
    expect(order[0]).toBe("stop");
    expect(order.indexOf("stop")).toBeLessThan(order.indexOf("analyze"));
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

describe("Orchestrator.onUserInput — song-name intent (resolveSongIntent)", () => {
  it("《》点歌：先播命中曲，同时把输入当心情分析并锁定锚点", async () => {
    const deps = makeDeps({
      resolvePlayUrl: vi.fn(async () => "http://x/next.mp3"),
    });
    const track: LibraryTrack = {
      id: "t1",
      path: "/x.mp3",
      origin: "local",
      added_at: 0,
      title: "《山丘》",
    };
    const t2: LibraryTrack = {
      id: "t2",
      path: "/y.mp3",
      origin: "local",
      added_at: 0,
      title: "T2",
    };
    vi.mocked(songIntentMod.resolveSongIntent).mockResolvedValue({
      kind: "song",
      song: track,
      source: "local",
    });
    deps.emotion.analyze.mockResolvedValue({
      pad: { p: 0.2, a: -0.4, d: 0.1 },
      labels: ["怀旧", "山丘"],
      confidence: 0.6,
      source: "emotion-agent-inferred",
    });
    const orc = new Orchestrator(deps as any);
    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));
    await orc.onUserInput("《山丘》");
    expect(songIntentMod.resolveSongIntent).toHaveBeenCalledWith("《山丘》");
    // 首曲直达；同时分析输入作为后续心情
    expect(deps.emotion.analyze).toHaveBeenCalledWith({ userUtterance: "《山丘》" });
    expect(deps.audio.playFile).toHaveBeenCalledWith("/x.mp3", null);
    expect(deps.turnRepo.insertTurn).toHaveBeenCalledOnce();
    const inserted = (deps.turnRepo.insertTurn as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as DialogueTurn;
    expect(inserted.current_emotion.labels).toEqual(["怀旧", "山丘"]);
    expect(inserted.agent_response.song_id).toBe("t1");
    expect(seen).toEqual(["thinking", "playing"]);

    // 后续 prefetch 走心情锁定，pseudoTarget 为原输入
    (deps.library.prefilter as ReturnType<typeof vi.fn>).mockResolvedValue([t2]);
    (deps.companion.choose as ReturnType<typeof vi.fn>).mockResolvedValue({
      song_id: "t2",
      target_profile: "x",
      rationale: "延续怀旧",
      needed_shift: "接住" as const,
    });
    await orc.prefetchMore(1);
    const prefetchCall = (deps.library.prefilter as ReturnType<typeof vi.fn>).mock
      .calls.at(-1) as unknown as [
      string,
      { p: number; a: number; d: number },
      number,
      { moodLocked?: boolean },
    ];
    expect(prefetchCall[0]).toContain("《山丘》");
    expect(prefetchCall[1]).toEqual({ p: 0.2, a: -0.4, d: 0.1 });
    expect(prefetchCall[3].moodLocked).toBe(true);
  });

  it("点歌命中但情绪分析失败：仍播原曲，锚点降级为输入文本", async () => {
    const deps = makeDeps({
      resolvePlayUrl: vi.fn(async () => "http://x/next.mp3"),
      emotion: {
        analyze: vi.fn(async () => {
          throw new Error("emotion down");
        }),
      },
    });
    const track: LibraryTrack = {
      id: "t1",
      path: "/x.mp3",
      origin: "local",
      added_at: 0,
      title: "《山丘》",
    };
    const t2: LibraryTrack = {
      id: "t2",
      path: "/y.mp3",
      origin: "local",
      added_at: 0,
      title: "T2",
    };
    vi.mocked(songIntentMod.resolveSongIntent).mockResolvedValue({
      kind: "song",
      song: track,
      source: "local",
    });
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("《山丘》");
    expect(deps.audio.playFile).toHaveBeenCalledWith("/x.mp3", null);
    expect(orc.getState().kind).toBe("playing");

    (deps.library.prefilter as ReturnType<typeof vi.fn>).mockResolvedValue([t2]);
    (deps.companion.choose as ReturnType<typeof vi.fn>).mockResolvedValue({
      song_id: "t2",
      target_profile: "x",
      rationale: "y",
      needed_shift: "接住" as const,
    });
    await orc.prefetchMore(1);
    const prefetchCall = (deps.library.prefilter as ReturnType<typeof vi.fn>).mock
      .calls.at(-1) as unknown as [string, unknown, number, { moodLocked?: boolean }];
    expect(prefetchCall[0]).toContain("《山丘》");
    expect(prefetchCall[3].moodLocked).toBe(true);
  });

  it("点歌时已有 in-flight turn：先以 skip 收尾，再播放点歌曲目", async () => {
    const deps = makeDeps({
      turnRepo: {
        insertTurn: vi.fn(async () => {}),
        updateTurn: vi.fn(async () => {}),
      },
    });
    const orc = new Orchestrator(deps as any);
    // 第一回合：常规输入走 emotion/companion pipeline，产生 in-flight turn
    await orc.onUserInput("来一首歌");
    expect(deps.turnRepo.insertTurn).toHaveBeenCalledTimes(1);
    // 第二回合：点歌 → 前一回合以 skip 收尾
    vi.mocked(songIntentMod.resolveSongIntent).mockResolvedValue({
      kind: "song",
      song: { id: "t2", path: "/y.mp3", origin: "local", added_at: 0, title: "《山丘》" },
      source: "local",
    });
    await orc.onUserInput("《山丘》");
    expect(deps.turnRepo.insertTurn).toHaveBeenCalledTimes(2);
    expect(deps.turnRepo.updateTurn).toHaveBeenCalled();
    expect(deps.audio.playFile).toHaveBeenLastCalledWith("/y.mp3", null);
  });
});

describe("Orchestrator.onUserInput error paths", () => {
  it("emits error when no candidates found", async () => {
    const deps = makeDeps({ library: { prefilter: vi.fn(async () => []) } });
    const orc = new Orchestrator(deps as any);
    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onUserInput("hi");
    expect(last.kind).toBe("error");
    expect(last.message).toMatch(/搜不到|没搜到/i);
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

describe("Orchestrator.onRetry", () => {
  const chosen = {
    song_id: "t1",
    target_profile: "x",
    rationale: "y",
    needed_shift: "接住" as const,
  };

  it("replays the last text input after an error", async () => {
    const choose = vi
      .fn()
      .mockRejectedValueOnce(new Error("Sensenova 429: throttle"))
      .mockResolvedValueOnce(chosen);
    const deps = makeDeps({ companion: { choose } });
    const orc = new Orchestrator(deps as any);
    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onUserInput("来一首歌");
    expect(last.kind).toBe("error");
    await orc.onRetry();
    expect(last.kind).toBe("playing");
    expect(choose).toHaveBeenCalledTimes(2);
  });

  it("replays lyra-start after an error", async () => {
    const choose = vi
      .fn()
      .mockRejectedValueOnce(new Error("Sensenova 429: throttle"))
      .mockResolvedValueOnce(chosen);
    const deps = makeDeps({ companion: { choose } });
    const orc = new Orchestrator(deps as any);
    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onLyraStart();
    expect(last.kind).toBe("error");
    await orc.onRetry();
    expect(last.kind).toBe("playing");
    expect(choose).toHaveBeenCalledTimes(2);
  });

  it("no-ops when not in the error state", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    expect(orc.getState().kind).toBe("playing");
    await orc.onRetry();
    expect(deps.companion.choose).toHaveBeenCalledTimes(1);
  });
});

describe("Orchestrator T7: reaction capture", () => {
  it("onSkip finalises turn and auto-advances to next song", async () => {
    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("来一首歌");
    expect(orc.getState().kind).toBe("playing");

    // Skip — should finalise the current turn and auto-play next song
    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));
    await orc.onSkip();

    // Should have emitted thinking → playing for the next song
    expect(seen).toEqual(["thinking", "playing"]);

    // updateTurn should have been called with the skipped turn
    expect(updateTurn).toHaveBeenCalled();
    const updatedTurn = (updateTurn.mock.calls[0] as unknown as [DialogueTurn])[0];
    expect(updatedTurn.user_reaction.behavioral.skipped).toBe(true);

    // Should have called companion.choose twice (once for original, once for skip auto-advance)
    expect(deps.companion.choose).toHaveBeenCalledTimes(2);
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

describe("Orchestrator.fulfillProactive", () => {
  const morningIntent = (): import("../proactive/types").ProactiveIntent => ({
    id: "i1",
    createdAt: 1000,
    validUntil: 1000 + 30 * 60_000,
    kind: "morning",
    urgency: 0.5,
    hint: "早上第一次打开",
  });

  it("prefilters + chooses then emits proactive-pending without playing audio", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));

    await orc.fulfillProactive(morningIntent());

    expect(deps.library.prefilter).toHaveBeenCalledOnce();
    expect(deps.companion.choose).toHaveBeenCalledOnce();
    expect(deps.audio.playFile).not.toHaveBeenCalled();
    expect(seen).toEqual(["proactive-pending"]);
    const state = orc.getState();
    expect(state.kind).toBe("proactive-pending");
    if (state.kind === "proactive-pending") {
      expect(state.song.id).toBe("t1");
      expect(state.rationale).toBe("y");
      expect(state.intent.kind).toBe("morning");
    }
  });

  it("no-ops when library is empty", async () => {
    const deps = makeDeps();
    (deps.library as any).prefilter = vi.fn(async () => []);
    const orc = new Orchestrator(deps as any);

    await orc.fulfillProactive(morningIntent());

    expect(deps.companion.choose).not.toHaveBeenCalled();
    expect(orc.getState().kind).toBe("idle");
  });

  it("no-ops when already playing", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来首歌");
    expect(orc.getState().kind).toBe("playing");
    deps.library.prefilter.mockClear();
    deps.companion.choose.mockClear();

    await orc.fulfillProactive(morningIntent());

    expect(deps.library.prefilter).not.toHaveBeenCalled();
    expect(deps.companion.choose).not.toHaveBeenCalled();
    expect(orc.getState().kind).toBe("playing");
  });

  it("setWeatherContext → prefilter 收到携带天气的 recCtx", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    orc.setWeatherContext({ condition: "雨", tempC: 18, source: "api", code: 61 });

    await orc.fulfillProactive(morningIntent());

    expect(deps.library.prefilter).toHaveBeenCalledOnce();
    const recCtx = deps.library.prefilter.mock.calls[0][3] as {
      timeContext?: { weather?: { condition: string; code?: number } };
    };
    expect(recCtx.timeContext?.weather).toMatchObject({ condition: "雨", code: 61 });
  });
});

describe("Orchestrator T2: proactive-pending state", () => {
  it("startProactiveIntent emits proactive-pending WITHOUT playing audio", () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));

    const track: import("../types").LibraryTrack = {
      id: "t1",
      path: "/x.mp3",
      origin: "local",
      added_at: 0,
      title: "T1",
    };
    const intent: import("../proactive/types").ProactiveIntent = {
      id: "i1",
      createdAt: 1000,
      validUntil: 1000 + 30 * 60_000,
      kind: "morning",
      urgency: 0.5,
      hint: "早上第一次打开",
    };

    orc.startProactiveIntent(intent, track, "morning greeting");

    expect(seen).toEqual(["proactive-pending"]);
    expect(deps.audio.playFile).not.toHaveBeenCalled();

    const state = orc.getState();
    expect(state.kind).toBe("proactive-pending");
    if (state.kind === "proactive-pending") {
      expect(state.intent).toBe(intent);
      expect(state.song).toBe(track);
      expect(state.rationale).toBe("morning greeting");
    }
  });

  it("onUserInput after proactive-pending commits the pending turn then processes utterance", async () => {
    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    const track: LibraryTrack = {
      id: "t2",
      path: "/y.mp3",
      origin: "local",
      added_at: 0,
      title: "T2",
    };
    const intent: import("../proactive/types").ProactiveIntent = {
      id: "i1",
      createdAt: 1000,
      validUntil: 1000 + 30 * 60_000,
      kind: "morning",
      urgency: 0.5,
      hint: "早上",
    };

    orc.startProactiveIntent(intent, track, "早上好");
    expect(orc.getState().kind).toBe("proactive-pending");

    // User taps the banner
    await orc.onUserInput("早!");

    // Should now be playing
    expect(orc.getState().kind).toBe("playing");

    // The proactive turn should have been persisted with a latency stamp
    expect(deps.turnRepo.insertTurn).toHaveBeenCalled();
  });

  it("proactive-pending emits stay invisible during regular play", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    expect(orc.getState().kind).toBe("playing");
    // No proactive_pending accessible while playing
    const state = orc.getState();
    expect(state.kind).not.toBe("proactive-pending");
  });
});

describe("Orchestrator auto-advance", () => {
  it("uses endedEmotion verbatim", async () => {
    const deps = makeDeps();
    const updateTurn = vi.fn(async () => {});
    deps.turnRepo = { insertTurn: deps.turnRepo.insertTurn, updateTurn } as any;
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("随便来首歌");
    await orc.onSongComplete();

    expect(deps.turnRepo.insertTurn).toHaveBeenCalledTimes(2);
    const autoTurn = (deps.turnRepo.insertTurn.mock.calls[1] as unknown[])[0] as DialogueTurn;
    // Default mock emotion pad
    expect(autoTurn.current_emotion.pad).toEqual({ p: -0.3, a: -0.2, d: 0 });
  });

  it("auto-advance passes recommendation context that excludes recent plays", async () => {
    const t1: LibraryTrack = { id: "t1", path: "/a.mp3", origin: "local", added_at: 0, title: "T1" };
    const t2: LibraryTrack = { id: "t2", path: "/b.mp3", origin: "local", added_at: 0, title: "T2" };

    (listRecentTurns as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "turn-1",
        timestamp: 1000,
        current_emotion: {
          pad: { p: 0, a: 0, d: 0 },
          labels: [],
          confidence: 0.5,
          source: "emotion-agent-inferred",
        },
        user_utterance: { modality: "text", content: "start" },
        agent_response: { song_id: "t1", rationale: "y" },
        user_reaction: {
          behavioral: { listen_duration_ms: 0, completed: true, skipped: false, repeated: 0, volume_delta: 0 },
          silence_positive: false,
        },
        emotion_delta: { p: 0, a: 0, d: 0 },
      },
    ]);

    const prefilter = vi.fn(
      async (
        _target: unknown,
        _pad: unknown,
        _limit: unknown,
        recCtx?: { excludeIds?: ReadonlySet<string> },
      ) => {
        const all = [t1, t2];
        const exclude = recCtx?.excludeIds;
        return exclude ? all.filter((t) => !exclude.has(t.id)) : all;
      },
    );
    const choose = vi.fn(async (input: { candidates: LibraryTrack[] }) => ({
      song_id: input.candidates[0].id,
      target_profile: "x",
      rationale: "y",
      needed_shift: "接住" as const,
    }));
    const deps = makeDeps({
      library: { prefilter },
      companion: { choose },
    });
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("start");
    expect(deps.audio.playFile).toHaveBeenLastCalledWith("/a.mp3", null);

    await orc.onSongComplete();

    const secondCall = prefilter.mock.calls[1] as unknown as [
      unknown, unknown, unknown, { excludeIds: ReadonlySet<string> },
    ];
    expect(secondCall[3].excludeIds.has("t1")).toBe(true);
    expect(deps.audio.playFile).toHaveBeenLastCalledWith("/b.mp3", null);
  });
});

describe("Orchestrator native auto-advance: rationale never falls back to canned copy", () => {
  const t1: LibraryTrack = { id: "t1", path: "/a.mp3", origin: "local", added_at: 0, title: "T1" };
  const t2: LibraryTrack = { id: "t2", path: "/b.mp3", origin: "local", added_at: 0, title: "T2" };

  function nativeDeps() {
    const tracks: LibraryTrack[] = [t1];
    const prefilter = vi.fn(async () => [...tracks]);
    const choose = vi.fn(async (input: { candidates: LibraryTrack[] }) => {
      const song = input.candidates[input.candidates.length - 1];
      return {
        song_id: song.id,
        target_profile: "x",
        rationale: `${song.id}-rationale`,
        needed_shift: "接住" as const,
      };
    });
    return makeDeps({
      library: { prefilter },
      companion: { choose },
      resolvePlayUrl: vi.fn(async () => "http://x/b.mp3"),
    });
  }

  it("uses the plan rationale when the native song matches the plan head", async () => {
    const deps = nativeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");

    // Prefetch t2 → native queue holds it in the plan
    const tracks: LibraryTrack[] = [t1, t2];
    (deps.library.prefilter as ReturnType<typeof vi.fn>).mockResolvedValue([...tracks]);
    await orc.prefetchMore(1);

    vi.mocked(libraryRepo.getTrack).mockResolvedValue(t2);
    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onNativeAutoAdvanced("t2");

    expect(last?.kind).toBe("playing");
    expect(last.turn.agent_response.rationale).toBe("t2-rationale");
    expect(libraryRepo.getTrack).not.toHaveBeenCalled();
  });

  it("jumps straight to the native-current song when several queued tracks already played", async () => {
    const t3: LibraryTrack = { id: "t3", path: "/c.mp3", origin: "local", added_at: 0, title: "T3" };
    const deps = nativeDeps();
    let pick = 0;
    (deps.companion.choose as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: { candidates: LibraryTrack[] }) => {
        const preferred = ["t2", "t3"][pick++] ?? input.candidates[0]?.id;
        const song =
          input.candidates.find((c) => c.id === preferred) ?? input.candidates[0]!;
        return {
          song_id: song.id,
          target_profile: "x",
          rationale: `${song.id}-rationale`,
          needed_shift: "接住" as const,
        };
      },
    );
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");

    const tracks: LibraryTrack[] = [t1, t2, t3];
    (deps.library.prefilter as ReturnType<typeof vi.fn>).mockResolvedValue([...tracks]);
    // onUserInput already consumed one choose — reset for prefetch picks.
    pick = 0;
    const queued = await orc.prefetchMore(2);
    expect(queued.map((q) => q.songId)).toEqual(["t2", "t3"]);

    // Background already played through t2 — foreground reconciles once to t3.
    await orc.onNativeAutoAdvanced("t3");

    const state = orc.getState();
    expect(state.kind).toBe("playing");
    if (state.kind === "playing") {
      expect(state.song.id).toBe("t3");
      expect(state.turn.agent_response.rationale).toBe("t3-rationale");
    }
    expect(orc.peekNext()).toBeNull();
  });

  it("uses the cached LLM rationale after the plan is cleared (background→foreground)", async () => {
    const deps = nativeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");

    const tracks: LibraryTrack[] = [t1, t2];
    (deps.library.prefilter as ReturnType<typeof vi.fn>).mockResolvedValue([...tracks]);
    await orc.prefetchMore(1);

    // Race that previously produced canned copy: plan cleared while the native
    // queue still holds the prefetched track.
    orc.clearPrefetchedNext();

    vi.mocked(libraryRepo.getTrack).mockResolvedValue(t2);
    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onNativeAutoAdvanced("t2");

    expect(last?.kind).toBe("playing");
    expect(last.turn.agent_response.rationale).toBe("t2-rationale");
    expect(libraryRepo.getTrack).toHaveBeenCalledWith("t2");
  });

  it("generates a fresh LLM rationale when both plan and cache miss", async () => {
    const deps = nativeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");

    // Never prefetched t2 — cache has no entry for it
    vi.mocked(libraryRepo.getTrack).mockResolvedValue(t2);
    const chooseSpy = deps.companion.choose as ReturnType<typeof vi.fn>;
    chooseSpy.mockClear();

    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onNativeAutoAdvanced("t2");

    expect(last?.kind).toBe("playing");
    expect(last.turn.agent_response.rationale).toBe("t2-rationale");
    // A real companion.choose was made with exactly this one candidate
    expect(chooseSpy).toHaveBeenCalledTimes(1);
    const arg = chooseSpy.mock.calls[0][0];
    expect(arg.userUtterance).toBe("");
    expect(arg.candidates.map((c: LibraryTrack) => c.id)).toEqual(["t2"]);
  });

  it("never emits one of the old canned auto-advance phrases", async () => {
    const deps = nativeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");

    vi.mocked(libraryRepo.getTrack).mockResolvedValue(t2);
    let last: any = null;
    orc.subscribe((s) => (last = s));
    await orc.onNativeAutoAdvanced("t2");

    const rationale = last.turn.agent_response.rationale as string;
    expect(rationale).not.toMatch(/先顶上|耳朵别打盹|余温还没散|鼓点已经热好|把房间的空气换一遍|这一拍踩进来/);
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

describe("Orchestrator Sprint 4: perception bias blending", () => {
  it("without setPerceptionBias, companion.choose receives emotion.pad verbatim", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("hi");
    const chooseArg = (deps.companion.choose as any).mock.calls[0][0];
    expect(chooseArg.currentEmotion.pad).toEqual({ p: -0.3, a: -0.2, d: 0 });
  });

  it("setPerceptionBias(bias) blends pad_bias * confidence into next onUserInput", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    orc.setPerceptionBias({
      pad_bias: { p: 0.4, a: -0.2, d: 0.1 },
      confidence: 0.5,
      reason: "test",
    });
    await orc.onUserInput("hi");
    const chooseArg = (deps.companion.choose as any).mock.calls[0][0];
    // Base pad = -0.3, -0.2, 0; bias scaled = 0.2, -0.1, 0.05
    expect(chooseArg.currentEmotion.pad.p).toBeCloseTo(-0.1, 5);
    expect(chooseArg.currentEmotion.pad.a).toBeCloseTo(-0.3, 5);
    expect(chooseArg.currentEmotion.pad.d).toBeCloseTo(0.05, 5);
  });

  it("blended pad is clamped to [-1, 1]", async () => {
    const deps = makeDeps({
      emotion: {
        analyze: vi.fn(async () => ({
          pad: { p: 0.9, a: 0.9, d: -0.9 },
          labels: [],
          confidence: 0.5,
          source: "emotion-agent-inferred",
        }) as CurrentEmotion),
      },
    });
    const orc = new Orchestrator(deps as any);
    orc.setPerceptionBias({
      pad_bias: { p: 1, a: 1, d: -1 },
      confidence: 1,
      reason: "extreme",
    });
    await orc.onUserInput("hi");
    const chooseArg = (deps.companion.choose as any).mock.calls[0][0];
    expect(chooseArg.currentEmotion.pad.p).toBe(1);
    expect(chooseArg.currentEmotion.pad.a).toBe(1);
    expect(chooseArg.currentEmotion.pad.d).toBe(-1);
  });

  it("setPerceptionBias(null) clears an earlier bias", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    orc.setPerceptionBias({
      pad_bias: { p: 0.4, a: 0, d: 0 },
      confidence: 0.5,
      reason: "x",
    });
    orc.setPerceptionBias(null);
    await orc.onUserInput("hi");
    const chooseArg = (deps.companion.choose as any).mock.calls[0][0];
    expect(chooseArg.currentEmotion.pad).toEqual({ p: -0.3, a: -0.2, d: 0 });
  });

  it("emits input_submit / skip / complete on optional eventBus", async () => {
    const emitted: any[] = [];
    const eventBus = { emit: (e: any) => emitted.push(e) };
    const deps = makeDeps({ eventBus });
    const orc = new Orchestrator(deps as any);

    await orc.onUserInput("hello world");
    await orc.onSkip();
    // Reset state for a fresh song we can complete
    await orc.onUserInput("more");
    await orc.onSongComplete();

    const kinds = emitted.map((e) => e.kind);
    expect(kinds).toContain("input_submit");
    expect(kinds).toContain("skip");
    expect(kinds).toContain("complete");

    const inputEv = emitted.find((e) => e.kind === "input_submit");
    expect(inputEv.charCount).toBe("hello world".length);
  });
});

describe("Orchestrator.onReplaySong (history replay)", () => {
  const track = (): LibraryTrack => ({
    id: "t1",
    path: "/x.mp3",
    origin: "local",
    added_at: 0,
    title: "Nuvole Bianche",
    artist: "Ludovico Einaudi",
  });
  const emotion: CurrentEmotion = {
    pad: { p: 0.3, a: 0.1, d: 0.2 },
    labels: ["calm"],
    confidence: 0.8,
    source: "emotion-agent-inferred",
  };

  it("plays the track immediately with rationalePending, then patches live copy", async () => {
    const deps = makeDeps();
    let resolveChoose!: (v: any) => void;
    deps.companion.choose.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveChoose = resolve;
        }),
    );
    const orc = new Orchestrator(deps as any);
    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));

    const done = orc.onReplaySong(track(), "舒缓的旋律，陪你慢下来", emotion);
    await done;

    expect(deps.audio.stop).toHaveBeenCalledOnce();
    expect(deps.audio.playFile).toHaveBeenCalledWith("/x.mp3", null);
    expect(deps.turnRepo.insertTurn).not.toHaveBeenCalled();
    expect(seen).toEqual(["playing"]);
    let state = orc.getState();
    expect(state.kind).toBe("playing");
    if (state.kind === "playing") {
      expect(state.rationalePending).toBe(true);
      expect(state.turn.agent_response.rationale).toBe("");
      expect(state.song.id).toBe("t1");
    }

    await vi.waitFor(() => {
      expect(typeof resolveChoose).toBe("function");
    });
    resolveChoose({
      song_id: "t1",
      target_profile: "x",
      rationale: "此刻重新听，刚好对上心情",
      needed_shift: "陪着" as const,
    });
    await vi.waitFor(() => {
      const s = orc.getState();
      expect(s.kind).toBe("playing");
      if (s.kind === "playing") {
        expect(s.rationalePending).toBeFalsy();
        expect(s.turn.agent_response.rationale).toBe("此刻重新听，刚好对上心情");
      }
    });
  });

  it("falls back to a template when companion rationale fails", async () => {
    const deps = makeDeps();
    deps.companion.choose.mockRejectedValue(new Error("llm down"));
    const orc = new Orchestrator(deps as any);

    await orc.onReplaySong(track(), "旧文案", emotion);
    await vi.waitFor(() => {
      const state = orc.getState();
      expect(state.kind).toBe("playing");
      if (state.kind === "playing") {
        expect(state.rationalePending).toBeFalsy();
        expect(state.turn.agent_response.rationale).toBe(
          "再听一遍《Nuvole Bianche》",
        );
      }
    });
  });

  it("emits an error state when playback fails", async () => {
    const deps = makeDeps();
    deps.audio.playFile.mockRejectedValue(new Error("stream dead"));
    const orc = new Orchestrator(deps as any);

    await orc.onReplaySong(track(), "r", emotion);

    expect(orc.getState().kind).toBe("error");
    expect(deps.turnRepo.insertTurn).not.toHaveBeenCalled();
  });
});

describe("Orchestrator transition serialisation (播放竞态)", () => {
  const t1: LibraryTrack = { id: "t1", path: "/a.mp3", origin: "local", added_at: 0, title: "T1" };
  const t2: LibraryTrack = { id: "t2", path: "/b.mp3", origin: "local", added_at: 0, title: "T2" };
  const t3: LibraryTrack = { id: "t3", path: "/c.mp3", origin: "local", added_at: 0, title: "T3" };

  /** choose 返回 candidates 最后一个；prefilter 尊重 excludeIds。 */
  function raceDeps() {
    const prefilter = vi.fn(
      async (
        _target: unknown,
        _pad: unknown,
        _limit: unknown,
        recCtx?: { excludeIds?: ReadonlySet<string> },
      ) => {
        const all = [t1, t2, t3];
        const exclude = recCtx?.excludeIds;
        return exclude ? all.filter((x) => !exclude.has(x.id)) : all;
      },
    );
    const choose = vi.fn(async (input: { candidates: LibraryTrack[] }) => {
      const song = input.candidates[input.candidates.length - 1];
      return {
        song_id: song.id,
        target_profile: "x",
        rationale: `${song.id}-rationale`,
        needed_shift: "接住" as const,
      };
    });
    return makeDeps({
      library: { prefilter },
      companion: { choose },
      resolvePlayUrl: vi.fn(async () => "http://x/b.mp3"),
    });
  }

  it("concurrent onSongComplete calls auto-advance only once (ended + progress fallback)", async () => {
    const deps = raceDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌"); // playing t3
    expect(orc.getState().kind).toBe("playing");
    deps.audio.playFile.mockClear();

    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));

    // ended 事件 + JS progress 回退同一时刻触发两个 onSongComplete
    await Promise.all([orc.onSongComplete(), orc.onSongComplete()]);

    // 只切一次歌、只闪一次 thinking —— 之前会双 playFile 双切歌
    expect(deps.audio.playFile).toHaveBeenCalledTimes(1);
    expect(seen.filter((k) => k === "thinking")).toHaveLength(1);
    expect(orc.getState().kind).toBe("playing");
  });

  it("stale onSongComplete after native auto-advance is dropped", async () => {
    const deps = raceDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌"); // playing t3
    await orc.prefetchMore(1); // plan = [t2]
    deps.audio.playFile.mockClear();

    // native 先无缝切到 t2（onNativeAutoAdvanced），complete 事件随后到达
    await Promise.all([orc.onNativeAutoAdvanced("t2"), orc.onSongComplete()]);

    // nativeAdvanced 走 plan 同步，不 playFile；过时的 complete 被丢弃
    expect(deps.audio.playFile).not.toHaveBeenCalled();
    expect(orc.getState().kind).toBe("playing");
    expect((orc.getState() as any).song.id).toBe("t2");
  });

  it("stale native event is dropped after JS consumes the same planned song", async () => {
    const deps = raceDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌"); // playing t3
    await orc.prefetchMore(1); // plan = [t2]
    // 即使候选只剩 t1，现存 plan t2 仍应优先于重新推荐。
    (deps.library.prefilter as any).mockResolvedValue([t1]);
    deps.audio.playFile.mockClear();

    // JS 流程先消费 t2，nativeAdvanced(t2) 随后到达。
    await Promise.all([orc.onSongComplete(), orc.onNativeAutoAdvanced("t2")]);

    // nativeAdvanced 对应旧 turn，被 targetTurn 检查丢弃，不会重复切歌。
    expect(deps.audio.playFile).toHaveBeenCalledTimes(1);
    expect(deps.audio.playFile).toHaveBeenCalledWith("http://x/b.mp3", null);
    expect(orc.getState().kind).toBe("playing");
    expect((orc.getState() as any).song.id).toBe("t2");
  });

  it("onSongComplete queued behind onSkip is dropped", async () => {
    const deps = raceDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌"); // playing t3
    deps.audio.playFile.mockClear();
    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));

    await Promise.all([orc.onSkip(), orc.onSongComplete()]);

    // 只有 skip 的 auto-advance 播了歌；complete 过时被丢弃
    expect(deps.audio.playFile).toHaveBeenCalledTimes(1);
    expect(seen.filter((k) => k === "thinking")).toHaveLength(1);
    expect(orc.getState().kind).toBe("playing");
  });

  it("user input queued behind an in-flight auto-advance never double-plays", async () => {
    const deps = raceDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌"); // playing t3
    deps.audio.playFile.mockClear();
    deps.emotion.analyze.mockClear();

    await Promise.all([orc.onSongComplete(), orc.onUserInput("再放一首")]);

    // 两个转换串行、各播一次歌：onSongComplete 的 auto-advance 1 次 +
    // onUserInput 的选歌 1 次；emotion.analyze 只随用户输入触发 1 次。
    expect(orc.getState().kind).toBe("playing");
    expect(deps.audio.playFile).toHaveBeenCalledTimes(2);
    expect(deps.emotion.analyze).toHaveBeenCalledTimes(1);
  });
});

describe("Orchestrator.getLyrics", () => {
  const FULL_LYRICS = [
    "故事的小黄花",
    "从出生那年就飘着",
    "童年的荡秋千",
    "随记忆一直晃到现在",
    "Re So So Si Do Si La",
    "So La Si Si Si Si La Si La So",
    "吹着前奏望着天空",
    "我想起花瓣试着掉落",
    "为你翘课的那一天",
    "花落的那一天",
    "教室的那一间",
    "我怎么看不见",
    "消失的下雨天",
    "我好想再淋一遍",
    "没想到失去的风景",
    "习惯在回忆里看见",
  ].join("\n");

  function playingDeps() {
    const updateTurn = vi.fn(async () => {});
    const listRecentTurns = vi.fn(async () => []);
    const fetch = vi.fn(async () => FULL_LYRICS);
    const deps = makeDeps({
      turnRepo: {
        insertTurn: vi.fn(async () => {}),
        updateTurn,
        listRecentTurns,
      },
      lyrics: { fetch },
    });
    return { deps, updateTurn, listRecentTurns, fetch };
  }

  it("fetches via LLM and persists onto the playing turn", async () => {
    const { deps, updateTurn, fetch } = playingDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("最近有点累");
    expect(orc.getState().kind).toBe("playing");

    const text = await orc.getLyrics();
    expect(text).toBe(FULL_LYRICS);
    expect(fetch).toHaveBeenCalledWith({ title: "T1", artist: undefined });
    expect(updateTurn).toHaveBeenCalledOnce();
    const saved = updateTurn.mock.calls[0]![0] as DialogueTurn;
    expect(saved.agent_response.lyrics).toBe(FULL_LYRICS);

    // Second call hits in-memory cache — no extra LLM.
    fetch.mockClear();
    await expect(orc.getLyrics()).resolves.toBe(FULL_LYRICS);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reuses lyrics from a recent turn with the same song_id", async () => {
    const { deps, updateTurn, listRecentTurns, fetch } = playingDeps();
    listRecentTurns.mockImplementation(async () => [
      {
        id: "older",
        timestamp: 1,
        current_emotion: {
          pad: { p: 0, a: 0, d: 0 },
          labels: [],
          confidence: 1,
          source: "emotion-agent-inferred" as const,
        },
        user_utterance: { modality: "text" as const, content: "x" },
        agent_response: {
          song_id: "t1",
          rationale: "old",
          lyrics: FULL_LYRICS,
        },
        user_reaction: {
          behavioral: {
            listen_duration_ms: 0,
            completed: false,
            skipped: false,
            repeated: 0,
            volume_delta: 0,
          },
          silence_positive: false,
        },
        emotion_delta: { p: 0, a: 0, d: 0 },
      },
    ]);
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("最近有点累");

    await expect(orc.getLyrics()).resolves.toBe(FULL_LYRICS);
    expect(fetch).not.toHaveBeenCalled();
    expect(updateTurn).toHaveBeenCalledOnce();
  });

  it("throws when not playing", async () => {
    const { deps } = playingDeps();
    const orc = new Orchestrator(deps as any);
    await expect(orc.getLyrics()).rejects.toThrow(/playing/i);
  });

  it("force re-fetches even when lyrics are already cached", async () => {
    const { deps, fetch } = playingDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("最近有点累");
    await orc.getLyrics();
    fetch.mockClear();
    fetch.mockResolvedValueOnce(`${FULL_LYRICS}\n尾奏`);

    await expect(orc.getLyrics({ force: true })).resolves.toBe(
      `${FULL_LYRICS}\n尾奏`,
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("Orchestrator play stack (previous)", () => {
  const t1: LibraryTrack = { id: "t1", path: "/a.mp3", origin: "local", added_at: 0, title: "T1" };
  const t2: LibraryTrack = { id: "t2", path: "/b.mp3", origin: "local", added_at: 0, title: "T2" };
  const t3: LibraryTrack = { id: "t3", path: "/c.mp3", origin: "local", added_at: 0, title: "T3" };

  function stackDeps(chooseDelayMs = 0) {
    const prefilter = vi.fn(
      async (
        _target: unknown,
        _pad: unknown,
        _limit: unknown,
        recCtx?: { excludeIds?: ReadonlySet<string> },
      ) => {
        const all = [t1, t2, t3];
        const exclude = recCtx?.excludeIds;
        return exclude ? all.filter((x) => !exclude.has(x.id)) : all;
      },
    );
    const choose = vi.fn(async (input: { candidates: LibraryTrack[] }) => {
      if (chooseDelayMs > 0) {
        await new Promise((r) => setTimeout(r, chooseDelayMs));
      }
      const song = input.candidates[input.candidates.length - 1];
      return {
        song_id: song.id,
        target_profile: "x",
        rationale: `${song.id}-rationale`,
        needed_shift: "接住" as const,
      };
    });
    return makeDeps({
      library: { prefilter },
      companion: { choose },
      idGen: () => `turn-${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  it("onSkip pushes current song; onPrevious restores it", async () => {
    const deps = stackDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    const first = orc.getState();
    expect(first.kind).toBe("playing");
    const firstId = first.kind === "playing" ? first.song.id : "";
    expect(orc.canGoPrevious()).toBe(false);

    await orc.onSkip();
    expect(orc.getState().kind).toBe("playing");
    expect(orc.canGoPrevious()).toBe(true);

    await orc.onPrevious();
    const again = orc.getState();
    expect(again.kind).toBe("playing");
    if (again.kind === "playing") expect(again.song.id).toBe(firstId);
    expect(orc.canGoPrevious()).toBe(false);
  });

  it("keeps the forward queue when going previous, then reuses it on next", async () => {
    const deps = stackDeps();
    deps.resolvePlayUrl = vi.fn(
      async (path: string) => `https://audio.example/${path}`,
    );
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    const first = orc.getState();
    expect(first.kind).toBe("playing");
    const firstId = first.kind === "playing" ? first.song.id : "";

    const queued = await orc.prefetchMore(2);
    expect(queued).toHaveLength(2);
    await orc.onSkip();
    const second = orc.getState();
    expect(second.kind).toBe("playing");
    const secondId = second.kind === "playing" ? second.song.id : "";
    expect(secondId).toBe(queued[0]!.songId);

    await orc.onPrevious();
    const previous = orc.getState();
    expect(previous.kind).toBe("playing");
    if (previous.kind === "playing") expect(previous.song.id).toBe(firstId);
    expect(orc.peekNext()?.songId).toBe(secondId);

    const chooseCallsBeforeForward = deps.companion.choose.mock.calls.length;
    deps.audio.playFile.mockClear();
    await orc.onSkip();
    const forward = orc.getState();
    expect(forward.kind).toBe("playing");
    if (forward.kind === "playing") expect(forward.song.id).toBe(secondId);
    expect(deps.companion.choose).toHaveBeenCalledTimes(
      chooseCallsBeforeForward,
    );
    expect(deps.audio.playFile).toHaveBeenLastCalledWith(
      queued[0]!.url,
      null,
    );
    expect(orc.peekNext()?.songId).toBe(queued[1]!.songId);
  });

  it("native auto-advance records the completed song as previous", async () => {
    const deps = stackDeps();
    deps.resolvePlayUrl = vi.fn(async () => "https://audio.example/next.mp3");
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    const first = orc.getState();
    expect(first.kind).toBe("playing");
    const firstId = first.kind === "playing" ? first.song.id : "";
    const [next] = await orc.prefetchMore(1);

    await orc.onNativeAutoAdvanced(next!.songId);

    expect(orc.peekPrevious()?.songId).toBe(firstId);
    expect(orc.canGoPrevious()).toBe(true);
  });

  it("JS completion consumes the known forward head before recommending", async () => {
    const deps = stackDeps();
    deps.resolvePlayUrl = vi.fn(async () => "https://audio.example/next.mp3");
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    const [next] = await orc.prefetchMore(1);
    const chooseCalls = deps.companion.choose.mock.calls.length;
    deps.audio.playFile.mockClear();

    await orc.onSongComplete();

    const state = orc.getState();
    expect(state.kind).toBe("playing");
    if (state.kind === "playing") expect(state.song.id).toBe(next!.songId);
    expect(deps.companion.choose).toHaveBeenCalledTimes(chooseCalls);
    expect(deps.audio.playFile).toHaveBeenCalledWith(
      next!.url,
      null,
    );
  });

  it("does not reappend the native-current plan head behind its successors", async () => {
    const deps = stackDeps();
    deps.resolvePlayUrl = vi.fn(
      async (path: string) => `https://audio.example/${path}`,
    );
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    const queued = await orc.prefetchMore(2);
    expect(queued).toHaveLength(2);

    // Native already advanced to queued[0], so only queued[1] remains in its
    // AV queue while Orchestrator has not processed nativeAdvanced yet.
    const refill = await orc.prefetchMore(1, [queued[1]!.songId]);

    expect(refill.map((track) => track.songId)).not.toContain(
      queued[0]!.songId,
    );
  });

  it("onPrevious during thinking cancels in-flight advance and restores stack top", async () => {
    const deps = stackDeps(80);
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    const first = orc.getState();
    expect(first.kind).toBe("playing");
    const firstId = first.kind === "playing" ? first.song.id : "";

    const skipPromise = orc.onSkip();
    // Let skip enter thinking + start slow choose
    await vi.waitFor(() => {
      expect(orc.getState().kind).toBe("thinking");
      expect(orc.canGoPrevious()).toBe(true);
    });

    await orc.onPrevious();
    await skipPromise;

    const state = orc.getState();
    expect(state.kind).toBe("playing");
    if (state.kind === "playing") expect(state.song.id).toBe(firstId);
  });

  it("onPrevious during thinking plays without waiting for the in-flight pick", async () => {
    const deps = stackDeps();
    const baseChoose = deps.companion.choose;
    let gatePick = false;
    let releasePick!: () => void;
    const pickGate = new Promise<void>((resolve) => {
      releasePick = resolve;
    });
    deps.companion.choose = vi.fn(async (input: any) => {
      if (gatePick) await pickGate;
      return baseChoose(input);
    });

    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    const first = orc.getState();
    expect(first.kind).toBe("playing");
    const firstId = first.kind === "playing" ? first.song.id : "";

    gatePick = true;
    const skipPromise = orc.onSkip();
    await vi.waitFor(() => {
      expect(orc.getState().kind).toBe("thinking");
    });

    const outcome = await Promise.race([
      orc.onPrevious().then(() => "restored" as const),
      new Promise<"blocked">((resolve) =>
        setTimeout(() => resolve("blocked"), 200),
      ),
    ]);
    expect(outcome).toBe("restored");

    const restored = orc.getState();
    expect(restored.kind).toBe("playing");
    if (restored.kind === "playing") expect(restored.song.id).toBe(firstId);

    releasePick();
    await skipPromise;
    const settled = orc.getState();
    expect(settled.kind).toBe("playing");
    if (settled.kind === "playing") expect(settled.song.id).toBe(firstId);
  });

  it("onPrevious no-ops when stack empty", async () => {
    const orc = new Orchestrator(makeDeps() as any);
    await orc.onPrevious();
    expect(orc.getState().kind).toBe("idle");
    expect(orc.canGoPrevious()).toBe(false);
  });

  it("peekPrevious / peekNext and skip consume prefetched head", async () => {
    const deps = stackDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首歌");
    expect(orc.peekPrevious()).toBeNull();
    expect(orc.canGoNext()).toBe(false);

    // Simulate prefetch filling the native plan via prefetchMore path:
    // inject by skipping once with a hand-rolled queue is hard; instead
    // call prefetchMore with a resolvePlayUrl.
    deps.resolvePlayUrl = vi.fn(async () => "http://x/next.mp3");
    const batch = await orc.prefetchMore(1);
    expect(batch.length).toBe(1);
    expect(orc.canGoNext()).toBe(true);
    expect(orc.peekNext()?.songId).toBe(batch[0]!.songId);
    expect(orc.peekNext()?.title).toBeTruthy();
    expect(orc.peekNext()?.artist).toBeDefined();
    expect(orc.peekNext()?.rationale).toBeTruthy();
    expect(orc.peekNext()?.pad).toEqual(
      expect.objectContaining({ p: expect.any(Number) }),
    );

    const before = orc.getState();
    expect(before.kind).toBe("playing");
    const beforeId = before.kind === "playing" ? before.song.id : "";

    const seen: string[] = [];
    orc.subscribe((s) => seen.push(s.kind));
    await orc.onSkip();

    // Prefetched skip should not flash thinking.
    expect(seen).toEqual(["playing"]);
    expect(orc.peekPrevious()?.songId).toBe(beforeId);
    const after = orc.getState();
    expect(after.kind).toBe("playing");
    if (after.kind === "playing") {
      expect(after.song.id).toBe(batch[0]!.songId);
    }
  });
});

describe("Orchestrator track lock", () => {
  it("setTrackLock binds current song and playCount starts at 1", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    expect(orc.isTrackLockEnabled()).toBe(true);
    expect(orc.getTrackLockPlayCount()).toBe(1);
    const st = orc.getState();
    expect(st.kind).toBe("playing");
    if (st.kind === "playing") {
      expect(st.trackLocked).toBe(true);
    }
  });

  it("onSongComplete while locked replays same song and bumps playCount", async () => {
    const deps = makeDeps({
      turnRepo: {
        insertTurn: vi.fn(async () => {}),
        updateTurn: vi.fn(async () => {}),
      },
    });
    (deps.companion.choose as any)
      .mockResolvedValueOnce({
        song_id: "t1",
        target_profile: "x",
        rationale: "第一遍",
        needed_shift: "接住",
      })
      .mockResolvedValue({
        song_id: "t1",
        target_profile: "x",
        rationale: "第二遍文案",
        needed_shift: "陪着",
      });
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    (deps.audio.playFile as any).mockClear();
    (deps.companion.choose as any).mockClear();

    await orc.onSongComplete();

    expect(deps.audio.playFile).toHaveBeenCalledWith("/x.mp3", null);
    expect(orc.isTrackLockEnabled()).toBe(true);
    expect(orc.getTrackLockPlayCount()).toBe(2);

    await vi.waitFor(() => {
      const chooseArg = (deps.companion.choose as any).mock.calls.at(-1)?.[0];
      expect(chooseArg?.lockPlayCount).toBe(2);
      expect(chooseArg?.candidates).toHaveLength(1);
      expect(chooseArg?.candidates[0].id).toBe("t1");
      expect(chooseArg?.previousSong).toBeUndefined();
    });

    await vi.waitFor(() => {
      const st = orc.getState();
      expect(st.kind).toBe("playing");
      if (st.kind === "playing") {
        expect(st.song.id).toBe("t1");
        expect(st.turn.agent_response.rationale).toBe("第二遍文案");
        expect(st.turn.user_reaction.behavioral.repeated).toBeGreaterThanOrEqual(1);
        expect(st.trackLocked).toBe(true);
        expect(st.rationalePending).toBeFalsy();
      }
    });
  });

  it("retries lock rationale rewrite until companion succeeds (no fallback copy)", async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps({
        turnRepo: {
          insertTurn: vi.fn(async () => {}),
          updateTurn: vi.fn(async () => {}),
        },
      });
      (deps.companion.choose as any)
        .mockResolvedValueOnce({
          song_id: "t1",
          target_profile: "x",
          rationale: "原来的纸条",
          needed_shift: "接住",
        })
        .mockRejectedValueOnce(new Error("llm down"))
        .mockResolvedValueOnce({
          song_id: "t1",
          target_profile: "x",
          rationale: "",
          needed_shift: "陪着",
        })
        .mockResolvedValue({
          song_id: "t1",
          target_profile: "x",
          rationale: "重试后的新文案",
          needed_shift: "陪着",
        });
      const orc = new Orchestrator(deps as any);
      await orc.onUserInput("来一首");
      orc.setTrackLock(true);
      const completeP = orc.onSongComplete();
      await completeP;

      // attempt 1 failed → wait 1s; attempt 2 empty → wait 2s; attempt 3 succeeds
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();

      const st = orc.getState();
      expect(st.kind).toBe("playing");
      if (st.kind === "playing") {
        expect(st.turn.agent_response.rationale).toBe("重试后的新文案");
        expect(st.turn.agent_response.rationale).not.toMatch(/再听一遍/);
        expect(st.trackLocked).toBe(true);
        expect(st.rationalePending).toBeFalsy();
      }
      expect(orc.isTrackLockEnabled()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps trackLocked on playing emits during rationale rewrite", async () => {
    const deps = makeDeps({
      turnRepo: {
        insertTurn: vi.fn(async () => {}),
        updateTurn: vi.fn(async () => {}),
      },
    });
    (deps.companion.choose as any)
      .mockResolvedValueOnce({
        song_id: "t1",
        target_profile: "x",
        rationale: "首句",
        needed_shift: "接住",
      })
      .mockResolvedValue({
        song_id: "t1",
        target_profile: "x",
        rationale: "循环新句",
        needed_shift: "陪着",
      });
    const orc = new Orchestrator(deps as any);
    const lockedFlags: boolean[] = [];
    orc.subscribe((s) => {
      if (s.kind === "playing") lockedFlags.push(Boolean(s.trackLocked));
    });
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    await orc.onSongComplete();
    await vi.waitFor(() => {
      const st = orc.getState();
      expect(st.kind === "playing" && st.turn.agent_response.rationale).toBe(
        "循环新句",
      );
    });
    // After lock is on, every subsequent playing emit must stay locked.
    const afterLock = lockedFlags.slice(
      lockedFlags.findIndex((v) => v === true),
    );
    expect(afterLock.length).toBeGreaterThan(0);
    expect(afterLock.every(Boolean)).toBe(true);
  });

  it("rejects near-duplicate lock rationale and retries until distinct", async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps({
        turnRepo: {
          insertTurn: vi.fn(async () => {}),
          updateTurn: vi.fn(async () => {}),
        },
      });
      (deps.companion.choose as any)
        .mockResolvedValueOnce({
          song_id: "t1",
          target_profile: "x",
          rationale: "钢琴轻轻落下来",
          needed_shift: "接住",
        })
        .mockResolvedValueOnce({
          song_id: "t1",
          target_profile: "x",
          rationale: "钢琴轻轻落下来。",
          needed_shift: "陪着",
        })
        .mockResolvedValue({
          song_id: "t1",
          target_profile: "x",
          rationale: "副歌那一下才把夜色撕开",
          needed_shift: "点燃",
        });
      const orc = new Orchestrator(deps as any);
      await orc.onUserInput("来一首");
      orc.setTrackLock(true);
      await orc.onSongComplete();

      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();

      const st = orc.getState();
      expect(st.kind).toBe("playing");
      if (st.kind === "playing") {
        expect(st.turn.agent_response.rationale).toBe("副歌那一下才把夜色撕开");
        expect(st.trackLocked).toBe(true);
      }
      const chooseArg = (deps.companion.choose as any).mock.calls.at(-1)[0];
      expect(chooseArg.lockRecentRationales?.length).toBeGreaterThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("onSkip clears track lock", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    await orc.onSkip();
    expect(orc.isTrackLockEnabled()).toBe(false);
    expect(orc.getTrackLockPlayCount()).toBe(0);
  });

  it("onUserInput clears track lock", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    await orc.onUserInput("换个心情");
    expect(orc.isTrackLockEnabled()).toBe(false);
  });

  it("onReplaySong clears track lock", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    const track: LibraryTrack = {
      id: "t2",
      path: "/y.mp3",
      origin: "local",
      added_at: 0,
      title: "T2",
    };
    const emotion: CurrentEmotion = {
      pad: { p: 0, a: 0, d: 0 },
      labels: [],
      confidence: 0.5,
      source: "emotion-agent-inferred",
    };
    await orc.onReplaySong(track, "old", emotion);
    expect(orc.isTrackLockEnabled()).toBe(false);
  });
});
