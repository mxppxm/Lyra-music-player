import { describe, it, expect, vi } from "vitest";
import { CompanionAgent } from "./CompanionAgent";
import type { ModelProvider, ChatMessage, ChatResponse, SoulState, CurrentEmotion } from "../types";
import type { CompanionInput } from "./types";

const emotion: CurrentEmotion = {
  pad: { p: -0.3, a: -0.2, d: 0.0 },
  labels: ["疲惫"],
  confidence: 0.7,
  source: "emotion-agent-inferred",
};

const soul: SoulState = {
  agent_id: "lyra_001",
  created_at: "2026-07-06",
  musical_taste_base: {
    aesthetic_axes: { restraint_vs_expression: 0.7, narrative_vs_atmospheric: 0.6, polished_vs_raw: -0.3, novelty_seeking: 0.5 },
    affinity_genres: ["post-rock"],
    aversion_signals: [],
    backbone: "b",
  },
  dynamic_mood: { current_pad: { p: 0, a: 0, d: 0 }, attention_to_user: 0.85, recent_bias: "" },
  shared_memory: [],
  evolution_log: [],
  proactive_budget: {
    daily_limit: 3, sulk_until: null,
    kind_budgets: { morning: 1, care: 1, anniversary: 1, share: 1, rhythm: 2 },
  },
};

const candidates = [
  { id: "t1", path: "/tmp/nuvole.mp3", title: "Nuvole Bianche", artist: "Ludovico Einaudi", album: "Una Mattina", duration_ms: 358_000 },
  { id: "t2", path: "/tmp/comptine.mp3", title: "Comptine d'un autre été", artist: "Yann Tiersen", album: "Amelie OST", duration_ms: 143_000 },
];

const validResponse = JSON.stringify({
  song_id: "t1",
  target_profile: "慢速起手,前 20 秒克制的钢琴",
  rationale: "看到希望的抬起",
  needed_shift: "接住",
});

function stub(response: string): ModelProvider {
  return {
    id: "anthropic",
    chat: vi.fn(async (_: ChatMessage[]) => ({ content: response } as ChatResponse)),
  };
}

function stubSequential(...responses: string[]): ModelProvider {
  let call = 0;
  return {
    id: "anthropic",
    chat: vi.fn(async (_: ChatMessage[]) => {
      const r = responses[Math.min(call, responses.length - 1)];
      call++;
      return { content: r } as ChatResponse;
    }),
  };
}

const input: CompanionInput = {
  userUtterance: "最近有点累",
  currentEmotion: emotion,
  soul,
  candidates,
};

