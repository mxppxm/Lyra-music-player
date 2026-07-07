import { describe, it, expect, vi } from "vitest";
import { EmotionAgent } from "./EmotionAgent";
import type { ModelProvider, ChatMessage, ChatResponse } from "../types";

function stubProvider(response: string): ModelProvider {
  return {
    id: "deepseek",
    chat: vi.fn(async (_: ChatMessage[]) => ({ content: response } as ChatResponse)),
  };
}

describe("EmotionAgent.analyze", () => {
  it("returns CurrentEmotion parsed from valid JSON", async () => {
    const p = stubProvider(
      JSON.stringify({
        pad: { p: -0.3, a: -0.2, d: 0.0 },
        labels: ["疲惫", "轻微焦虑"],
        confidence: 0.75,
        source: "emotion-agent-inferred",
      }),
    );
    const agent = new EmotionAgent({ provider: p });
    const out = await agent.analyze({ userUtterance: "最近有点累" });
    expect(out.pad).toEqual({ p: -0.3, a: -0.2, d: 0.0 });
    expect(out.labels).toEqual(["疲惫", "轻微焦虑"]);
    expect(out.confidence).toBe(0.75);
    expect(out.source).toBe("emotion-agent-inferred");
  });

  it("sends the system prompt + user message to the provider", async () => {
    const p = stubProvider(
      JSON.stringify({ pad: { p: 0, a: 0, d: 0 }, labels: [], confidence: 0.5, source: "emotion-agent-inferred" }),
    );
    const agent = new EmotionAgent({ provider: p });
    await agent.analyze({ userUtterance: "hello" });
    const call = (p.chat as any).mock.calls[0];
    const messages: ChatMessage[] = call[0];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Lyra's emotion perception");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("hello");
  });

  it("throws EmotionAgentError on invalid JSON", async () => {
    const p = stubProvider("not json at all");
    const agent = new EmotionAgent({ provider: p });
    await expect(agent.analyze({ userUtterance: "x" })).rejects.toThrow(/bad JSON/);
  });

  it("throws when JSON shape is wrong (missing pad)", async () => {
    const p = stubProvider(JSON.stringify({ labels: [], confidence: 0.5 }));
    const agent = new EmotionAgent({ provider: p });
    await expect(agent.analyze({ userUtterance: "x" })).rejects.toThrow(/pad/i);
  });

  it("throws when pad values are out of [-1, 1]", async () => {
    const p = stubProvider(
      JSON.stringify({
        pad: { p: 5, a: 0, d: 0 },
        labels: [],
        confidence: 0.5,
        source: "emotion-agent-inferred",
      }),
    );
    const agent = new EmotionAgent({ provider: p });
    await expect(agent.analyze({ userUtterance: "x" })).rejects.toThrow(/range/i);
  });

  it("strips leading/trailing whitespace and markdown fences before parsing", async () => {
    const p = stubProvider(
      "```json\n" +
        JSON.stringify({ pad: { p: 0, a: 0, d: 0 }, labels: [], confidence: 0.5, source: "emotion-agent-inferred" }) +
        "\n```",
    );
    const agent = new EmotionAgent({ provider: p });
    const out = await agent.analyze({ userUtterance: "x" });
    expect(out.confidence).toBe(0.5);
  });

  it("passes through a valid predicted_trajectory", async () => {
    const p = stubProvider(
      JSON.stringify({
        pad: { p: 0.1, a: 0.2, d: 0.0 },
        labels: ["平静"],
        confidence: 0.8,
        source: "emotion-agent-inferred",
        predicted_trajectory: {
          horizon_min: 30,
          predicted_pad: { p: -0.5, a: -0.6, d: -0.1 },
        },
      }),
    );
    const agent = new EmotionAgent({ provider: p });
    const out = await agent.analyze({ userUtterance: "我准备去睡觉了" });
    expect(out.predicted_trajectory).toEqual({
      horizon_min: 30,
      predicted_pad: { p: -0.5, a: -0.6, d: -0.1 },
    });
  });

  it("drops predicted_trajectory when horizon_min is out of range (malformed)", async () => {
    const p = stubProvider(
      JSON.stringify({
        pad: { p: 0.1, a: 0.2, d: 0.0 },
        labels: ["平静"],
        confidence: 0.8,
        source: "emotion-agent-inferred",
        predicted_trajectory: {
          horizon_min: 200, // out of [5, 120]
          predicted_pad: { p: -0.5, a: -0.6, d: -0.1 },
        },
      }),
    );
    const agent = new EmotionAgent({ provider: p });
    const out = await agent.analyze({ userUtterance: "x" });
    expect(out.predicted_trajectory).toBeUndefined();
  });

  it("missing predicted_trajectory is fine — field absent on result", async () => {
    const p = stubProvider(
      JSON.stringify({
        pad: { p: 0.0, a: 0.0, d: 0.0 },
        labels: [],
        confidence: 0.5,
        source: "emotion-agent-inferred",
      }),
    );
    const agent = new EmotionAgent({ provider: p });
    const out = await agent.analyze({ userUtterance: "x" });
    expect(out.predicted_trajectory).toBeUndefined();
  });
});
