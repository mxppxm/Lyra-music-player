import { describe, it, expect, vi } from "vitest";
import { LLMPerceptionAgent } from "./LLMPerceptionAgent";
import { RulePerceptionAgent } from "./RulePerceptionAgent";
import type { BehavioralFeatures } from "./aggregator";
import type { ChatMessage, ChatOptions, ChatResponse, ModelProvider } from "../types";

const WIN = 5 * 60 * 1000;

function base(): BehavioralFeatures {
  return {
    windowMs: WIN,
    activeMs: WIN * 0.3,
    submits: 1,
    avgSubmitGapMs: NaN,
    totalChars: 20,
    skips: 0,
    completions: 0,
    skipRatio: 0,
    proactiveDismisses: 0,
    isBlurred: false,
  };
}

function makeProvider(
  respond: (
    messages: ChatMessage[],
    opts?: ChatOptions,
  ) => Promise<ChatResponse> | ChatResponse,
): ModelProvider {
  return {
    id: "zhipu",
    chat: async (messages, opts) => {
      const r = respond(messages, opts);
      return r instanceof Promise ? r : Promise.resolve(r);
    },
  };
}

describe("LLMPerceptionAgent", () => {
  it("returns validated bias when LLM returns well-formed JSON", async () => {
    const provider = makeProvider(() => ({
      content: JSON.stringify({
        pad_bias: { p: -0.2, a: 0.1, d: 0 },
        confidence: 0.6,
        reason: "跳过率偏高，可能烦躁",
      }),
    }));
    const agent = new LLMPerceptionAgent({
      provider,
      fallback: new RulePerceptionAgent(),
    });
    const bias = await agent.infer(base());
    expect(bias.pad_bias.p).toBe(-0.2);
    expect(bias.pad_bias.a).toBe(0.1);
    expect(bias.confidence).toBe(0.6);
    expect(bias.reason).toBe("跳过率偏高，可能烦躁");
  });

  it("strips markdown fence and still parses", async () => {
    const provider = makeProvider(() => ({
      content: "```json\n" +
        JSON.stringify({
          pad_bias: { p: 0.1, a: 0, d: 0 },
          confidence: 0.4,
          reason: "轻微投入",
        }) +
        "\n```",
    }));
    const agent = new LLMPerceptionAgent({
      provider,
      fallback: new RulePerceptionAgent(),
    });
    const bias = await agent.infer(base());
    expect(bias.confidence).toBe(0.4);
  });

  it("falls back to rule agent on invalid JSON", async () => {
    const provider = makeProvider(() => ({ content: "not json at all" }));
    const fallback = new RulePerceptionAgent();
    const fallbackSpy = vi.spyOn(fallback, "infer");
    const agent = new LLMPerceptionAgent({ provider, fallback });
    // Features that fire rule 4 in the rule agent
    const bias = await agent.infer({ ...base(), proactiveDismisses: 3 });
    expect(fallbackSpy).toHaveBeenCalledOnce();
    expect(bias.reason).toContain("user dismissing");
  });

  it("falls back to rule agent on schema violation (pad_bias out of range)", async () => {
    const provider = makeProvider(() => ({
      content: JSON.stringify({
        pad_bias: { p: 5, a: 0, d: 0 },
        confidence: 0.5,
        reason: "bogus",
      }),
    }));
    const fallback = new RulePerceptionAgent();
    const fallbackSpy = vi.spyOn(fallback, "infer");
    const agent = new LLMPerceptionAgent({ provider, fallback });
    await agent.infer(base());
    expect(fallbackSpy).toHaveBeenCalledOnce();
  });

  it("falls back to rule agent when provider throws", async () => {
    const provider = makeProvider(() => {
      throw new Error("network down");
    });
    const fallback = new RulePerceptionAgent();
    const fallbackSpy = vi.spyOn(fallback, "infer");
    const agent = new LLMPerceptionAgent({ provider, fallback });
    await agent.infer(base());
    expect(fallbackSpy).toHaveBeenCalledOnce();
  });

  it("falls back on confidence out of range", async () => {
    const provider = makeProvider(() => ({
      content: JSON.stringify({
        pad_bias: { p: 0, a: 0, d: 0 },
        confidence: 1.5,
        reason: "x",
      }),
    }));
    const fallback = new RulePerceptionAgent();
    const fallbackSpy = vi.spyOn(fallback, "infer");
    const agent = new LLMPerceptionAgent({ provider, fallback });
    await agent.infer(base());
    expect(fallbackSpy).toHaveBeenCalledOnce();
  });

  it("times out and falls back when provider stalls", async () => {
    const provider = makeProvider(
      () =>
        new Promise<ChatResponse>(() => {
          /* never resolves */
        }),
    );
    const fallback = new RulePerceptionAgent();
    const fallbackSpy = vi.spyOn(fallback, "infer");
    const agent = new LLMPerceptionAgent({
      provider,
      fallback,
      timeoutMs: 40,
    });
    await agent.infer(base());
    expect(fallbackSpy).toHaveBeenCalledOnce();
  });

  it("supplies empty-reason default when reason is missing/blank", async () => {
    const provider = makeProvider(() => ({
      content: JSON.stringify({
        pad_bias: { p: 0, a: 0, d: 0 },
        confidence: 0,
      }),
    }));
    const agent = new LLMPerceptionAgent({
      provider,
      fallback: new RulePerceptionAgent(),
    });
    const bias = await agent.infer(base());
    expect(bias.reason).toBe("no reason given");
  });
});