describe("CompanionAgent.choose", () => {
  it("returns ChosenSong from valid JSON with matching song_id", async () => {
    const a = new CompanionAgent({ provider: stub(validResponse) });
    const out = await a.choose(input);
    expect(out.song_id).toBe("t1");
    expect(out.rationale).toBe("看到希望的抬起");
    expect(out.needed_shift).toBe("接住");
  });

  it("system prompt includes the Lyra identity brief", async () => {
    const p = stub(validResponse);
    const a = new CompanionAgent({ provider: p });
    await a.choose(input);
    const msgs: ChatMessage[] = (p.chat as any).mock.calls[0][0];
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("Lyra");
  });

  it("user message includes candidates with all four fields", async () => {
    const p = stub(validResponse);
    const a = new CompanionAgent({ provider: p });
    await a.choose(input);
    const msgs: ChatMessage[] = (p.chat as any).mock.calls[0][0];
    expect(msgs[1].content).toContain("t1");
    expect(msgs[1].content).toContain("Nuvole Bianche");
    expect(msgs[1].content).toContain("Ludovico Einaudi");
  });

  it("retries once when song_id is not in candidates and succeeds on retry", async () => {
    const bad = JSON.stringify({
      song_id: "made-up-id",
      target_profile: "x", rationale: "y", needed_shift: "接住",
    });
    const goodRetry = JSON.stringify({
      song_id: "t2",
      target_profile: "x2", rationale: "y2", needed_shift: "点燃",
    });
    const p = stubSequential(bad, goodRetry);
    const a = new CompanionAgent({ provider: p });
    const out = await a.choose(input);
    expect(out.song_id).toBe("t2");
    expect(out.rationale).toBe("y2");
    // Two calls: initial + one retry with correction
    expect((p.chat as any).mock.calls.length).toBe(2);
    // Retry messages include the assistant's bad response + a correction user message
    const retryMsgs: ChatMessage[] = (p.chat as any).mock.calls[1][0];
    expect(retryMsgs[retryMsgs.length - 2].role).toBe("assistant");
    expect(retryMsgs[retryMsgs.length - 1].role).toBe("user");
    expect(retryMsgs[retryMsgs.length - 1].content).toContain("made-up-id");
    expect(retryMsgs[retryMsgs.length - 1].content).toContain("t1");
    expect(retryMsgs[retryMsgs.length - 1].content).toContain("t2");
  });

  it("falls back to lowest-fatigue candidate when retry misses", async () => {
    const bad1 = JSON.stringify({
      song_id: "made-up-1",
      target_profile: "tp1", rationale: "r1", needed_shift: "陪着",
    });
    const bad2 = JSON.stringify({
      song_id: "made-up-2",
      target_profile: "tp2", rationale: "r2", needed_shift: "打断",
    });
    const p = stubSequential(bad1, bad2);
    const a = new CompanionAgent({ provider: p });
    const inputWithRec = {
      ...input,
      recommendation: {
        excludeIds: new Set<string>(),
        fatigueByTrack: new Map([["t1", 0.9], ["t2", 0.1]]),
        recentPlays: [],
        noveltySeeking: 0.5,
        feedbackStats: new Map(),
        soul,
        emotionLabels: [],
      },
    };
    const out = await a.choose(inputWithRec);
    expect(out.song_id).toBe("t2");
    expect(out.rationale).toBe("r2");
    expect(out.target_profile).toBe("tp2");
    expect(out.needed_shift).toBe("打断");
    expect((p.chat as any).mock.calls.length).toBe(2);
  });

  it("coerces unknown needed_shift to '接住'", async () => {
    const weird = JSON.stringify({
      song_id: "t1",
      target_profile: "x", rationale: "y", needed_shift: "flowery-nonsense",
    });
    const a = new CompanionAgent({ provider: stub(weird) });
    const out = await a.choose(input);
    expect(out.needed_shift).toBe("接住");
  });

  it("throws CompanionAgentError on invalid JSON", async () => {
    const a = new CompanionAgent({ provider: stub("not json") });
    await expect(a.choose(input)).rejects.toThrow(/bad JSON/);
  });

  it("user message includes living portrait and top facts when provided", async () => {
    const p = stub(validResponse);
    const a = new CompanionAgent({ provider: p });
    const inputWithMemory = {
      ...input,
      livingPortrait: "她偏爱深夜的宁静，古典钢琴是她的庇护所。",
      topFacts: [
        {
          tags: ["#时段:深夜"],
          conclusion: "慢速古典钢琴",
          confidence: 0.87,
          n: 9,
          lastVerifiedISO: "2026-07-07",
        },
        {
          tags: ["#情绪:疲惫"],
          conclusion: "无人声纯器乐",
          confidence: 0.75,
          n: 5,
          lastVerifiedISO: "2026-07-07",
        },
      ],
    };
    await a.choose(inputWithMemory);
    const msgs: ChatMessage[] = (p.chat as any).mock.calls[0][0];
    const userMsg = msgs[1].content;
    // Portrait block should appear
    expect(userMsg).toContain("你对她的记忆:");
    expect(userMsg).toContain("她偏爱深夜的宁静，古典钢琴是她的庇护所。");
    // Facts block should appear
    expect(userMsg).toContain("你观察到的偏好:");
    expect(userMsg).toContain("#时段:深夜");
    expect(userMsg).toContain("慢速古典钢琴");
    expect(userMsg).toContain("conf: 0.87");
    // Memory block appears BEFORE candidate block
    expect(userMsg.indexOf("你对她的记忆:")).toBeLessThan(userMsg.indexOf("候选歌单("));
  });

  it("includes lock-play brief when lockPlayCount is set", async () => {
    const p = stub(validResponse);
    const a = new CompanionAgent({ provider: p });
    await a.choose({
      ...input,
      candidates: [candidates[0]!],
      lockPlayCount: 3,
      previousRationale: "上一句文案",
      previousSong: { title: "ShouldNotAppear", artist: "X" },
    });
    const msgs: ChatMessage[] = (p.chat as any).mock.calls[0][0];
    const userMsg = msgs[1].content as string;
    expect(userMsg).toMatch(/锁定播放/);
    expect(userMsg).toMatch(/第 3 遍/);
    expect(userMsg).toContain("上一句文案");
    expect(userMsg).not.toMatch(/上一首刚播完/);
  });
});
