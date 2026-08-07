import { describe, it, expect, vi } from "vitest";
import { ReflectAgent, ReflectAgentError } from "./ReflectAgent";
import type { ModelProvider, ChatMessage, ChatResponse } from "../types";
import type { ReflectInput } from "./ReflectAgent";
import type { ParsedMemory } from "../memory/types";

function stubProvider(response: string): ModelProvider {
  return {
    id: "anthropic",
    chat: vi.fn(async (_msgs: ChatMessage[]) => ({ content: response } as ChatResponse)),
  };
}

const emptyMemory: ParsedMemory = {
  facts: [],
  aversions: [],
  salientMoments: [],
  livingPortrait: { paragraphs: [] },
  dreams: [],
  evolutions: [],
  ourSongs: [],
  raw: "",
};

const baseInput: ReflectInput = {
  recentTurns: [],
  currentMemory: emptyMemory,
  todayISO: "2026-07-07",
};

const validResult = {
  livingPortrait: "她是一个安静的人。\n\n最近她在慢慢整理自己。",
  factMutations: [
    { op: "add", tags: ["#时段:深夜"], conclusion: "慢速古典钢琴", startConfidence: 0.6 },
  ],
  dreamNarrative: "昨夜我看见她坐在窗边，窗外下着雨。",
};

