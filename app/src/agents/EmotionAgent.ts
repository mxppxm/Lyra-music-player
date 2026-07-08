import type { ModelProvider, CurrentEmotion, ChatMessage } from "../types";
import { EMOTION_SYSTEM_PROMPT } from "./prompts/emotion";
import { writeTrace } from "../reasoning/writeTrace";
import { routeProvider } from "./route";
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

  // Validate optional predicted_trajectory; drop (don't throw) if malformed
  let predicted_trajectory: CurrentEmotion["predicted_trajectory"] | undefined;
  if (o.predicted_trajectory !== undefined) {
    const pt = o.predicted_trajectory as Record<string, unknown>;
    const horizonMin = pt.horizon_min;
    const predictedPad = pt.predicted_pad as Record<string, unknown> | undefined;
    const validHorizon =
      typeof horizonMin === "number" &&
      Number.isInteger(horizonMin) &&
      horizonMin >= 5 &&
      horizonMin <= 120;
    const pp = predictedPad?.p, pa = predictedPad?.a, pd = predictedPad?.d;
    const validPad =
      predictedPad !== undefined &&
      typeof predictedPad === "object" &&
      IN_RANGE(pp) && IN_RANGE(pa) && IN_RANGE(pd);
    if (validHorizon && validPad) {
      predicted_trajectory = {
        horizon_min: horizonMin as number,
        predicted_pad: { p: pp as number, a: pa as number, d: pd as number },
      };
    }
    // else: silently drop malformed field
  }

  return {
    pad: { p, a, d },
    labels,
    confidence,
    source,
    ...(predicted_trajectory !== undefined ? { predicted_trajectory } : {}),
  };
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
    const t0 = performance.now();
    const res = await this.provider.chat(messages, {
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: "json_object" },
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
        `[lyra] EmotionAgent parse failed (raw_len=${res.content.length}, provider=${this.provider.id}):`,
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
