import type { ModelProvider, CurrentEmotion, ChatMessage } from "../types";
import { EMOTION_SYSTEM_PROMPT } from "./prompts/emotion";
import { routeProvider } from "./route";
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
  let s = raw.trim();
  // Strip markdown fences if present
  if (s.startsWith("```")) {
    s = s.replace(/^```(json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    return JSON.parse(s);
  } catch (_err) {
    throw new EmotionAgentError(`bad JSON: ${raw.slice(0, 200)}`);
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
  return { pad: { p, a, d }, labels, confidence, source };
}

export class EmotionAgent {
  private provider: ModelProvider;

  constructor(opts: { provider?: ModelProvider } = {}) {
    this.provider = opts.provider ?? routeProvider("emotion");
  }

  async analyze(input: EmotionInput): Promise<CurrentEmotion> {
    const messages: ChatMessage[] = [
      { role: "system", content: EMOTION_SYSTEM_PROMPT },
      { role: "user", content: input.userUtterance },
    ];
    const res = await this.provider.chat(messages, {
      max_tokens: 400,
      temperature: 0.3,
    });
    const obj = extractJson(res.content);
    return validateEmotion(obj);
  }
}
