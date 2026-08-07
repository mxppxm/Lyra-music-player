/**
 * perception/LLMPerceptionAgent.ts — LLM-driven PerceptionBias inference
 * (Sprint 7 T2).
 *
 * Wraps a ModelProvider (Zhipu / DeepSeek via routeProvider("perception")).
 * Any failure — network, JSON parse, schema validation — delegates the
 * inference to the injected fallback agent. This never throws to callers.
 */

import type { ChatMessage, ModelProvider } from "../types";
import { writeTrace } from "../reasoning/writeTrace";
import { resolveProviders, chatWithFallback } from "../agents/route";
import type { BehavioralFeatures } from "./aggregator";
import type { PerceptionAgent, PerceptionBias } from "./PerceptionAgent";
import {
  PERCEPTION_SYSTEM_PROMPT,
  buildPerceptionUserContent,
} from "./prompt";

const IN_PAD_RANGE = (n: unknown): n is number =>
  typeof n === "number" && n >= -1 && n <= 1;
const IN_CONF_RANGE = (n: unknown): n is number =>
  typeof n === "number" && n >= 0 && n <= 1;

function extractJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return JSON.parse(s);
}

function validate(obj: unknown): PerceptionBias {
  if (typeof obj !== "object" || obj === null) {
    throw new Error("expected object");
  }
  const o = obj as Record<string, unknown>;
  const bias = o.pad_bias as Record<string, unknown> | undefined;
  if (!bias) throw new Error("missing pad_bias");
  const { p, a, d } = bias;
  if (!IN_PAD_RANGE(p) || !IN_PAD_RANGE(a) || !IN_PAD_RANGE(d)) {
    throw new Error("pad_bias out of range");
  }
  if (!IN_CONF_RANGE(o.confidence)) {
    throw new Error("confidence out of range");
  }
  const reason =
    typeof o.reason === "string" && o.reason.length > 0
      ? o.reason
      : "no reason given";
  return {
    pad_bias: { p, a, d },
    confidence: o.confidence,
    reason,
  };
}

export type LLMPerceptionAgentOptions = {
  provider: ModelProvider;
  fallback: PerceptionAgent;
  /** Chat timeout for a single infer call. Default 10s. */
  timeoutMs?: number;
};

export class LLMPerceptionAgent implements PerceptionAgent {
  private providers: ModelProvider[];
  private fallback: PerceptionAgent;
  private timeoutMs: number;

  constructor(opts: LLMPerceptionAgentOptions) {
    this.providers = opts.provider
      ? [opts.provider]
      : resolveProviders("perception");
    this.fallback = opts.fallback;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async infer(features: BehavioralFeatures): Promise<PerceptionBias> {
    const userContent = buildPerceptionUserContent(features);
    try {
      const messages: ChatMessage[] = [
        { role: "system", content: PERCEPTION_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ];
      const t0 = performance.now();
      const chatPromise = chatWithFallback(this.providers, messages, {
        max_tokens: 2048,
        temperature: 0.2,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("perception LLM timeout")),
          this.timeoutMs,
        );
      });
      const res = await Promise.race([chatPromise, timeoutPromise]);
      const parsed = extractJson(res.content);
      const validated = validate(parsed);
      writeTrace({
        agent_kind: "perception",
        prompt_text: userContent,
        raw_response: res.content,
        parsed_json: validated,
        duration_ms: Math.round(performance.now() - t0),
      });
      return validated;
    } catch (err) {
      // Any failure — network, JSON, schema — hands off to the rule agent.
      // This is intentional: perception must never break the tick loop.
      console.debug("[lyra] LLM perception fell back to rule:", err);
      return this.fallback.infer(features);
    }
  }
}
