/**
 * perception/PerceptionAgent.ts — facade + factory.
 *
 * Since Sprint 7 the concrete inference lives in one of two implementations:
 * - RulePerceptionAgent: deterministic 5-rule agent (Sprint 4). Fallback path.
 * - LLMPerceptionAgent: LLM-driven (Sprint 7 T2), composes rule agent as
 *   fallback for any parse / network / validation failure.
 *
 * The facade exposes the interface + type so callers stay ignorant of which
 * flavor is running. A boot-time setting picks the flavor (Sprint 7 T4).
 */

import type { ModelProvider } from "../types/provider";
import type { BehavioralFeatures } from "./aggregator";
import type { PAD } from "../types";
import { RulePerceptionAgent } from "./RulePerceptionAgent";
import { LLMPerceptionAgent } from "./LLMPerceptionAgent";

export type PerceptionBias = {
  /** Additive PAD bias; all values in [-1, 1] before combining */
  pad_bias: PAD;
  /** 0..1 — how strongly to weight against user utterance */
  confidence: number;
  /** Human-readable trigger explanation */
  reason: string;
};

export interface PerceptionAgent {
  infer(features: BehavioralFeatures): Promise<PerceptionBias>;
}

export type PerceptionMode = "rule" | "llm";

export type CreatePerceptionAgentOpts = {
  /** Which flavor to instantiate. Default "rule". */
  mode?: PerceptionMode;
  /** Required when mode === "llm". Ignored otherwise. */
  provider?: ModelProvider;
};

/**
 * Instantiate the perception agent selected by `opts.mode`.
 *
 * If mode is "llm" and no provider is supplied the LLM path can't be built,
 * so the factory silently returns a rule agent — callers stay simple.
 */
export function createPerceptionAgent(
  opts: CreatePerceptionAgentOpts = {},
): PerceptionAgent {
  const rule = new RulePerceptionAgent();
  if (opts.mode === "llm" && opts.provider) {
    return new LLMPerceptionAgent({
      provider: opts.provider,
      fallback: rule,
    });
  }
  return rule;
}
