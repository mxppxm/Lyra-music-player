import type { ModelProvider, CurrentEmotion, ChatMessage } from "../types";
import { EMOTION_SYSTEM_PROMPT } from "./prompts/emotion";
import { writeTrace } from "../reasoning/writeTrace";
import { resolveProviders, chatWithFallback } from "./route";
import { parseLooseJson } from "../lib/parseLooseJson";
import type { EmotionInput } from "./types";

export class EmotionAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmotionAgentError";
  }
}

const IN_RANGE = (n: unknown): n is number =>
  typeof n === "number" && n >= -1 && n <= 1;

function extractJson(raw: string): unknown {
  try {
    return parseLooseJson(raw);
  } catch {
    const preview = raw.length === 0 ? "<empty>" : raw.slice(0, 200);
    throw new EmotionAgentError(`bad JSON: ${preview}`);
  }
}

function validateEmotion(obj: unknown): CurrentEmotion {
  if (typeof obj !== "object" || obj === null) {
    throw new EmotionAgentError("bad JSON: expected object");
  }
  const o = obj as Record<string, unknown>;
  const pad = o.pad as Record<string, unknown> | undefined;
  if (!pad || typeof pad !== "object") {
    throw new EmotionAgentError("missing pad field");
  }
  const p = pad.p, a = pad.a, d = pad.d;
  if (!IN_RANGE(p) || !IN_RANGE(a) || !IN_RANGE(d)) {
    throw new EmotionAgentError(
      `pad values out of range [-1, 1]: ${JSON.stringify(pad)}`,
    );
  }
  const labels = Array.isArray(o.labels)
    ? o.labels.filter((l): l is string => typeof l === "string")
    : [];
  const confidence =
    typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1
      ? o.confidence
      : 0.5;
  const source =
    o.source === "user-declared" || o.source === "ring-signal"
      ? o.source
      : "emotion-agent-inferred";

  return {
    pad: { p, a, d },
    labels,
    confidence,
    source,
  };
}

export class EmotionAgent {
  private providers: ModelProvider[];

  constructor(opts: { provider?: ModelProvider } = {}) {
    this.providers = opts.provider
      ? [opts.provider]
      : resolveProviders("emotion");
  }

  async analyze(input: EmotionInput): Promise<CurrentEmotion> {
    const messages: ChatMessage[] = [
      { role: "system", content: EMOTION_SYSTEM_PROMPT },
      { role: "user", content: input.userUtterance },
    ];
    const t0 = performance.now();
    // chatWithFallback: retries each provider with backoff, then walks down
    // the chain (fxb → deepseek) instead of failing the turn on one flake.
    const res = await chatWithFallback(this.providers, messages, {
      // Raised from 400 → 2048 because GLM-5.x reasoning models can burn the
      // whole budget in `reasoning_content` before writing `content`. Emotion
      // JSON output is small (<500 tokens); the headroom is free (it's a cap,
      // not consumption).
      max_tokens: 8192,
      temperature: 0.3,
      response_format: { type: "json_object" },
      // Emotion analysis doesn't benefit from chain-of-thought; disable it on
      // Zhipu GLM-5.x so `content` is generated directly (faster + cheaper).
      // Other providers ignore this option.
      enable_thinking: false,
      agent: "emotion",
    });
    const duration_ms = Math.round(performance.now() - t0);
    try {
      const obj = extractJson(res.content);
      const parsed = validateEmotion(obj);
      writeTrace({
        agent_kind: "emotion",
        prompt_text: input.userUtterance,
        raw_response: res.content,
        parsed_json: parsed,
        duration_ms,
      });
      return parsed;
    } catch (err) {
      // Persist the failure so DataExplorer 推理轨迹 tab can show the raw
      // response when parse/validate fails — otherwise the raw is invisible
      // to the user and we can only guess at the root cause.
      const errMessage = err instanceof Error ? err.message : String(err);
      writeTrace({
        agent_kind: "emotion",
        prompt_text: input.userUtterance,
        raw_response: res.content,
        parsed_json: { __parse_error__: errMessage, raw_len: res.content.length },
        duration_ms,
      });
      console.error(
        `[lyra] EmotionAgent parse failed (raw_len=${res.content.length}, provider=${this.providers.map((p) => p.id).join("→")}):`,
        errMessage,
        "| raw content:",
        JSON.stringify(res.content),
        "| provider raw payload:",
        res.raw,
      );
      throw err;
    }
  }
}