describe("ReflectAgent.run", () => {
  it("returns ReflectResult parsed from valid JSON", async () => {
    const p = stubProvider(JSON.stringify(validResult));
    const agent = new ReflectAgent({ provider: p });
    const out = await agent.run(baseInput);
    expect(out.livingPortrait).toBe(validResult.livingPortrait);
    expect(out.factMutations).toHaveLength(1);
    expect(out.factMutations[0]).toMatchObject({ op: "add", conclusion: "慢速古典钢琴" });
    expect(out.dreamNarrative).toBe(validResult.dreamNarrative);
  });

  it("strips markdown fences before parsing", async () => {
    const fenced =
      "```json\n" + JSON.stringify(validResult) + "\n```";
    const p = stubProvider(fenced);
    const agent = new ReflectAgent({ provider: p });
    const out = await agent.run(baseInput);
    expect(out.dreamNarrative).toBe(validResult.dreamNarrative);
  });

  it("uses max_tokens 8192 and temperature 0.5", async () => {
    const p = stubProvider(JSON.stringify(validResult));
    const agent = new ReflectAgent({ provider: p });
    await agent.run(baseInput);
    const call = (p.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const opts = call[1];
    expect(opts.max_tokens).toBe(8192);
    expect(opts.temperature).toBe(0.5);
  });

  it("sends system prompt and user message", async () => {
    const p = stubProvider(JSON.stringify(validResult));
    const agent = new ReflectAgent({ provider: p });
    await agent.run(baseInput);
    const call = (p.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const messages: ChatMessage[] = call[0];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Lyra 的反思核心");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("todayISO: 2026-07-07");
  });

  it("throws ReflectAgentError on invalid JSON", async () => {
    const p = stubProvider("not json at all");
    const agent = new ReflectAgent({ provider: p });
    await expect(agent.run(baseInput)).rejects.toThrow(ReflectAgentError);
    await expect(agent.run(baseInput)).rejects.toThrow(/bad JSON/);
  });

  it("throws when livingPortrait is missing", async () => {
    const bad = { factMutations: [], dreamNarrative: "some dream" };
    const p = stubProvider(JSON.stringify(bad));
    const agent = new ReflectAgent({ provider: p });
    await expect(agent.run(baseInput)).rejects.toThrow(ReflectAgentError);
    await expect(agent.run(baseInput)).rejects.toThrow(/livingPortrait/);
  });

  it("throws when factMutations is missing", async () => {
    const bad = { livingPortrait: "portrait text", dreamNarrative: "some dream" };
    const p = stubProvider(JSON.stringify(bad));
    const agent = new ReflectAgent({ provider: p });
    await expect(agent.run(baseInput)).rejects.toThrow(ReflectAgentError);
    await expect(agent.run(baseInput)).rejects.toThrow(/factMutations/);
  });

  it("throws when dreamNarrative is missing", async () => {
    const bad = { livingPortrait: "portrait text", factMutations: [] };
    const p = stubProvider(JSON.stringify(bad));
    const agent = new ReflectAgent({ provider: p });
    await expect(agent.run(baseInput)).rejects.toThrow(ReflectAgentError);
    await expect(agent.run(baseInput)).rejects.toThrow(/dreamNarrative/);
  });

  it("throws on invalid factMutation op", async () => {
    const bad = {
      livingPortrait: "portrait",
      factMutations: [{ op: "delete", tags: ["#x"], conclusion: "y" }],
      dreamNarrative: "dream",
    };
    const p = stubProvider(JSON.stringify(bad));
    const agent = new ReflectAgent({ provider: p });
    await expect(agent.run(baseInput)).rejects.toThrow(ReflectAgentError);
    await expect(agent.run(baseInput)).rejects.toThrow(/invalid op/);
  });

  it("throws when adjust mutation is missing newConfidence", async () => {
    const bad = {
      livingPortrait: "portrait",
      factMutations: [{ op: "adjust", tags: ["#x"], conclusion: "y" }],
      dreamNarrative: "dream",
    };
    const p = stubProvider(JSON.stringify(bad));
    const agent = new ReflectAgent({ provider: p });
    await expect(agent.run(baseInput)).rejects.toThrow(ReflectAgentError);
    await expect(agent.run(baseInput)).rejects.toThrow(/newConfidence/);
  });

  describe("perception_tuning (Sprint 8 T4)", () => {
    it("passes through valid tuning after clamping", async () => {
      const payload = {
        ...validResult,
        perception_tuning: { skipRatio: 0.5, dismissThreshold: 3 },
      };
      const p = stubProvider(JSON.stringify(payload));
      const agent = new ReflectAgent({ provider: p });
      const out = await agent.run(baseInput);
      expect(out.perceptionTuning).toEqual({ skipRatio: 0.5, dismissThreshold: 3 });
    });

    it("clamps runaway values into ±50% band", async () => {
      const payload = {
        ...validResult,
        perception_tuning: { dismissThreshold: 999 },
      };
      const p = stubProvider(JSON.stringify(payload));
      const agent = new ReflectAgent({ provider: p });
      const out = await agent.run(baseInput);
      // default 2, clamped to 2 * 1.5 = 3
      expect(out.perceptionTuning?.dismissThreshold).toBe(3);
    });

    it("omits perceptionTuning entirely when field absent", async () => {
      const p = stubProvider(JSON.stringify(validResult));
      const agent = new ReflectAgent({ provider: p });
      const out = await agent.run(baseInput);
      expect(out.perceptionTuning).toBeUndefined();
    });

    it("drops malformed tuning (all non-numeric) silently", async () => {
      const payload = {
        ...validResult,
        perception_tuning: { skipRatio: "wrong", dismissThreshold: null },
      };
      const p = stubProvider(JSON.stringify(payload));
      const agent = new ReflectAgent({ provider: p });
      const out = await agent.run(baseInput);
      expect(out.perceptionTuning).toBeUndefined();
    });

    it("renders recentPerception into the user message", async () => {
      const p = stubProvider(JSON.stringify(validResult));
      const agent = new ReflectAgent({ provider: p });
      await agent.run({
        ...baseInput,
        recentPerception: [
          { ts: 1720000000000, source: "rule", reason: "high skip ratio", confidence: 0.5 },
        ],
      });
      const call = (p.chat as ReturnType<typeof vi.fn>).mock.calls[0];
      const userContent = (call[0] as ChatMessage[])[1].content;
      expect(userContent).toContain("感知层最近观测");
      expect(userContent).toContain("high skip ratio");
    });

    it("renders 暂无 placeholder when no perception observations supplied", async () => {
      const p = stubProvider(JSON.stringify(validResult));
      const agent = new ReflectAgent({ provider: p });
      await agent.run(baseInput);
      const call = (p.chat as ReturnType<typeof vi.fn>).mock.calls[0];
      const userContent = (call[0] as ChatMessage[])[1].content;
      expect(userContent).toContain("感知层最近观测");
      expect(userContent).toContain("(暂无)");
    });
  });
});
