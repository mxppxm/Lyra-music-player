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
  { id: "t1", title: "Nuvole Bianche", artist: "Ludovico Einaudi", album: "Una Mattina", duration_ms: 358_000 },
  { id: "t2", title: "Comptine d'un autre été", artist: "Yann Tiersen", album: "Amelie OST", duration_ms: 143_000 },
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

  it("throws when song_id is not in the candidate list", async () => {
    const bad = JSON.stringify({
      song_id: "made-up-id",
      target_profile: "x", rationale: "y", needed_shift: "接住",
    });
    const a = new CompanionAgent({ provider: stub(bad) });
    await expect(a.choose(input)).rejects.toThrow(/song_id/i);
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
});
